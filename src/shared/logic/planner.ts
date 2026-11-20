import { z } from "zod";
import { formatInTimeZone } from "date-fns-tz";
import { active, date, type RecordFor, type State } from "../schema";
import {
  addDate,
  blocksOn,
  dateSpan,
  dayOf,
  dayKey,
  minuteTime,
  minutesAt,
} from "../time";
import { computePrayers } from "../prayer";
import { energyFor } from "./energy";

export const plannerRequest = z.object({
  date,
  count: z.union([z.literal(1), z.literal(7)]).default(1),
  fromMinute: z.number().int().min(0).max(1439).optional(),
  energy: z.enum(["low", "normal", "high"]).default("normal"),
  load: z.enum(["light", "normal", "heavy"]).default("normal"),
  examPeriod: z.boolean().default(false),
  pinned: z.array(z.uuid()).max(3).default([]),
});
export type PlannerRequest = z.input<typeof plannerRequest>;
type Block = RecordFor<"planBlocks">;
export type DraftBlock = Pick<
  Block,
  | "date"
  | "start"
  | "end"
  | "kind"
  | "title"
  | "refId"
  | "refType"
  | "reason"
  | "locked"
  | "status"
>;
type Work = Pick<DraftBlock, "refId" | "refType" | "kind" | "title"> & {
  key: string;
  length: number;
  priority: number;
  course?: string;
  due?: string;
  earliest?: string;
  only?: string;
  touched: string;
  heavy: boolean;
};
export type FixedBlock = { start: number; end: number; title: string };
export type PlanDay = {
  date: string;
  cap: number;
  fixed: FixedBlock[];
  blocks: DraftBlock[];
  unused: { work: Work; minutes: number; reason: "capacity" | "window" }[];
};

const rank = { low: 1, medium: 2, high: 3, urgent: 4 };
const isStudy = (kind: Block["kind"]) =>
  !["break", "habit", "buffer"].includes(kind);
const collides = (from: number, to: number, block: FixedBlock) =>
  from < block.end && to > block.start;

function collect(state: State, today: string, last: string) {
  const zone = state.settings.location.timezone,
    work: Work[] = [];
  for (const item of active(state.tasks))
    if (item.status !== "done" && (!item.deferUntil || item.deferUntil <= last))
      work.push({
        key: item.id,
        refId: item.id,
        refType: "todo",
        kind: "task",
        title: item.title,
        length:
          Math.max(1, item.estimated - item.pomodoros) *
          state.settings.focus.work,
        priority: rank[item.priority],
        course: item.courseId,
        due: item.dueDate,
        earliest: item.deferUntil,
        touched: item.updatedAt,
        heavy: item.estimated > 1 || rank[item.priority] >= 3,
      });
  for (const item of active(state.assignments))
    if (
      !["ready", "submitted", "graded"].includes(item.status) &&
      !item.upstream?.removed
    )
      work.push({
        key: item.id,
        refId: item.id,
        refType: "assignment",
        kind: "assignment",
        title: item.title,
        length: Math.max(
          1,
          (item.estimatedMinutes ?? 50) - item.timeSpentMinutes,
        ),
        priority: 3,
        course: item.courseId,
        due: item.dueAt ? dayKey(new Date(item.dueAt), zone) : undefined,
        touched: item.updatedAt,
        heavy: true,
      });
  for (const item of active(state.studySessions))
    if (
      (item.status === "planned" || item.status === "rescheduled") &&
      item.date <= last
    ) {
      const plan = active(state.examPlans).find(
          (plan) => plan.id === item.planId,
        ),
        topic = plan?.topics.find((topic) => topic.id === item.topicId);
      if (topic && plan)
        work.push({
          key: item.id,
          refId: item.id,
          refType: "studySession",
          kind: item.kind === "review" ? "review" : "exam_prep",
          title: topic.name,
          length: item.minutes,
          priority: 4,
          course: plan.courseId,
          touched: item.updatedAt,
          only: item.date < today ? today : item.date,
          heavy: item.kind !== "review",
        });
    }
  for (const formula of active(state.formulas))
    if (
      formula.nextReviewAt &&
      dayKey(new Date(formula.nextReviewAt), zone) <= last
    )
      work.push({
        key: formula.id,
        kind: "review",
        title: formula.name,
        length: 15,
        priority: 2,
        course: formula.courseId,
        due: dayKey(new Date(formula.nextReviewAt), zone),
        touched: formula.updatedAt,
        heavy: false,
      });
  for (const row of active(state.courseResources))
    if (row.kind === "reading" && !row.complete)
      work.push({
        key: row.id,
        kind: "review",
        title: row.name,
        length: row.minutes,
        priority: 1,
        course: row.courseId,
        touched: row.updatedAt,
        heavy: false,
      });
  for (let day = today; day <= last; day = addDate(day, 1))
    for (const item of active(state.habits)) {
      if (
        item.archived ||
        !item.remindAt ||
        (item.frequency === "weekly" &&
          dayOf(day) !== (item.targetDays[0] ?? state.settings.weekStart)) ||
        (item.frequency === "specific_days" &&
          !item.targetDays.includes(dayOf(day)))
      )
        continue;
      if (
        active(state.habitLogs).some(
          (log) =>
            log.habitId === item.id &&
            log.date === day &&
            log.value >= item.targetCount,
        )
      )
        continue;
      work.push({
        key: item.id + day,
        refId: item.id,
        refType: "habit",
        kind: "habit",
        title: item.name,
        length: 15,
        priority: 1,
        touched: item.updatedAt,
        only: day,
        heavy: false,
      });
    }
  return work;
}

