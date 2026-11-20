import { z } from "zod";

const id = z.uuid(),
  date = z.iso.date(),
  instant = z.iso.datetime();
const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const base = {
  id,
  createdAt: instant,
  updatedAt: instant,
  deletedAt: instant.optional(),
};
const name = z.string().trim().min(1).max(200),
  detail = z.string().max(8000);
const rating = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
]);
const ratio = z.number().min(0).max(1),
  hours = z.number().min(0).max(24),
  positiveHours = hours.refine((value) => value > 0);
const positive = z.number().positive(),
  minutes = z.number().int().min(0).max(60000);
const remoteId = z.string().min(1).max(1500);
const https = z
  .url()
  .max(2048)
  .refine((value) => {
    const url = URL.parse(value);
    return !!url && url.protocol === "https:" && !url.username && !url.password;
  });
export const progressSkinSchema = z.enum([
  "minimal",
  "championship",
  "league",
  "xp",
  "forest",
  "credits",
  "mosaic",
]);
export type ProgressSkin = z.infer<typeof progressSkinSchema>;
const studyDefaults = {
  reviewSpacingDays: z
    .array(z.number().int().min(1).max(365))
    .min(1)
    .max(12)
    .refine((days) => new Set(days).size === days.length)
    .default([2, 5]),
  practiceShare: ratio.default(0.25),
  restDayBefore: z.boolean().default(true),
  sessionMinutes: z.number().int().min(5).max(180).default(50),
  maxHoursPerDay: positiveHours.default(6),
};
export const addonSettings = {
  planner: z
    .object({
      dayStart: time.default("08:00"),
      dayEnd: time.default("22:30"),
      minBlockMin: z.number().int().min(5).max(240).default(25),
      maxFocusHoursPerDay: positiveHours.default(6),
      bufferPercent: z.number().min(0).max(80).default(15),
      prayerBufferBeforeMin: z.number().int().min(0).max(180).default(10),
      prayerBufferAfterMin: z.number().int().min(0).max(180).default(20),
      commuteBufferMin: z.number().int().min(0).max(240).default(10),
      energyMode: z.enum(["preset", "manual", "learned"]).default("learned"),
      energyPreset: z
        .enum(["morning", "balanced", "night"])
        .default("balanced"),
      shutdownReminderAt: time.default("21:30"),
      shutdownEnabled: z.boolean().default(true),
      meals: z
        .array(
          z
            .object({ label: name, start: time, end: time })
            .refine((item) => item.start < item.end),
        )
        .max(8)
        .default([]),
    })
    .refine((value) => value.dayStart < value.dayEnd)
    .prefault({}),
  examPrep: z
    .object({
      ...studyDefaults,
      reminders: z.boolean().default(true),
      remindAt: time.default("09:00"),
      quietMock: z.boolean().default(false),
    })
    .prefault({}),
  integrations: z
    .object({
      syncIntervalMin: z.number().int().min(0).max(10080).default(60),
      changeAlerts: z.boolean().default(true),
      moodle: z
        .object({ mode: z.enum(["ics", "ws"]).default("ics") })
        .prefault({}),
      classroom: z.object({ enabled: z.boolean().default(false) }).prefault({}),
    })
    .prefault({}),
  progress: z
    .object({
      enabled: z.boolean().default(true),
      rewardMode: z
        .enum(["all-unlocked", "earn-themes"])
        .default("all-unlocked"),
      includeWorship: z.boolean().default(false),
      difficulty: z.enum(["easy", "normal", "hard"]).default("normal"),
      cosmetics: z
        .object({
          timer: z.enum(["theme", "neon", "geometric"]).default("theme"),
          sound: z.enum(["classic", "chime"]).default("classic"),
          title: z.enum(["none", "steady", "scholar"]).default("none"),
          celebration: z.enum(["none", "spark", "confetti"]).default("none"),
        })
        .prefault({}),
      rules: z
        .record(z.string().max(40), z.number().int().min(0).max(100))
        .default({}),
    })
    .prefault({}),
  parking: z
    .object({
      hotkey: z.literal("Ctrl+Alt+P").default("Ctrl+Alt+P"),
      showToast: z.boolean().default(true),
      breathe: z.boolean().default(false),
      breakReview: z.boolean().default(true),
    })
    .prefault({}),
  formulaReminder: z
    .object({ enabled: z.boolean().default(true), time: time.default("17:00") })
    .prefault({}),
};
export const planBlockSchema = z
  .object({
    ...base,
    date,
    start: time,
    end: time,
    title: name.optional(),
    kind: z.enum([
      "focus",
      "review",
      "task",
      "assignment",
      "exam_prep",
      "habit",
      "break",
      "buffer",
    ]),
    refType: z.enum(["todo", "assignment", "studySession", "habit"]).optional(),
    refId: id.optional(),
    locked: z.boolean(),
    status: z.enum(["planned", "done", "skipped", "moved"]),
    reason: detail.optional(),
  })
  .refine(
    (value) => value.start < value.end && !!value.refId === !!value.refType,
  );
