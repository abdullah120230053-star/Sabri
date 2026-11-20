import { Notification } from "electron";
import { active, applyPatch, stamp, type State } from "../../shared/schema";
import {
  lmsItemSchema,
  mapLms,
  type LmsItem,
  type LmsPreview,
  type LmsConnect,
  type LmsApply,
  type LmsConnection,
} from "../../shared/logic/lms-mapping";
import { lmsConnectionSchema } from "../../shared/addon-schema";
import type { Storage } from "../storage";
import { TokenVault, type Credential } from "./token-vault";
import { readMoodleCalendar, moodleCalendarItems } from "./moodle-ics";
import { readMoodleWebServices, moodleBaseUrl } from "./moodle-ws";
import { readClassroom, authorizeClassroom } from "./google-classroom";
import { calendarUrl } from "../import-service";

type Snapshot = { items: LmsItem[]; complete: boolean };
const errors = lmsConnectionSchema.shape.lastError.unwrap();
const errorCode = (error: unknown) => {
  const parsed = errors.safeParse(
    error instanceof Error ? error.message : "unreachable",
  );
  return parsed.success ? parsed.data : "unreachable";
};

export class LmsService {
  private readonly vault: TokenVault;
  private pending = new Map<string, Snapshot>();
  private attempts = new Map<string, { until: number; failures: number }>();
  private busy = new Set<string>();
  private connecting = false;
  constructor(private readonly storage: Storage) {
    this.vault = new TokenVault(storage);
  }
  private connection(id: string) {
    const item = active(this.storage.state.lmsConnections).find(
      (item) => item.id === id,
    );
    if (!item?.enabled) throw new Error("needs_reconnect");
    return item;
  }
  private async read(credential: Credential, label: string): Promise<Snapshot> {
    const zone = this.storage.state.settings.location.timezone;
    const result =
      credential.type === "moodle_ics"
        ? await readMoodleCalendar(credential.url, zone, label)
        : credential.type === "google_classroom"
          ? await readClassroom(credential)
          : await readMoodleWebServices(credential);
    return {
      items: lmsItemSchema.array().max(1500).parse(result.items),
      complete: result.complete,
    };
  }
  private preview(connection: LmsConnection, snapshot: Snapshot): LmsPreview {
    this.pending.set(connection.id, snapshot);
    const courses = [
      ...new Map(
        snapshot.items.map((item) => [item.course.id, item.course]),
      ).values(),
    ];
    return {
      connectionId: connection.id,
      courses,
      items: snapshot.items.length,
      status: courses.some(
        (course) =>
          !connection.courseMap.some((item) => item.remoteId === course.id),
      )
        ? "mapping"
        : "fresh",
    };
  }
  async connect(input: LmsConnect) {
    if (this.connecting) throw new Error("Connection already in progress.");
    this.connecting = true;
    try {
      const credential: Credential =
        input.type === "google_classroom"
          ? {
              type: input.type,
              clientId: input.clientId,
              clientSecret: input.clientSecret,
              refreshToken: await authorizeClassroom(
                input.clientId,
                input.clientSecret,
              ),
            }
          : input.type === "moodle_ics"
            ? { type: input.type, url: calendarUrl(input.url).href }
            : {
                type: input.type,
                url: moodleBaseUrl(input.url),
                token: input.token,
              };
      const snapshot = await this.read(credential, input.label);
      const connection = lmsConnectionSchema.parse({
        ...stamp(),
        type: input.type,
        label: input.label,
        enabled: true,
        courseMap: [],
        baseUrl:
          credential.type === "moodle_ics"
            ? new URL(credential.url).origin
            : credential.type === "moodle_ws"
              ? credential.url
              : undefined,
      });
      await this.vault.put(connection.id, credential);
      try {
        await this.storage.patch({
          changes: [{ collection: "lmsConnections", value: connection }],
        });
      } catch (error) {
        await this.vault.clear(connection.id);
        throw error;
      }
      return this.preview(connection, snapshot);
    } catch (error) {
      throw new Error(errorCode(error));
    } finally {
      this.connecting = false;
    }
  }
  async importCalendar(raw: string, label: string) {
    const snapshot = moodleCalendarItems(
      raw,
      this.storage.state.settings.location.timezone,
      label,
    );
    const previous = active(this.storage.state.lmsConnections).find(
      (item) =>
        item.type === "moodle_ics" && item.fileOnly && item.label === label,
    );
    const connection = lmsConnectionSchema.parse({
      ...stamp(),
      ...previous,
      type: "moodle_ics",
      label,
      enabled: true,
      courseMap: previous?.courseMap ?? [],
      fileOnly: true,
    });
    await this.storage.patch({
      changes: [{ collection: "lmsConnections", value: connection }],
    });
    return this.preview(connection, snapshot);
  }
  async sync(id: string, remote = false) {
    const connection = this.connection(id);
    const held = this.pending.get(id);
    if (held) return this.preview(connection, held);
    if (this.busy.has(id)) throw new Error("Sync already in progress.");
    this.busy.add(id);
    try {
      const credential = await this.vault.get(id);
      if (!credential) throw new Error("needs_reconnect");
      const snapshot = await this.read(credential, connection.label);
      this.connection(id);
      const result = this.preview(connection, snapshot);
      if (remote && result.status === "fresh" && connection.lastSyncAt)
        await this.apply({ id, courseMap: connection.courseMap });
      this.attempts.delete(id);
      return result;
    } catch (error) {
      const failures = (this.attempts.get(id)?.failures ?? 0) + 1;
      this.attempts.set(id, {
        until:
          Date.now() + Math.min(3600000, 30000 * 2 ** Math.min(failures, 10)),
        failures,
      });
      const current = this.storage.state.lmsConnections.find(
        (item) => item.id === id && !item.deletedAt && item.enabled,
      );
      if (current)
        await this.storage.patch({
          changes: [
            {
              collection: "lmsConnections",
              value: { ...current, lastError: errorCode(error) },
            },
          ],
        });
      throw new Error(errorCode(error));
    } finally {
      this.busy.delete(id);
    }
  }
  async apply(input: LmsApply) {
    const snapshot = this.pending.get(input.id);
    if (!snapshot)
      throw new Error("Sync again to refresh the available mappings.");
    let counts = { changed: 0, created: 0, removed: 0 };
    let notifications: State["notices"] = [];
    await this.storage.update((state) => {
      const current = state.lmsConnections.find(
        (item) => item.id === input.id && item.enabled && !item.deletedAt,
      );
      if (!current) throw new Error("needs_reconnect");
      const remoteIds = new Set(snapshot.items.map((item) => item.course.id));
      const mappings = new Map(
        current.courseMap.map((item) => [item.remoteId, item]),
      );
      for (const item of input.courseMap)
        if (remoteIds.has(item.remoteId)) mappings.set(item.remoteId, item);
      const connection = {
        ...current,
        courseMap: [...mappings.values()],
        lastError: undefined,
        lastSyncAt: new Date().toISOString(),
      };
      const result = mapLms(
        state,
        connection,
        snapshot.items,
        snapshot.complete,
      );
      counts = result.counts;
      const changes = result.changes;
      const next = applyPatch(
        state,
        {
          changes: [
            ...changes,
            { collection: "lmsConnections", value: connection },
          ],
        },
        connection.lastSyncAt,
      );
      const previousIds = new Set(state.notices.map((item) => item.id));
      notifications = next.notices.filter(
        (item) => !previousIds.has(item.id) && item.kind === "lms-change",
      );
      return { ...next, notices: next.notices.slice(-250) };
    });
    if (Notification.isSupported() && notifications.length) {
      const first = notifications[0]!;
      new Notification({
        title: first.title,
        body:
          notifications.length === 1
            ? first.body
            : notifications.length + " · " + first.body,
      }).show();
    }
    this.pending.delete(input.id);
    return counts;
  }
  async disconnect(id: string) {
    const connection = this.storage.state.lmsConnections.find(
      (item) => item.id === id && !item.deletedAt,
    );
    if (!connection) return;
    await this.storage.patch({
      changes: [
        {
          collection: "lmsConnections",
          value: { ...connection, enabled: false },
        },
      ],
    });
    this.pending.delete(id);
    this.attempts.delete(id);
    await this.vault.clear(id);
  }
  poll() {
    const interval = this.storage.state.settings.integrations.syncIntervalMin;
    if (!interval) return;
    for (const item of active(this.storage.state.lmsConnections)) {
      if (
        !item.enabled ||
        item.paused ||
        item.fileOnly ||
        !item.lastSyncAt ||
        this.busy.has(item.id) ||
        this.pending.has(item.id) ||
        Date.now() - Date.parse(item.lastSyncAt) < interval * 60000 ||
        (this.attempts.get(item.id)?.until ?? 0) > Date.now()
      )
        continue;
      void this.sync(item.id, true).catch(() => undefined);
    }
  }
}
