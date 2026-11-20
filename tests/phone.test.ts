import { afterEach, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createServer } from "node:net";
import { get } from "node:https";
import { X509Certificate as NodeCertificate } from "node:crypto";
import { WebSocket } from "ws";
import { Companion, isPrivateAddress } from "../src/main/companion";
import { Storage } from "../src/main/storage";
import { emptyState } from "../src/shared/schema";
import {
  applyPhoneOperations,
  pushSubscriptionSchema,
} from "../src/shared/phone";
import { editPrayer, prayerEditSchema } from "../src/shared/prayer-record";
import { sanitizeNote } from "../src/main/note-html";

let directory: string | undefined;
let server: Companion | undefined;
afterEach(async () => {
  await server?.stop();
  if (directory) await rm(directory, { recursive: true, force: true });
});
async function freePort() {
  const probe = createServer();
  return new Promise<number>((resolve, reject) => {
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      if (!address || typeof address === "string") {
        reject(new Error("Unable to allocate a port"));
        return;
      }
      probe.close(() => resolve(address.port));
    });
  });
}
it("merges prayer fields by desktop receipt and rejects duplicate operations", () => {
  const now = new Date("2026-11-20T12:00:00Z"),
    base = emptyState();
  const first = editPrayer(
    base,
    prayerEditSchema.parse({
      date: "2026-11-20",
      fields: { fasting: true, status: { fajr: "done" } },
    }),
    now,
  );
  const operation = {
    type: "prayer" as const,
    operationId: crypto.randomUUID(),
    date: "2026-11-20",
    name: "asr" as const,
    done: true,
  };
  const edited = applyPhoneOperations(first, [operation], now);
  expect(edited.prayerDays).toHaveLength(1);
  expect(edited.prayerDays[0]).toMatchObject({
    fasting: true,
    status: { fajr: "done", asr: "done" },
  });
  expect(applyPhoneOperations(edited, [operation], now)).toBe(edited);
  expect(
    sanitizeNote(
      '<p>Hello<script>bad()</script><a href="javascript:alert(1)" onclick="bad()">text</a></p>',
    ),
  ).toBe("<p>Hello<a>text</a></p>");
});
it("pairs once, broadcasts a change, blocks writes for view-only devices and closes the port", async () => {
  directory = await mkdtemp(join(tmpdir(), "sabri-connection-"));
  const storage = new Storage(directory);
  await storage.load();
  server = new Companion(storage, directory);
  await server.load();
  const port = await freePort();
  const { address } = await server.start(port, "3815", "127.0.0.1");
  const { url } = await server.pair();
  const token = new URL(url).hash.slice(1);
  const call = (path: string, key?: string, body?: unknown) =>
    fetch(address + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        "Content-Type": "application/json",
        ...(key ? { Authorization: "Bearer " + key } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(2000),
    });
  expect((await call("/api/pull")).status).toBe(401);
  expect(
    (
      await call("/api/pair", undefined, {
        token,
        pin: "9999",
        name: "Test phone",
      })
    ).status,
  ).toBe(401);
  const paired = await call("/api/pair", undefined, {
    token,
    pin: "3815",
    name: "Test phone",
  });
  expect(paired.status).toBe(200);
  const device = (await paired.json()) as {
    token: string;
    device: { id: string };
  };
  expect(
    (await call("/api/pair", undefined, { token, pin: "3815", name: "Repeat" }))
      .status,
  ).toBe(401);
  const ws = new WebSocket(
    "ws://127.0.0.1:" + port + "/ws",
    ["sabri", device.token],
    { origin: address },
  );
  await new Promise<void>((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });
  const broadcast = new Promise<number>((resolve) =>
    ws.once("message", (data) => resolve(JSON.parse(data.toString()).revision)),
  );
  const operation = {
    type: "task-add",
    operationId: crypto.randomUUID(),
    title: "Study from phone",
  };
  expect(
    (
      await call("/api/push", device.token, {
        operations: [operation, operation],
      })
    ).status,
  ).toBe(200);
  expect(await broadcast).toBe(1);
  expect(storage.state.tasks.map((item) => item.title)).toEqual([
    "Study from phone",
  ]);
  await server.update(device.device.id, "Study phone", false);
  expect(
    (await call("/api/push", device.token, { operations: [operation] })).status,
  ).toBe(403);
  await server.revoke(device.device.id);
  expect((await call("/api/pull", device.token)).status).toBe(401);
  await server.stop();
  await expect(call("/api/pull")).rejects.toThrow();
  expect(isPrivateAddress("203.0.113.12")).toBe(false);
}, 10000);

it("serves secure phone sync with the exported root and rejects non-browser push endpoints", async () => {
  directory = await mkdtemp(join(tmpdir(), "sabri-tls-"));
  const storage = new Storage(directory);
  await storage.load();
  server = new Companion(storage, directory);
  await server.load();
  const root = await server.certificates.certificate();
  const ca = new NodeCertificate(root.bytes).toString();
  expect(root.fingerprint).toMatch(/^(?:[A-F0-9]{2}:){31}[A-F0-9]{2}$/);
  const port = await freePort();
  const info = await server.start(port, undefined, "127.0.0.1", true);
  expect(info).toMatchObject({
    secure: true,
    address: "https://127.0.0.1:" + port,
  });
  const response = await new Promise<number | undefined>((resolve, reject) => {
    const request = get(info.address + "/api/pull", { ca }, (response) => {
      response.resume();
      response.on("end", () => resolve(response.statusCode));
    });
    request.once("error", reject);
  });
  expect(response).toBe(401);
  const keys = { auth: "a".repeat(22), p256dh: "b".repeat(87) };
  expect(
    pushSubscriptionSchema.safeParse({
      endpoint: "https://web.push.apple.com/abc",
      keys,
    }).success,
  ).toBe(true);
  expect(
    pushSubscriptionSchema.safeParse({
      endpoint: "https://fcm.googleapis.com/wp/abc",
      keys,
    }).success,
  ).toBe(true);
  expect(
    pushSubscriptionSchema.safeParse({
      endpoint: "https://127.0.0.1:1234/port",
      keys,
    }).success,
  ).toBe(false);
  expect(
    pushSubscriptionSchema.safeParse({
      endpoint: "https://web.push.apple.com.example.invalid/abc",
      keys,
    }).success,
  ).toBe(false);
});