export const energyProfileSchema = z.object({
  ...base,
  hours: z.array(z.array(ratio).length(24)).length(7),
  source: z.enum(["preset", "manual", "learned"]),
  sampleCount: z.number().int().nonnegative(),
});
export const dayReviewSchema = z.object({
  ...base,
  date,
  focusRating: rating.optional(),
  big3: z
    .array(id)
    .max(3)
    .refine((ids) => new Set(ids).size === ids.length),
  carryCounts: z.record(id, z.number().int().min(1).max(100)).default({}),
  cleanSweep: z.boolean().optional(),
  reviewed: z.boolean().optional(),
  notes: detail.optional(),
});
export const examTopicSchema = z.object({
  id,
  name,
  difficulty: rating,
  confidence: rating,
  estimatedHours: positive.max(500),
  resources: z
    .array(
      z
        .object({
          type: z.enum(["note", "formula", "pastPaper", "link"]),
          refId: id.optional(),
          url: https.optional(),
        })
        .refine((value) => !!(value.refId || value.url)),
    )
    .max(100),
});
export const examPlanSchema = z.object({
  ...base,
  eventId: id,
  courseId: id,
  topics: z.array(examTopicSchema).max(300),
  settings: z.object({
    ...studyDefaults,
    availableHoursByWeekday: z.array(hours).length(7).optional(),
    blockedDates: z.array(date).max(365).optional(),
  }),
  checklist: z.array(z.string().max(30)).max(15).default([]),
  result: z
    .object({
      score: z.number().nonnegative(),
      max: positive,
      memo: detail,
      componentId: id.optional(),
    })
    .optional(),
});
export const studySessionSchema = z.object({
  ...base,
  planId: id,
  topicId: id,
  kind: z.enum(["learn", "review", "practice", "recap", "mock"]),
  date,
  minutes: z.number().int().min(1).max(1440),
  status: z.enum(["planned", "done", "missed", "rescheduled"]),
  confidenceAfter: rating.optional(),
});
export const formulaSchema = z.object({
  ...base,
  courseId: id.optional(),
  name,
  latex: z.string().trim().min(1).max(8000),
  description: detail.optional(),
  variables: z
    .array(z.object({ symbol: name, meaning: detail, unit: name.optional() }))
    .max(80),
  tags: z.array(name).max(40),
  examExtra: z.boolean(),
  favorite: z.boolean(),
  leitnerBox: rating,
  nextReviewAt: instant.optional(),
});
const kind = z.enum(["lab", "homework", "report", "project", "quiz", "other"]);
export const attachmentSchema = z.object({
  id,
  name,
  mode: z.enum(["copied", "linked"]),
  path: z.string().min(1).max(4096),
  sizeBytes: z.number().int().nonnegative().optional(),
});
export const assignmentSchema = z
  .object({
    ...base,
    courseId: id,
    title: name,
    kind,
    status: z.enum([
      "not_started",
      "in_progress",
      "ready",
      "submitted",
      "graded",
    ]),
    dueAt: instant.optional(),
    checklist: z
      .array(z.object({ id, label: name, done: z.boolean() }))
      .max(100),
    attachments: z.array(attachmentSchema).max(100),
    estimatedMinutes: minutes.optional(),
    timeSpentMinutes: minutes,
    score: z.number().nonnegative().optional(),
    maxScore: positive.optional(),
    feedback: detail.optional(),
    gradeComponentId: id.optional(),
    source: z.enum(["manual", "ics", "moodle", "classroom"]),
    externalId: remoteId.optional(),
    lastSyncedAt: instant.optional(),
    reminderMinutes: z
      .array(z.number().int().min(0).max(525600))
      .max(20)
      .default([10080, 4320, 1440, 180]),
    upstream: z
      .object({
        changed: z.boolean().optional(),
        removed: z.boolean().optional(),
        previousDueAt: instant.optional(),
      })
      .optional(),
    submittedAt: instant.optional(),
    submittedSource: z.enum(["user", "lms"]).optional(),
  })
  .refine(
    (value) =>
      (value.source === "manual" || !!value.externalId) &&
      (value.score === undefined ||
        value.maxScore === undefined ||
        value.score <= value.maxScore),
  );
