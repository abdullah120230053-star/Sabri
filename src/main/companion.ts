import express from "express";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createServer, type Server } from "node:http";
import { createServer as createSecureServer } from "node:https";
import { networkInterfaces } from "node:os";
import { join } from "node:path";
import { WebSocket, WebSocketServer } from "ws";
import QRCode from "qrcode";
import { z } from "zod";
import {
  applyPhoneOperations,
  deviceSchema,
  pairRequest,
  phonePushSchema,
  phoneSnapshot,
  pushSubscriptionSchema,
  type PairInfo,
  type SyncInfo,
} from "../shared/phone";
import { Storage } from "./storage";
import { PhoneCertificates } from "./phone-certificates";
import { PhonePush } from "./phone-push";
import type { State } from "../shared/schema";

type Device = z.infer<typeof deviceSchema>;
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const random = () => randomBytes(32).toString("base64url");
export function isPrivateAddress(input: string) {
  const ip = input.replace(/^::ffff:/i, "");
  const values = ip.split(".").map(Number);
  if (
    values.length !== 4 ||
    values.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  )
    return false;
  return (
    values[0] === 10 ||
    values[0] === 127 ||
    (values[0] === 192 && values[1] === 168) ||
    (values[0] === 172 && values[1]! >= 16 && values[1]! <= 31)
  );
}
export const selectAddress = () =>
  Object.entries(networkInterfaces())
    .sort(([a], [b]) => {
      const preferred = (name: string) =>
        Number(
          /wi-?fi|ethernet|wireless/i.test(name) &&
            !/virtual|vmware|hyper-v|wsl|vethernet/i.test(name),
        );
      return preferred(b) - preferred(a);
    })
    .flatMap(([, values]) => values ?? [])
    .find(
      (info) =>
        info.family === "IPv4" &&
        !info.internal &&
        isPrivateAddress(info.address),
    )?.address;
const publicDevice = ({ id, name, canEdit, createdAt, push }: Device) => ({
  id,
  name,
  canEdit,
  createdAt,
  pushEnabled: !!push,
});

