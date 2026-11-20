import { z } from "zod";
import {
  active,
  eventSchema,
  stamp,
  type Patch,
  type RecordFor,
  type State,
} from "../schema";
import { assignmentSchema, lmsConnectionSchema } from "../addon-schema";
import { minutesAt, dayKey } from "../time";
import { formatInTimeZone } from "date-fns-tz";

export const assignmentReminders = [10080, 4320, 1440, 180];
const remoteCourseSchema = z.object({
  id: z.string().min(1).max(200),
  name: z.string().trim().min(1).max(200),
});
export const lmsItemSchema = z.object({
  id: z.string().min(1).max(1000),
  course: remoteCourseSchema,
  title: z.string().trim().min(1).max(200),
  kind: assignmentSchema.shape.kind,
  dueAt: z.iso.datetime().optional(),
  submittedAt: z.iso.datetime().optional(),
  cancelled: z.boolean().optional(),
  feedback: z.string().max(8000).optional(),
  score: z.number().nonnegative().optional(),
  maxScore: z.number().positive().optional(),
});
export type LmsItem = z.infer<typeof lmsItemSchema>;
export type LmsConnection = RecordFor<"lmsConnections">;
export type LmsPreview = {
  connectionId: string;
  courses: z.infer<typeof remoteCourseSchema>[];
  items: number;
  status: "fresh" | "mapping";
};
export type LmsResult = { changed: number; created: number; removed: number };
export const lmsConnectRequest = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("moodle_ics"),
    label: z.string().trim().min(1).max(200),
    url: z.url().max(3200),
  }),
  z.object({
    type: z.literal("moodle_ws"),
    label: z.string().trim().min(1).max(200),
    url: z.url().max(2048),
    token: z.string().trim().min(12).max(4096),
  }),
  z.object({
    type: z.literal("google_classroom"),
    label: z.string().trim().min(1).max(200),
    clientId: z.string().regex(/^[a-zA-Z0-9-]+\.apps\.googleusercontent\.com$/),
    clientSecret: z.string().min(1).max(256),
  }),
]);
export type LmsConnect = z.infer<typeof lmsConnectRequest>;
export const lmsApplyRequest = z.object({
  id: z.uuid(),
  courseMap: lmsConnectionSchema.shape.courseMap,
});
export type LmsApply = z.infer<typeof lmsApplyRequest>;

const sourceFor = {
  moodle_ics: "ics",
  moodle_ws: "moodle",
  google_classroom: "classroom",
} as const;
export function mapLms(
  state: State,
  connection: LmsConnection,
  items: LmsItem[],
  complete: boolean,
  now = new Date(),
) {
  const current = now.toISOString(),
    today = dayKey(now, state.settings.location.timezone);
  const links = new Map(
    connection.courseMap.map((item) => [item.remoteId, item.courseId]),
  );
  const localCourses = new Set(active(state.courses).map((item) => item.id));
  const prefix = connection.id + ":";
  const source = sourceFor[connection.type];
  const previous = new Map(
    state.assignments
      .filter(
        (item) => item.source === source && item.externalId?.startsWith(prefix),
      )
      .map((item) => [item.externalId!.slice(prefix.length), item]),
  );
  const existingCalendar = new Map(
    state.calendar
      .filter((item) => item.externalUid?.startsWith(prefix))
      .map((item) => [item.externalUid!.slice(prefix.length), item]),
  );
  const changes: Patch["changes"] = [];
  const counts: LmsResult = { changed: 0, created: 0, removed: 0 };
  const notice = (title: string, body: string, reference: string) => {
    if (
      state.settings.integrations.changeAlerts &&
      state.settings.notifications.enabled
    )
      changes.push({
        collection: "notices",
        value: {
          ...stamp(undefined, current),
          title,
          body,
          reference: reference.slice(0, 500),
          kind: "lms-change",
        },
      });
  };
  const remove = (old: RecordFor<"assignments">) => {
    if (old.deletedAt || old.upstream?.removed) return;
    counts.removed++;
    changes.push({
      collection: "assignments",
      value: {
        ...old,
        upstream: { ...old.upstream, removed: true },
        lastSyncedAt: current,
      },
    });
  };
  const incoming = new Map(items.map((item) => [item.id, item]));
  for (const item of incoming.values()) {
    const old = previous.get(item.id),
      courseId = links.get(item.course.id);
    if (item.cancelled) {
      if (old) remove(old);
      continue;
    }
    if (old?.deletedAt || !courseId || !localCourses.has(courseId)) continue;
    const dueChanged = !!old && old.dueAt !== item.dueAt;
    const restored = !!old?.upstream?.removed;
    const externalId = prefix + item.id;
    const { language } = state.settings;
    if (dueChanged) {
      counts.changed++;
      notice(
        language === "ar" ? "تغيّر موعد التسليم" : "LMS deadline changed",
        item.title,
        externalId + ":" + current,
      );
    }
    if (!old) {
      counts.created++;
      notice(
        language === "ar" ? "واجب جديد" : "New LMS assignment",
        item.title,
        externalId,
      );
    }
    const submission =
      old?.submittedSource === "user" || old?.status === "graded"
        ? {}
        : item.submittedAt
          ? {
              submittedAt: item.submittedAt,
              submittedSource: "lms" as const,
              status: "submitted" as const,
            }
          : {};
    const record = assignmentSchema.parse({
      ...stamp(undefined, current),
      ...old,
      source,
      externalId,
      courseId,
      title: item.title,
      kind: item.kind,
      dueAt: item.dueAt,
      lastSyncedAt: current,
      status: old?.status ?? "not_started",
      checklist: old?.checklist ?? [],
      attachments: old?.attachments ?? [],
      timeSpentMinutes: old?.timeSpentMinutes ?? 0,
      upstream: {
        ...old?.upstream,
        removed: false,
        changed: dueChanged || old?.upstream?.changed,
        previousDueAt: dueChanged ? old?.dueAt : old?.upstream?.previousDueAt,
      },
      feedback: old?.feedback ?? item.feedback,
      score: old?.score ?? item.score,
      maxScore: old?.maxScore ?? item.maxScore,
      ...submission,
    });
    changes.push({ collection: "assignments", value: record });
    if (item.dueAt) {
      const due = new Date(item.dueAt),
        calendar = existingCalendar.get(item.id);
      const time = formatInTimeZone(
        due,
        state.settings.location.timezone,
        "HH:mm",
      );
      changes.push({
        collection: "calendar",
        value: eventSchema.parse({
          ...stamp(undefined, current),
          ...calendar,
          title: item.title,
          date: dayKey(due, state.settings.location.timezone),
          time: minutesAt(time) === 0 ? undefined : time,
          type: item.kind === "quiz" ? "quiz" : "assignment",
          courseId,
          source: "ics",
          externalUid: externalId,
          reminders: [],
          deletedAt: restored ? undefined : calendar?.deletedAt,
        }),
      });
    }
  }
  const covered = items
    .filter((item) => !item.cancelled && item.dueAt)
    .map((item) => item.dueAt!)
    .sort();
  const earliest = covered[0],
    latest = covered.at(-1);
  for (const [id, old] of previous) {
    if (incoming.has(id)) continue;
    const visibleDate =
      old.dueAt &&
      dayKey(new Date(old.dueAt), state.settings.location.timezone) >= today;
    if (
      (complete && (!old.dueAt || visibleDate)) ||
      (connection.type === "moodle_ics" &&
        visibleDate &&
        earliest &&
        latest &&
        old.dueAt! >= earliest &&
        old.dueAt! <= latest)
    )
      remove(old);
  }
  return { changes, counts };
}
