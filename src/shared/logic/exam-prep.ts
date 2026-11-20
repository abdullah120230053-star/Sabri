import { active, type State, type RecordFor } from "../schema";
import { addDate, dateSpan, dayOf } from "../time";

type Exam = RecordFor<"examPlans">;
type Topic = Exam["topics"][number];
type Study = RecordFor<"studySessions">;
type Draft = Pick<
  Study,
  "planId" | "topicId" | "kind" | "date" | "minutes" | "status"
>;
export type ExamSchedule = {
  sessions: Draft[];
  didNotFit: {
    planId: string;
    topicId: string;
    reason: "minimum" | "practice";
  }[];
};
export const weight = (topic: Topic) =>
  topic.difficulty * (6 - topic.confidence);
export const suggestedMinutes = (difficulty: number, confidence: number) =>
  (6 - confidence) * difficulty * 15;

export function examSchedule(
  state: State,
  today: string,
  only?: string,
): ExamSchedule {
  const events = active(state.calendar),
    exams = active(state.examPlans)
      .flatMap((plan) => {
        const event = events.find((item) => item.id === plan.eventId);
        return event && event.date > today ? [{ plan, event }] : [];
      })
      .sort(
        (a, b) =>
          a.event.date.localeCompare(b.event.date) ||
          a.plan.id.localeCompare(b.plan.id),
      );
  const busy = new Map<string, number>(),
    byExam = new Map<string, number>();
  const result: ExamSchedule = { sessions: [], didNotFit: [] };
  const previous = active(state.studySessions).filter(
    (row) =>
      row.status === "done" ||
      (only &&
        row.planId !== only &&
        ["planned", "rescheduled"].includes(row.status)),
  );
  const changeLoad = (planId: string, date: string, change: number) => {
    busy.set(date, (busy.get(date) ?? 0) + change);
    const key = planId + date;
    byExam.set(key, (byExam.get(key) ?? 0) + change);
  };
  for (const row of previous) changeLoad(row.planId, row.date, row.minutes);
  for (const { plan, event } of exams) {
    if (only && only !== plan.id) continue;
    const settings = plan.settings;
    const last = addDate(event.date, settings.restDayBefore ? -2 : -1);
    const days = Array.from(
      { length: Math.max(0, Math.min(730, dateSpan(today, last) + 1)) },
      (_, index) => addDate(today, index),
    ).filter(
      (date) =>
        !(settings.blockedDates ?? []).includes(date) &&
        !events.some(
          (item) =>
            (item.type === "exam" || item.type === "holiday") &&
            item.date === date,
        ),
    );
    const capacity = (date: string) =>
      Math.max(
        0,
        Math.floor(
          Math.min(
            state.settings.examPrep.maxHoursPerDay * 60 - (busy.get(date) ?? 0),
            Math.min(
              settings.maxHoursPerDay,
              settings.availableHoursByWeekday?.[dayOf(date)] ?? 24,
            ) *
              60 -
              (byExam.get(plan.id + date) ?? 0),
          ),
        ),
      );
    const make = (
      topic: Topic,
      kind: Study["kind"],
      date: string,
      minutes: number,
    ) => {
      changeLoad(plan.id, date, minutes);
      return {
        planId: plan.id,
        topicId: topic.id,
        kind,
        date,
        minutes,
        status: "planned" as const,
      };
    };
    const practiceStart = addDate(
      last,
      -Math.max(0, Math.round(days.length * settings.practiceShare) - 1),
    );
    const extraWork: { topic: Topic; first: string; minutes: number }[] = [];
    for (const topic of plan.topics
      .slice()
      .sort((a, b) => weight(b) - weight(a) || a.id.localeCompare(b.id))) {
      const prior = previous.filter(
        (item) =>
          item.planId === plan.id &&
          item.topicId === topic.id &&
          item.status === "done",
      );
      const spaced = [...settings.reviewSpacingDays].sort((a, b) => a - b);
      const reviewLength = Math.min(25, settings.sessionMinutes);
      const firstDone = prior
        .filter((item) => item.kind === "learn")
        .sort((a, b) => a.date.localeCompare(b.date))[0];
      const total = Math.ceil(topic.estimatedHours * 60);
      const firstLength = Math.min(settings.sessionMinutes, total);
      let first = firstDone?.date;
      const made: Draft[] = [];
      const checkedReview = prior.some((item) => item.kind === "review");
      if (!first) {
        first = days.find(
          (date) =>
            capacity(date) >= firstLength &&
            days.some(
              (other) => other > date && capacity(other) >= reviewLength,
            ),
        );
        if (first) made.push(make(topic, "learn", first, firstLength));
      }
      if (!first) {
        result.didNotFit.push({
          planId: plan.id,
          topicId: topic.id,
          reason: "minimum",
        });
        continue;
      }
      const usedReviewDates = new Set(
        prior.filter((item) => item.kind === "review").map((item) => item.date),
      );
      for (const delay of spaced) {
        const target = addDate(first, delay);
        if (target >= event.date || usedReviewDates.has(target)) continue;
        const date = days.find(
          (day) =>
            day >= target &&
            day >= addDate(first!, spaced[0] ?? 2) &&
            !usedReviewDates.has(day) &&
            capacity(day) >= reviewLength,
        );
        if (date) {
          made.push(make(topic, "review", date, reviewLength));
          usedReviewDates.add(date);
        }
      }
      if (!checkedReview && !usedReviewDates.size) {
        const fallback = days.find(
          (day) => day > first! && capacity(day) >= reviewLength,
        );
        if (fallback) {
          made.push(make(topic, "review", fallback, reviewLength));
          usedReviewDates.add(fallback);
        } else {
          for (const row of made)
            changeLoad(row.planId, row.date, -row.minutes);
          result.didNotFit.push({
            planId: plan.id,
            topicId: topic.id,
            reason: "minimum",
          });
          continue;
        }
      }
      result.sessions.push(...made);
      const learned =
        prior
          .filter((item) => item.kind === "learn")
          .reduce((sum, item) => sum + item.minutes, 0) +
        made
          .filter((item) => item.kind === "learn")
          .reduce((sum, item) => sum + item.minutes, 0);
      extraWork.push({ topic, first, minutes: Math.max(0, total - learned) });
      if (
        topic.confidence <= 2 &&
        !prior.some((item) => item.confidenceAfter && item.confidenceAfter >= 3)
      ) {
        const date = days.find(
          (day) =>
            day >= addDate(first!, spaced[0] ?? 2) &&
            !usedReviewDates.has(day) &&
            capacity(day) >= reviewLength,
        );
        if (date)
          result.sessions.push(make(topic, "review", date, reviewLength));
      }
    }
    for (const { topic, first, minutes } of extraWork) {
      const planPhase = (
        amount: number,
        kind: "learn" | "practice",
        offered: string[],
      ) => {
        let left = amount;
        for (const date of offered) {
          while (left > 0) {
            const available = capacity(date);
            if (available < Math.min(15, left)) break;
            const length = Math.min(available, settings.sessionMinutes, left);
            result.sessions.push(make(topic, kind, date, length));
            left -= length;
          }
          if (!left) break;
        }
        return left;
      };
      const practice = Math.round(minutes * settings.practiceShare);
      const learnedLeft = planPhase(
        minutes - practice,
        "learn",
        days.filter((date) => date >= first),
      );
      const extra =
        learnedLeft +
        planPhase(
          practice,
          "practice",
          days.filter((date) => date >= first && date >= practiceStart),
        );
      if (extra > 0)
        result.didNotFit.push({
          planId: plan.id,
          topicId: topic.id,
          reason: "practice",
        });
    }
    const topic = plan.topics[0];
    const lastDay = days.at(-1);
    if (
      topic &&
      lastDay &&
      capacity(lastDay) >= 15 &&
      !previous.some((item) => item.planId === plan.id && item.kind === "recap")
    )
      result.sessions.push(make(topic, "recap", lastDay, 15));
  }
  result.sessions.sort((a, b) => a.date.localeCompare(b.date));
  return result;
}

