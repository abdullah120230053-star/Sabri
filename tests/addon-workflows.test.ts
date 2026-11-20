import { describe, expect, it } from "vitest";
import {
  active,
  applyPatch,
  courseSchema,
  emptyState,
  eventSchema,
  scheduleSchema,
  sessionSchema,
  stamp,
  taskSchema,
} from "../src/shared/schema";
import {
  examPlanSchema,
  formulaSchema,
  lmsConnectionSchema,
  parkingItemSchema,
  planBlockSchema,
  studySessionSchema,
} from "../src/shared/addon-schema";
import { generatePlan } from "../src/shared/logic/planner";
import { examSchedule, moveMissed } from "../src/shared/logic/exam-prep";
import { addDate, minutesAt } from "../src/shared/time";
import {
  recordProgress,
  rivals,
  themeUnlocked,
  xpForLevel,
} from "../src/shared/logic/progress";
import { reviewFormula } from "../src/shared/logic/leitner";
import { mapLms } from "../src/shared/logic/lms-mapping";
import { calculate } from "../src/shared/logic/calculator";
import { moodleCalendarItems } from "../src/main/integrations/moodle-ics";
import { sanitizeNote } from "../src/main/note-html";
import { addonNotices } from "../src/shared/logic/addon-notices";

const date = "2026-11-20",
  now = new Date(date + "T15:00:00Z");
const before = date + "T08:00:00Z";
const basicCourse = () =>
  courseSchema.parse({
    ...stamp(),
    name: "Signals",
    code: "EE301",
    instructor: "",
    creditHours: 3,
    color: "#333333",
    semester: "Fall",
    gradeComponents: [],
    finalGrade: "",
    absenceLimit: 0,
    absences: 0,
  });
const task = (fields: object) =>
  taskSchema.parse({
    ...stamp(undefined, before),
    title: "Signals",
    ...fields,
  });
const planSettings = {
  reviewSpacingDays: [2, 5],
  practiceShare: 0.25,
  restDayBefore: true,
  sessionMinutes: 50,
  maxHoursPerDay: 2,
};
const ics = (day: number) =>
  "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Sabri test//EN\r\nBEGIN:VEVENT\r\nUID:lab-123\r\nDTSTAMP:20261119T100000Z\r\nDTSTART:202611" +
  day +
  "T160000Z\r\nDTEND:202611" +
  day +
  "T173000Z\r\nSUMMARY:Lab assignment due\r\nEND:VEVENT\r\nEND:VCALENDAR";