export class Companion {
  private devices: Device[] = [];
  private writes: Promise<unknown> = Promise.resolve();
  private server?: Server;
  private webSockets?: WebSocketServer;
  private sockets = new Map<WebSocket, string>();
  private host?: string;
  private pin?: string;
  private pairing?: { hash: string; expires: number };
  private rates = new Map<string, { expires: number; attempts: number }>();
  private unsubscribe?: () => void;
  private startTask?: Promise<SyncInfo>;
  readonly certificates: PhoneCertificates;
  private readonly push: PhonePush;
  constructor(
    private readonly storage: Storage,
    private readonly webFiles: string,
  ) {
    this.certificates = new PhoneCertificates(storage);
    this.push = new PhonePush(storage);
  }
  async load() {
    this.devices = z
      .array(deviceSchema)
      .max(40)
      .parse(await this.storage.readDevices());
  }
  private change(update: (devices: Device[]) => Device[]) {
    const work = this.writes.then(async () => {
      const devices = z.array(deviceSchema).max(40).parse(update(this.devices));
      await this.storage.writeDevices(devices);
      this.devices = devices;
    });
    this.writes = work.catch(() => undefined);
    return work;
  }
  info(): SyncInfo {
    return {
      running: !!this.server?.listening,
      address: this.host,
      secure: this.host?.startsWith("https:") ?? false,
      devices: this.devices.map(publicDevice),
    };
  }
  update(id: string, name: string, canEdit: boolean) {
    return this.change((devices) =>
      devices.map((device) =>
        device.id === id ? { ...device, name, canEdit } : device,
      ),
    ).then(() => {
      for (const [socket, deviceId] of this.sockets)
        if (id === deviceId) socket.close(1008, "Permissions changed");
      return this.info();
    });
  }
  async revoke(id: string) {
    await this.change((devices) =>
      devices.filter((device) => device.id !== id),
    );
    for (const [socket, deviceId] of this.sockets)
      if (id === deviceId) socket.terminate();
    return this.info();
  }
  pair(): Promise<PairInfo> {
    if (!this.host || !this.server?.listening)
      throw new Error("Start phone sync first.");
    const token = random(),
      expires = Date.now() + 300000;
    this.pairing = { hash: sha(token), expires };
    const url = this.host + "/pair#" + token;
    return QRCode.toDataURL(url, { width: 240, margin: 2 }).then((image) => ({
      url,
      image,
      expires,
    }));
  }
  private authenticate(value: string | undefined) {
    if (!value || !/^[A-Za-z0-9_-]{43}$/.test(value)) return;
    const digest = Buffer.from(sha(value), "hex");
    return this.devices.find((device) =>
      timingSafeEqual(digest, Buffer.from(device.digest, "hex")),
    );
  }
  start(port: number, pin?: string, address = selectAddress(), secure = false) {
    if (this.server?.listening) return Promise.resolve(this.info());
    if (this.startTask) return this.startTask;
    const work = this.bind(port, pin, address, secure);
    this.startTask = work;
    return work.finally(() => {
      this.startTask = undefined;
    });
  }
  private async bind(
    port: number,
    pin: string | undefined,
    address: string | undefined,
    secure: boolean,
  ) {
    if (!address || !isPrivateAddress(address))
      throw new Error("No private LAN address was found.");
    const origin = (secure ? "https://" : "http://") + address + ":" + port;
    const wsOrigin = (secure ? "wss://" : "ws://") + address + ":" + port;
    const app = express();
    app.disable("x-powered-by");
    app.use((req, res, next) => {
      if (
        !isPrivateAddress(req.socket.remoteAddress ?? "") ||
        req.get("host") !== new URL(origin).host ||
        (req.get("origin") && req.get("origin") !== origin)
      ) {
        res.sendStatus(403);
        return;
      }
      res.set({
        "Content-Security-Policy":
          "default-src 'self'; script-src 'self'; worker-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' " +
          wsOrigin +
          "; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store",
      });
      next();
    });
    app.use("/api", express.json({ limit: "300kb" }));
    app.post("/api/pair", async (req, res) => {
      const ip = req.socket.remoteAddress ?? "";
      const now = Date.now();
      for (const [key, value] of this.rates)
        if (value.expires < now) this.rates.delete(key);
      const rate = this.rates.get(ip) ?? { expires: now + 60000, attempts: 0 };
      this.rates.set(ip, rate);
      if (++rate.attempts > 8) {
        res.sendStatus(429);
        return;
      }
      const value = pairRequest.safeParse(req.body);
      const pairing = this.pairing;
      if (
        !value.success ||
        !pairing ||
        now > pairing.expires ||
        sha(value.data.token) !== pairing.hash ||
        (this.pin && value.data.pin !== this.pin)
      ) {
        res.sendStatus(401);
        return;
      }
      this.pairing = undefined;
      const token = random();
      const device = deviceSchema.parse({
        id: crypto.randomUUID(),
        name: value.data.name,
        canEdit: true,
        createdAt: new Date().toISOString(),
        digest: sha(token),
      });
      await this.change((devices) => [...devices, device]);
      res.json({ token, device: publicDevice(device) });
    });
    const findDevice = (authorization?: string) =>
      this.authenticate(
        authorization?.startsWith("Bearer ")
          ? authorization.slice(7)
          : undefined,
      );
    app.get("/api/pull", (req, res) => {
      const device = findDevice(req.get("authorization"));
      if (!device) {
        res.sendStatus(401);
        return;
      }
      res.json({
        device: publicDevice(device),
        data: phoneSnapshot(this.storage.state),
      });
    });
    app.post("/api/push", async (req, res) => {
      const device = findDevice(req.get("authorization"));
      if (!device) {
        res.sendStatus(401);
        return;
      }
      if (!device.canEdit) {
        res.sendStatus(403);
        return;
      }
      const body = phonePushSchema.safeParse(req.body);
      if (!body.success) {
        res.sendStatus(400);
        return;
      }
      const state = await this.storage.update((state) =>
        this.devices.some((item) => item.id === device.id && item.canEdit)
          ? applyPhoneOperations(state, body.data.operations)
          : state,
      );
      res.json({ device: publicDevice(device), data: phoneSnapshot(state) });
    });
    if (secure) {
      app.get("/api/notifications/key", async (req, res) => {
        if (!findDevice(req.get("authorization"))) {
          res.sendStatus(401);
          return;
        }
        res.json({ publicKey: await this.push.publicKey() });
      });
      app.put("/api/notifications/subscription", async (req, res) => {
        const device = findDevice(req.get("authorization"));
        if (!device) {
          res.sendStatus(401);
          return;
        }
        const subscription = pushSubscriptionSchema
          .nullable()
          .safeParse(req.body);
        if (!subscription.success) {
          res.sendStatus(400);
          return;
        }
        await this.change((devices) =>
          devices.map((item) =>
            item.id === device.id
              ? { ...item, push: subscription.data ?? undefined }
              : item,
          ),
        );
        res.sendStatus(204);
      });
    }
    app.get(["/", "/pair"], (_req, res) =>
      res.sendFile(join(this.webFiles, "index.html")),
    );
    app.use(
      express.static(this.webFiles, {
        index: false,
        fallthrough: false,
        redirect: false,
      }),
    );
    app.use(
      (
        _error: unknown,
        _req: express.Request,
        res: express.Response,
        _next: express.NextFunction,
      ) => {
        void _next;
        res.sendStatus(400);
      },
    );
    const ws = new WebSocketServer({
      noServer: true,
      maxPayload: 1024,
      handleProtocols: (protocols) =>
        protocols.has("sabri") ? "sabri" : false,
    });
    const server = secure
      ? createSecureServer(await this.certificates.forAddress(address), app)
      : createServer(app);
    server.requestTimeout = 15000;
    server.headersTimeout = 15000;
    server.on("upgrade", (request, socket, head) => {
      const protocols =
        request.headers["sec-websocket-protocol"]
          ?.split(",")
          .map((value) => value.trim()) ?? [];
      const device = this.authenticate(protocols[1]);
      if (
        request.url !== "/ws" ||
        request.headers.origin !== origin ||
        request.headers.host !== new URL(origin).host ||
        protocols[0] !== "sabri" ||
        !device ||
        !isPrivateAddress(request.socket.remoteAddress ?? "")
      ) {
        socket.destroy();
        return;
      }
      ws.handleUpgrade(request, socket, head, (channel) => {
        this.sockets.set(channel, device.id);
        channel.once("close", () => this.sockets.delete(channel));
        channel.on("error", () => channel.terminate());
      });
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, address, () => {
        server.removeListener("error", reject);
        resolve();
      });
    });
    server.on("error", (error) => console.error("Sabri phone server", error));
    this.server = server;
    this.webSockets = ws;
    this.host = origin;
    this.pin = pin;
    let previousNotices = new Set(
      this.storage.state.notices.map((notice) => notice.id),
    );
    this.unsubscribe = this.storage.subscribe((state) => {
      const fresh = state.notices.filter(
        (notice) =>
          !notice.deletedAt &&
          !previousNotices.has(notice.id) &&
          Date.now() - Date.parse(notice.createdAt) < 120000,
      );
      previousNotices = new Set(state.notices.map((notice) => notice.id));
      if (secure && fresh.length)
        for (const notice of fresh) void this.deliver(notice, origin);
      for (const socket of this.sockets.keys())
        if (
          socket.readyState === WebSocket.OPEN &&
          socket.bufferedAmount < 1024
        )
          socket.send(JSON.stringify({ revision: state.revision }));
    });
    return this.info();
  }
  private async deliver(notice: State["notices"][number], origin: string) {
    const devices = this.devices.filter((device) => device.push);
    for (const device of devices) {
      const subscription = device.push;
      if (
        !subscription ||
        !this.devices.some(
          (item) =>
            item.id === device.id &&
            item.push?.endpoint === subscription.endpoint,
        )
      )
        continue;
      try {
        const status = await this.push.send(
          subscription,
          {
            id: notice.id,
            title: notice.title,
            body: notice.body,
            kind: notice.kind,
          },
          origin,
        );
        if (status === "expired")
          await this.change((items) =>
            items.map((item) =>
              item.id === device.id &&
              item.push?.endpoint === subscription.endpoint
                ? { ...item, push: undefined }
                : item,
            ),
          );
      } catch {
        /* Local inbox remains available if a browser relay is unreachable. */
      }
    }
  }
  async stop() {
    await this.startTask?.catch(() => undefined);
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.pairing = undefined;
    this.pin = undefined;
    this.rates.clear();
    for (const socket of this.sockets.keys()) socket.terminate();
    this.sockets.clear();
    this.webSockets?.close();
    this.webSockets = undefined;
    const server = this.server;
    this.server = undefined;
    this.host = undefined;
    if (server)
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      });
    return this.info();
  }
}