export function fixedPlanBlocks(state: State, date: string) {
  const { planner, location } = state.settings;
  const occupied: FixedBlock[] = blocksOn(state.schedule, date).map((row) => ({
    start: minutesAt(row.start) - planner.commuteBufferMin,
    end: minutesAt(row.end) + planner.commuteBufferMin,
    title: row.title,
  }));
  for (const row of active(state.calendar))
    if (row.date === date && row.time)
      occupied.push({
        start: minutesAt(row.time),
        end:
          row.endTime && row.endTime > row.time
            ? minutesAt(row.endTime)
            : minutesAt(row.time) + 60,
        title: row.title,
      });
  for (const [name, time] of Object.entries(
    computePrayers(date, state.settings),
  ))
    if (name !== "sunrise" && time) {
      const start = minutesAt(
          formatInTimeZone(new Date(time), location.timezone, "HH:mm"),
        ),
        friday = dayOf(date) === 5 && name === "dhuhr";
      occupied.push({
        start: start - planner.prayerBufferBeforeMin - (friday ? 10 : 0),
        end: start + planner.prayerBufferAfterMin + (friday ? 25 : 0),
        title: friday ? "Jumu’ah" : name,
      });
    }
  for (const meal of planner.meals)
    occupied.push({
      start: minutesAt(meal.start),
      end: minutesAt(meal.end),
      title: meal.label,
    });
  return occupied;
}