export const checklistTemplateSchema = z.object({
  ...base,
  name,
  kind,
  items: z.array(name).min(1).max(100),
});
export const lmsConnectionSchema = z.object({
  ...base,
  type: z.enum(["moodle_ics", "moodle_ws", "google_classroom"]),
  label: name,
  baseUrl: https
    .refine((value) => {
      const url = URL.parse(value);
      return !!url && !url.search && !url.hash;
    })
    .optional(),
  enabled: z.boolean(),
  fileOnly: z.boolean().default(false),
  paused: z.boolean().default(false),
  lastSyncAt: instant.optional(),
  lastError: z
    .enum([
      "access_denied",
      "needs_reconnect",
      "unreachable",
      "unsupported",
      "invalid_response",
      "rate_limited",
    ])
    .optional(),
  courseMap: z
    .array(z.object({ remoteId, remoteName: name, courseId: id.optional() }))
    .max(1000),
});
export const parkingItemSchema = z.object({
  ...base,
  text: z.string().trim().min(1).max(2000),
  kind: z.enum(["thought", "lookup", "task", "idea", "distraction"]),
  sessionId: id.optional(),
  courseId: id.optional(),
  status: z.enum(["new", "converted", "done", "dismissed"]),
  convertedTo: z
    .object({ type: z.enum(["todo", "note", "planBlock"]), id })
    .optional(),
});
export const progressEventSchema = z.object({
  ...base,
  type: name,
  points: z.number().int().nonnegative(),
  sourceType: name,
  sourceId: id,
  occurredAt: instant,
  seasonId: id,
});
export const seasonSchema = z
  .object({
    ...base,
    name,
    start: date,
    end: date,
    skin: progressSkinSchema,
    rivalSeed: z.number().int(),
  })
  .refine((value) => value.start <= value.end);
export const achievementSchema = z.object({
  ...base,
  key: name,
  unlockedAt: instant,
});
export const resourceSchema = z.object({
  ...base,
  courseId: id,
  name,
  kind: z.enum(["link", "reading", "lab"]),
  url: https.optional(),
  complete: z.boolean().default(false),
  minutes: z.number().int().min(5).max(240).default(20),
});
export const addonCollections = {
  planBlocks: planBlockSchema,
  energyProfiles: energyProfileSchema,
  dayReviews: dayReviewSchema,
  examPlans: examPlanSchema,
  studySessions: studySessionSchema,
  formulas: formulaSchema,
  assignments: assignmentSchema,
  checklistTemplates: checklistTemplateSchema,
  lmsConnections: lmsConnectionSchema,
  parkingItems: parkingItemSchema,
  progressEvents: progressEventSchema,
  seasons: seasonSchema,
  achievements: achievementSchema,
  courseResources: resourceSchema,
};
export const addonState = {
  planBlocks: z.array(planBlockSchema).default([]),
  energyProfiles: z.array(energyProfileSchema).default([]),
  dayReviews: z.array(dayReviewSchema).default([]),
  examPlans: z.array(examPlanSchema).default([]),
  studySessions: z.array(studySessionSchema).default([]),
  formulas: z.array(formulaSchema).default([]),
  assignments: z.array(assignmentSchema).default([]),
  checklistTemplates: z.array(checklistTemplateSchema).default([]),
  lmsConnections: z.array(lmsConnectionSchema).default([]),
  parkingItems: z.array(parkingItemSchema).default([]),
  progressEvents: z.array(progressEventSchema).default([]),
  seasons: z.array(seasonSchema).default([]),
  achievements: z.array(achievementSchema).default([]),
  courseResources: z.array(resourceSchema).default([]),
};
