import { z } from "zod";
import {
  active,
  date,
  noteSchema,
  prayers,
  stamp,
  taskSchema,
  timerActionSchema,
  type State,
} from "./schema";
import { dayKey, blocksOn } from "./time";
import { computePrayers } from "./prayer";
import { moveTimer } from "./timer";
import { taskTransition } from "./tasks";
import { editPrayer } from "./prayer-record";

const operationId = z.uuid();
export const pushSubscriptionSchema = z.object({
  endpoint: z
    .string()
    .url()
    .max(1800)
    .refine((value) => {
      const url = new URL(value),
        host = url.hostname;
      return (
        url.protocol === "https:" &&
        !url.port &&
        !url.username &&
        !url.password &&
        !url.hash &&
        (host === "fcm.googleapis.com" ||
          host === "updates.push.services.mozilla.com" ||
          host === "web.push.apple.com" ||
          host.endsWith(".push.apple.com") ||
          host.endsWith(".notify.windows.com"))
      );
    }),
  keys: z.object({
    auth: z.string().regex(/^[a-zA-Z0-9_-]{22}$/),
    p256dh: z.string().regex(/^[a-zA-Z0-9_-]{87}$/),
  }),
});
export type PushSubscriptionData = z.infer<typeof pushSubscriptionSchema>;
export const deviceSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1).max(80),
  canEdit: z.boolean(),
  createdAt: z.iso.datetime(),
  digest: z.string().regex(/^[a-f0-9]{64}$/),
  push: pushSubscriptionSchema.optional(),
});
export const pairRequest = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{32,64}$/),
  pin: z
    .string()
    .regex(/^\d{4,8}$/)
    .optional(),
  name: z.string().trim().min(1).max(80),
});
export const phoneActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("prayer"),
    operationId,
    date,
    name: z.enum(prayers),
    done: z.boolean(),
  }),
  z.object({
    type: z.literal("task-add"),
    operationId,
    title: z.string().trim().min(1).max(200),
  }),
  z.object({
    type: z.literal("task-status"),
    operationId,
    id: z.uuid(),
    done: z.boolean(),
  }),
  z.object({
    type: z.literal("note-add"),
    operationId,
    title: z.string().trim().min(1).max(200),
    text: z.string().max(20000),
  }),
  z.object({
    type: z.literal("timer"),
    operationId,
    action: timerActionSchema,
  }),
]);
export const phonePushSchema = z.object({
  operations: z.array(phoneActionSchema).min(1).max(60),
});
export const phoneDeviceUpdate = deviceSchema.pick({
  id: true,
  name: true,
  canEdit: true,
});
export const syncStartOptions = z.object({
  port: z.number().int().min(1024).max(65535),
  pin: z
    .string()
    .regex(/^\d{4,8}$/)
    .optional(),
  secure: z.boolean().default(false),
});
export type PhoneOperation = z.infer<typeof phoneActionSchema>;
export type PhoneDevice = Omit<
  z.infer<typeof deviceSchema>,
  "digest" | "push"
> & { pushEnabled: boolean };
export type SyncInfo = {
  running: boolean;
  address?: string;
  secure: boolean;
  devices: PhoneDevice[];
};
export type PairInfo = { url: string; image: string; expires: number };

export function phoneSnapshot(state: State, now = new Date()) {
  const { settings } = state;
  const today = dayKey(now, settings.location.timezone);
  return {
    revision: state.revision,
    now: +now,
    today,
    language: settings.language,
    theme: settings.theme,
    timeFormat: settings.timeFormat,
    location: settings.location,
    customTheme: active(state.themes).find(
      (theme) => theme.id === settings.theme,
    ),
    times: computePrayers(today, settings),
    prayer:
      active(state.prayerDays).find((item) => item.date === today)?.status ??
      {},
    schedule: blocksOn(state.schedule, today).map((item) => ({
      id: item.id,
      title: item.title,
      start: item.start,
      end: item.end,
      location: item.location,
    })),
    notices: active(state.notices)
      .slice(-70)
      .map(({ id, title, body, createdAt, kind }) => ({
        id,
        title,
        body,
        createdAt,
        kind,
      })),
    tasks: active(state.tasks)
      .filter(
        (task) =>
          task.status !== "done" ||
          (!!task.completedAt &&
            dayKey(new Date(task.completedAt), settings.location.timezone) ===
              today),
      )
      .sort((a, b) => a.order - b.order)
      .slice(0, 500)
      .map((item) => ({
        id: item.id,
        title: item.title,
        status: item.status,
        dueDate: item.dueDate,
        dueTime: item.dueTime,
        priority: item.priority,
        category: item.category,
        course: state.courses.find(
          (course) => course.id === item.courseId && !course.deletedAt,
        )?.name,
      })),
    timer: state.timer,
    calendar: active(state.calendar)
      .filter((event) => event.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 100)
      .map((item) => ({
        id: item.id,
        title: item.title,
        date: item.date,
        time: item.time,
        type: item.type,
        room: item.location,
      })),
  };
}
export type PhoneSnapshot = ReturnType<typeof phoneSnapshot>;
const safeText = (input: string) =>
  input.replace(
    /[&<>"']/g,
    (value) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        value
      ] ?? value,
  );
export function applyPhoneOperations(
  state: State,
  operations: PhoneOperation[],
  now = new Date(),
) {
  const receipt = new Set(state.phoneReceipts);
  const at = now.toISOString();
  const today = dayKey(now, state.settings.location.timezone);
  let next = state;
  for (const op of operations) {
    if (receipt.has(op.operationId)) continue;
    switch (op.type) {
      case "timer":
        next = moveTimer(next, op.action, +now);
        break;
      case "prayer": {
        if (op.date > today) break;
        next = editPrayer(
          next,
          {
            date: op.date,
            fields: { status: { [op.name]: op.done ? "done" : "pending" } },
          },
          now,
        );
        break;
      }
      case "task-add": {
        if (next.tasks.some((item) => item.id === op.operationId)) break;
        const task = taskSchema.parse({
          ...stamp(op.operationId, at),
          title: op.title,
          order: Math.max(0, ...next.tasks.map((entry) => entry.order)) + 1,
        });
        next = { ...next, tasks: [...next.tasks, task] };
        break;
      }
      case "task-status": {
        const found = active(next.tasks).find((item) => item.id === op.id);
        if (!found) break;
        const changes = taskTransition(
          found,
          op.done ? "done" : "todo",
          next,
          now,
        ).map((item) => ({ ...item, updatedAt: at }));
        next = {
          ...next,
          tasks: [
            ...next.tasks.filter((item) => item.id !== found.id),
            ...changes,
          ],
        };
        break;
      }
      case "note-add": {
        if (next.notes.some((item) => item.id === op.operationId)) break;
        const note = noteSchema.parse({
          ...stamp(op.operationId, at),
          title: op.title,
          content: "<p>" + safeText(op.text).replace(/\r?\n/g, "<br>") + "</p>",
          tags: [],
          pinned: false,
          color: "#7355c8",
        });
        next = { ...next, notes: [...next.notes, note] };
        break;
      }
    }
    receipt.add(op.operationId);
  }
  return receipt.size === state.phoneReceipts.length
    ? state
    : { ...next, phoneReceipts: [...receipt].slice(-2500) };
}