export function moveMissed(state: State, today: string) {
  const caps = new Map<string, number>(),
    examCaps = new Map<string, number>();
  const events = active(state.calendar),
    plans = active(state.examPlans);
  const sessions = active(state.studySessions);
  const add = (item: Study) => {
    caps.set(item.date, (caps.get(item.date) ?? 0) + item.minutes);
    const key = item.planId + item.date;
    examCaps.set(key, (examCaps.get(key) ?? 0) + item.minutes);
  };
  sessions
    .filter((item) => item.date >= today && item.status !== "missed")
    .forEach(add);
  return sessions
    .filter(
      (item) =>
        item.date < today && ["planned", "rescheduled"].includes(item.status),
    )
    .map((item) => {
      const plan = plans.find((plan) => plan.id === item.planId),
        event = events.find((event) => event.id === plan?.eventId);
      if (!plan || !event) return { ...item, status: "missed" as const };
      const last = addDate(event.date, plan.settings.restDayBefore ? -2 : -1);
      for (
        let date = today;
        date <= last && dateSpan(today, date) < 730;
        date = addDate(date, 1)
      ) {
        if (
          (plan.settings.blockedDates ?? []).includes(date) ||
          events.some(
            (event) =>
              event.date === date && ["exam", "holiday"].includes(event.type),
          )
        )
          continue;
        const cap =
          Math.min(
            plan.settings.maxHoursPerDay,
            plan.settings.availableHoursByWeekday?.[dayOf(date)] ?? 24,
          ) * 60;
        if (
          (caps.get(date) ?? 0) + item.minutes >
            state.settings.examPrep.maxHoursPerDay * 60 ||
          (examCaps.get(item.planId + date) ?? 0) + item.minutes > cap
        )
          continue;
        const updated = { ...item, date, status: "rescheduled" as const };
        add(updated);
        return updated;
      }
      return { ...item, status: "missed" as const };
    });
}

export function examReadiness(plan: Exam, sessions: Study[]) {
  const rows = active(sessions).filter((item) => item.planId === plan.id);
  let total = 0,
    points = 0;
  for (const topic of plan.topics) {
    const assigned = rows.filter((item) => item.topicId === topic.id),
      completed = assigned.filter((item) => item.status === "done");
    const ratio = assigned.length ? completed.length / assigned.length : 0;
    const value =
      completed
        .slice()
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
        ?.confidenceAfter ?? topic.confidence;
    const weighted = weight(topic);
    total += weighted;
    points += weighted * (ratio * 0.65 + ((value - 1) / 4) * 0.35);
  }
  return total ? Math.round((points / total) * 100) : 0;
}