describe("offline plan", () => {
  it("is deterministic and respects prayer, class, locked slots, the cap, and buffer", () => {
    const state = emptyState();
    state.settings.planner = {
      ...state.settings.planner,
      maxFocusHoursPerDay: 1,
      energyMode: "preset",
      energyPreset: "morning",
      dayStart: "08:00",
      dayEnd: "20:00",
    };
    state.schedule = [
      scheduleSchema.parse({
        ...stamp(),
        title: "Lecture",
        dayOfWeek: 5,
        start: "08:00",
        end: "08:45",
      }),
    ];
    const hard = task({
      title: "Hard lab",
      estimated: 3,
      priority: "urgent",
      dueDate: date,
    });
    const light = task({
      title: "Other action",
      estimated: 5,
      priority: "low",
    });
    state.tasks = [hard, light];
    state.planBlocks = [
      planBlockSchema.parse({
        ...stamp(),
        date,
        start: "10:00",
        end: "10:25",
        title: "Locked",
        kind: "focus",
        locked: true,
        status: "planned",
      }),
    ];
    const request = { date, pinned: [hard.id] };
    const result = generatePlan(state, request)[0]!;
    expect(result).toEqual(generatePlan(state, request)[0]!);
    expect(result.fixed.some((item) => item.title === "Jumu’ah")).toBe(true);
    expect(result.blocks.some((item) => item.kind === "buffer")).toBe(true);
    const focus = result.blocks.filter((item) => item.kind === "task");
    expect(focus[0]?.title).toBe("Hard lab");
    expect(focus[0]?.start).toBe("09:00");
    expect(
      focus.reduce(
        (sum, item) => sum + minutesAt(item.end) - minutesAt(item.start),
        25,
      ),
    ).toBeLessThanOrEqual(result.cap);
    for (const block of result.blocks) {
      const start = minutesAt(block.start),
        end = minutesAt(block.end);
      expect(
        result.fixed.some((item) => start < item.end && end > item.start),
      ).toBe(false);
      expect(start < 625 && end > 600).toBe(false);
    }
    expect(result.unused.map((item) => item.work.title)).toContain(
      "Other action",
    );
    expect(
      generatePlan(state, { date, fromMinute: 720 })[0]!.blocks.every(
        (item) => minutesAt(item.start) >= 720,
      ),
    ).toBe(true);
  });
});
describe("exam preparation", () => {
  it("sets learning and spaced reviews across exams under one daily cap", () => {
    const state = emptyState();
    state.settings.examPrep.maxHoursPerDay = 2;
    const course = basicCourse();
    state.courses = [course];
    const makeExam = (days: number) =>
      eventSchema.parse({
        ...stamp(),
        title: "Midterm",
        type: "exam",
        date: addDate(date, days),
        courseId: course.id,
      });
    state.calendar = [makeExam(10), makeExam(12)];
    state.examPlans = state.calendar.map((event) =>
      examPlanSchema.parse({
        ...stamp(),
        eventId: event.id,
        courseId: course.id,
        settings: planSettings,
        topics: [
          {
            id: stamp().id,
            name: "Hard",
            difficulty: 5,
            confidence: 2,
            estimatedHours: 2,
            resources: [],
          },
          {
            id: stamp().id,
            name: "Easy",
            difficulty: 2,
            confidence: 3,
            estimatedHours: 1,
            resources: [],
          },
        ],
      }),
    );
    const plan = examSchedule(state, date);
    const days = new Set(plan.sessions.map((item) => item.date));
    for (const day of days)
      expect(
        plan.sessions
          .filter((item) => item.date === day)
          .reduce((sum, item) => sum + item.minutes, 0),
      ).toBeLessThanOrEqual(120);
    for (const exam of active(state.examPlans))
      for (const topic of exam.topics) {
        const rows = plan.sessions.filter((item) => item.topicId === topic.id);
        const first = rows.find((item) => item.kind === "learn");
        const review = rows.find((item) => item.kind === "review");
        expect(first).toBeDefined();
        expect(review!.date >= addDate(first!.date, 2)).toBe(true);
      }
    const first = plan.sessions.find((item) => item.kind === "learn")!;
    state.studySessions = [
      studySessionSchema.parse({
        ...stamp(),
        ...first,
        date: addDate(date, -1),
      }),
    ];
    expect(moveMissed(state, date)[0]).toMatchObject({
      date,
      status: "rescheduled",
    });
  });
});
describe("LMS import and review tools", () => {
  it("deduplicates a Moodle file and marks a changed deadline without replacing local checklist state", () => {
    const state = emptyState(),
      course = basicCourse();
    state.courses = [course];
    const connection = lmsConnectionSchema.parse({
      ...stamp(),
      type: "moodle_ics",
      label: "Signals",
      enabled: true,
      courseMap: [
        { remoteId: "calendar", remoteName: "Signals", courseId: course.id },
      ],
    });
    const first = moodleCalendarItems(
      ics(22),
      state.settings.location.timezone,
      "Signals",
    );
    let updated = applyPatch(state, {
      changes: mapLms(state, connection, first.items, false, now).changes,
    });
    const row = updated.assignments[0]!;
    updated.assignments[0] = {
      ...row,
      checklist: [{ id: stamp().id, label: "Export report", done: true }],
    };
    expect(
      mapLms(updated, connection, first.items, false, now).counts.created,
    ).toBe(0);
    const revised = moodleCalendarItems(
      ics(24),
      state.settings.location.timezone,
      "Signals",
    );
    const result = mapLms(
      updated,
      connection,
      revised.items,
      false,
      new Date(date + "T16:00:00Z"),
    );
    expect(result.counts.changed).toBe(1);
    updated = applyPatch(updated, { changes: result.changes });
    expect(updated.assignments).toHaveLength(1);
    expect(updated.calendar).toHaveLength(1);
    expect(updated.assignments[0]).toMatchObject({
      id: row.id,
      upstream: { changed: true, previousDueAt: row.dueAt },
      checklist: [{ done: true }],
    });
  });
  it("advances and resets Leitner boxes and never evaluates expressions as JavaScript", () => {
    const formula = formulaSchema.parse({
      ...stamp(),
      name: "Energy",
      latex: "E=mc^2",
      variables: [],
      tags: [],
      examExtra: false,
      favorite: false,
      leitnerBox: 1,
    });
    const next = reviewFormula(formula, true, now);
    expect(next.leitnerBox).toBe(2);
    expect(Date.parse(next.nextReviewAt) - +now).toBe(2 * 86400000);
    expect(reviewFormula(next, false, now).leitnerBox).toBe(1);
    expect(calculate("sqrt(16)+2^3^2")).toBe(516);
    expect(() => calculate("console.log(3)")).toThrow();
    expect(
      sanitizeNote(
        '<span data-type="inline-math" data-latex="x^2" onclick="bad()">x</span><img src="https://example.invalid/a.png">',
      ),
    ).toContain('data-latex="x^2"');
    expect(
      sanitizeNote('<img src="https://example.invalid/a.png" onerror="bad()">'),
    ).not.toContain("https:");
  });
});
describe("progress and notifications", () => {
  it("uses one append-only log, caps parking, and omits worship and rushed completions", () => {
    const state = emptyState();
    state.tasks = [
      task({ status: "done", completedAt: date + "T08:00:20Z" }),
      task({ status: "done", completedAt: date + "T08:02:00Z" }),
    ];
    state.sessions = [
      sessionSchema.parse({
        ...stamp(),
        type: "focus",
        startedAt: before,
        endedAt: date + "T08:25:00Z",
        plannedMinutes: 25,
        actualMinutes: 25,
        completed: true,
      }),
    ];
    state.parkingItems = Array.from({ length: 8 }, () =>
      parkingItemSchema.parse({
        ...stamp(undefined, before),
        text: "Look up a topic",
        kind: "lookup",
        status: "new",
      }),
    );
    state.prayerDays = [
      {
        ...stamp(undefined, before),
        date,
        status: { fajr: "done" },
        sunnah: {},
        congregation: {},
        fasting: false,
        taraweeh: false,
      },
    ];
    const updated = recordProgress(state, now);
    expect(
      updated.progressEvents.filter((item) => item.sourceType === "task"),
    ).toHaveLength(1);
    expect(
      updated.progressEvents.filter((item) => item.sourceType === "worship"),
    ).toHaveLength(0);
    expect(
      updated.progressEvents
        .filter((item) => item.sourceType === "parking")
        .reduce((sum, item) => sum + item.points, 0),
    ).toBe(5);
    expect(
      recordProgress(
        { ...updated, settings: { ...updated.settings, theme: "nature" } },
        now,
      ).progressEvents,
    ).toEqual(updated.progressEvents);
    expect(xpForLevel(3)).toBe(520);
    expect(rivals(100, 60, date, "normal")).toEqual(
      rivals(100, 60, date, "normal"),
    );
    expect(themeUnlocked(updated, "nature")).toBe(true);
    expect(
      themeUnlocked(
        {
          ...updated,
          settings: {
            ...updated.settings,
            progress: {
              ...updated.settings.progress,
              rewardMode: "earn-themes",
            },
          },
        },
        "nature",
      ),
    ).toBe(false);
  });
  it("emits only the due assignment lead and leaves reminders quiet during exams", () => {
    const state = emptyState(),
      course = basicCourse();
    state.courses = [course];
    const connection = lmsConnectionSchema.parse({
      ...stamp(),
      type: "moodle_ics",
      label: "Signals",
      enabled: true,
      courseMap: [
        { remoteId: "calendar", remoteName: "Signals", courseId: course.id },
      ],
    });
    const draft = moodleCalendarItems(
      ics(22),
      state.settings.location.timezone,
      "Signals",
    );
    const updated = applyPatch(state, {
      changes: mapLms(state, connection, draft.items, false, now).changes,
    });
    const deadline = Date.parse(updated.assignments[0]!.dueAt!) - 180 * 60000;
    expect(
      addonNotices(
        updated,
        new Date(deadline),
        deadline - 1000,
        false,
      ).notices.filter((item) => item.kind === "assignment"),
    ).toHaveLength(1);
    expect(
      addonNotices(updated, new Date(deadline), deadline - 1000, true).notices,
    ).toHaveLength(0);
  });
});