export function generatePlan(state: State, input: PlannerRequest): PlanDay[] {
  const request = plannerRequest.parse(input),
    { planner, focus } = state.settings,
    last = addDate(request.date, request.count - 1);
  const work = collect(state, request.date, last),
    energy = energyFor(state, request.date),
    pinned = new Set(request.pinned);
  const remembered = active(state.planBlocks).filter(
    (item) =>
      item.date >= request.date &&
      item.date <= last &&
      !["skipped", "moved"].includes(item.status),
  );
  const left = new Map(work.map((item) => [item.key, item.length]));
  for (const item of remembered)
    if (
      item.refId &&
      (item.locked ||
        item.status === "done" ||
        (item.date === request.date &&
          minutesAt(item.start) < (request.fromMinute ?? 0)))
    ) {
      const key =
        item.refType === "habit" ? item.refId + item.date : item.refId;
      left.set(
        key,
        Math.max(
          0,
          (left.get(key) ?? 0) + minutesAt(item.start) - minutesAt(item.end),
        ),
      );
    }
  return Array.from({ length: request.count }, (_, offset) => {
    const date = addDate(request.date, offset),
      start = Math.max(
        minutesAt(planner.dayStart),
        offset === 0 ? (request.fromMinute ?? 0) : 0,
      ),
      end = minutesAt(planner.dayEnd);
    const fixed = fixedPlanBlocks(state, date),
      kept = remembered.filter(
        (item) =>
          item.date === date &&
          (item.locked ||
            item.status === "done" ||
            minutesAt(item.start) < start),
      );
    const occupied = [
      ...fixed,
      ...kept.map((item) => ({
        start: minutesAt(item.start),
        end: minutesAt(item.end),
        title: item.title ?? "",
      })),
    ];
    const stock = Array.from(
      { length: Math.max(0, end - start) },
      (_, i) => start + i,
    ).reduce(
      (sum, minute) =>
        sum +
        Number(!occupied.some((item) => collides(minute, minute + 1, item))),
      0,
    );
    let room = Math.floor(stock * (1 - planner.bufferPercent / 100));
    const slack = stock - room;
    const cap = Math.floor(
      planner.maxFocusHoursPerDay *
        60 *
        (request.energy === "low" ? 0.75 : 1) *
        (request.load === "light" ? 0.7 : 1),
    );
    let used = kept
      .filter((item) => isStudy(item.kind))
      .reduce(
        (sum, item) => sum + minutesAt(item.end) - minutesAt(item.start),
        0,
      );
    const score = (item: Work) => {
      const due = Math.max(0, item.due ? dateSpan(date, item.due) : 90),
        stale = Math.min(
          25,
          Math.max(0, dateSpan(item.touched.slice(0, 10), date)),
        );
      const course = active(state.courses).find(
        (course) => course.id === item.course,
      );
      const nearby =
        !!course &&
        active(state.calendar).some(
          (event) =>
            event.type === "exam" &&
            event.courseId === course.id &&
            event.date >= date &&
            dateSpan(date, event.date) <= 10,
        );
      return (
        Number(pinned.has(item.key)) * 100 +
        16 * Math.exp(-due / 4) +
        4 * item.priority +
        Math.min(6, item.length / 25) +
        stale * 0.19 +
        (course?.creditHours ?? 0) * 0.4 +
        Number(nearby) * 2
      );
    };
    const eligible = work.filter(
      (item) =>
        (left.get(item.key) ?? 0) > 0 &&
        (!item.only || item.only === date) &&
        (!item.earliest || item.earliest <= date),
    );
    eligible.sort((a, b) => score(b) - score(a) || a.key.localeCompare(b.key));
    let rounds = 0,
      lastCourse: string | undefined,
      lastEnd = 0;
    const blocks: DraftBlock[] = [];
    for (const item of eligible) {
      if (request.examPeriod && item.priority < 3 && !pinned.has(item.key))
        continue;
      let remaining = left.get(item.key) ?? 0;
      while (remaining > 0) {
        const light = item.kind === "habit" || item.kind === "review";
        const min = light
          ? Math.min(15, planner.minBlockMin)
          : planner.minBlockMin;
        const len = Math.ceil(
          Math.max(
            min,
            Math.min(
              remaining,
              Math.max(min, focus.work * (request.energy === "low" ? 0.8 : 1)),
            ),
          ),
        );
        const rest = light
          ? 0
          : (rounds + 1) % focus.rounds === 0
            ? focus.long
            : focus.short;
        if (room < len + rest || (isStudy(item.kind) && used + len > cap))
          break;
        if (
          request.count === 7 &&
          request.load !== "heavy" &&
          offset < 6 &&
          used >= cap * 0.65 &&
          !pinned.has(item.key) &&
          !item.only &&
          (!item.due || item.due > date)
        )
          break;
        let point: number | undefined,
          best = -Infinity;
        for (let moment = start; moment + len + rest <= end; moment += 5) {
          if (
            occupied.some((row) => collides(moment, moment + len + rest, row))
          )
            continue;
          const power = energy[dayOf(date)]?.[Math.floor(moment / 60)] ?? 0.5;
          const strength =
            (item.heavy ? power : 1 - power) +
            Number(
              !!lastCourse && lastCourse === item.course && lastEnd === moment,
            ) *
              0.16;
          if (strength > best) {
            point = moment;
            best = strength;
          }
        }
        if (point === undefined) break;
        const finish = point + len;
        const reason = pinned.has(item.key)
          ? "Pinned as one of your Big 3"
          : item.heavy
            ? "Placed in a higher-energy window"
            : "Placed in a lower-energy window";
        blocks.push({
          date,
          start: minuteTime(point),
          end: minuteTime(finish),
          kind: item.kind,
          refId: item.refId,
          refType: item.refType,
          title: item.title,
          reason,
          locked: false,
          status: "planned",
        });
        if (rest)
          blocks.push({
            date,
            start: minuteTime(finish),
            end: minuteTime(finish + rest),
            kind: "break",
            title: "Break",
            reason: "Rest after a study block",
            locked: false,
            status: "planned",
          });
        occupied.push({
          start: point,
          end: finish + rest,
          title: item.title ?? "",
        });
        room -= len + rest;
        if (isStudy(item.kind)) used += len;
        if (!light) rounds++;
        lastEnd = finish + rest;
        lastCourse = item.course;
        remaining = Math.max(0, remaining - len);
        left.set(item.key, remaining);
      }
    }
    const unused: PlanDay["unused"] = eligible
      .filter((item) => (left.get(item.key) ?? 0) > 0)
      .map((item) => ({
        work: item,
        minutes: left.get(item.key)!,
        reason:
          room < planner.minBlockMin || used >= cap ? "capacity" : "window",
      }));
    let reserved = slack;
    for (let minute = end; minute > start && reserved > 0;) {
      const finish = minute;
      while (
        minute > start &&
        !occupied.some((item) => collides(minute - 1, minute, item)) &&
        finish - minute < reserved
      )
        minute--;
      if (finish - minute >= 5) {
        blocks.push({
          date,
          start: minuteTime(minute),
          end: minuteTime(finish),
          kind: "buffer",
          title: "Buffer",
          reason: "Reserved breathing room",
          locked: false,
          status: "planned",
        });
        reserved -= finish - minute;
      }
      minute--;
    }
    return {
      date,
      cap,
      fixed: fixed.filter((item) => collides(start, end, item)),
      blocks: blocks.sort((a, b) => a.start.localeCompare(b.start)),
      unused,
    };
  });
}

export function referencedBlockDone(block: Block, state: State) {
  if (block.status === "done") return true;
  if (block.refType === "todo")
    return active(state.tasks).some(
      (item) => item.id === block.refId && item.status === "done",
    );
  if (block.refType === "studySession")
    return active(state.studySessions).some(
      (item) => item.id === block.refId && item.status === "done",
    );
  if (block.refType === "assignment")
    return active(state.assignments).some(
      (item) =>
        item.id === block.refId &&
        ["submitted", "graded"].includes(item.status),
    );
  if (block.refType === "habit")
    return active(state.habitLogs).some(
      (log) =>
        log.habitId === block.refId && log.date === block.date && log.value > 0,
    );
  return false;
}
