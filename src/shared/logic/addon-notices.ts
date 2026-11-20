import { active, type State } from "../schema";
import { addDate, atTime, dayKey } from "../time";
import { moveMissed } from "./exam-prep";

type Notice = Pick<
  State["notices"][number],
  "title" | "body" | "kind" | "reference"
>;
export function addonNotices(
  state: State,
  time: Date,
  since: number,
  quiet: boolean,
) {
  const { settings } = state,
    zone = settings.location.timezone,
    today = dayKey(time, zone),
    ar = settings.language === "ar";
  const notices: Notice[] = [];
  const candidate = (
    title: string,
    body: string,
    kind: string,
    reference: string,
  ) => notices.push({ title, body: body.slice(0, 500), kind, reference });
  const timeReached = (hhmm: string) => +atTime(today, hhmm, zone) <= +time;
  const rescheduled =
    settings.examPrep.reminders && timeReached(settings.examPrep.remindAt)
      ? moveMissed(state, today)
      : [];
  if (
    settings.examPrep.reminders &&
    rescheduled.length &&
    timeReached(settings.examPrep.remindAt) &&
    !quiet
  )
    candidate(
      ar ? "أُعدّت خطة للتعويض" : "Exam catch-up ready",
      String(
        rescheduled.filter((item) => item.status === "rescheduled").length,
      ),
      "exam-catchup",
      today,
    );
  if (quiet) return { notices, rescheduled };
  for (const item of active(state.assignments)) {
    if (
      !item.dueAt ||
      item.upstream?.removed ||
      ["submitted", "graded"].includes(item.status)
    )
      continue;
    for (const lead of new Set(item.reminderMinutes)) {
      const at = Date.parse(item.dueAt) - lead * 60000;
      if (at > since && at <= +time)
        candidate(
          ar ? "اقترب تسليم الواجب" : "Assignment deadline",
          item.title,
          "assignment",
          item.id + ":" + item.dueAt + ":" + lead,
        );
    }
  }
  if (settings.examPrep.reminders) {
    for (const item of active(state.studySessions)) {
      if (
        item.date !== today ||
        !["planned", "rescheduled"].includes(item.status)
      )
        continue;
      const block = active(state.planBlocks).find(
        (block) =>
          block.refType === "studySession" &&
          block.refId === item.id &&
          block.date === today,
      );
      if (!timeReached(block?.start ?? settings.examPrep.remindAt)) continue;
      const plan = active(state.examPlans).find(
        (plan) => plan.id === item.planId,
      );
      const topic = plan?.topics.find((topic) => topic.id === item.topicId);
      if (topic)
        candidate(
          ar ? "حان وقت مراجعة الامتحان" : "Exam prep session",
          topic.name,
          "exam-prep",
          item.id + ":" + today,
        );
    }
    const exam = active(state.calendar).filter(
      (event) => event.type === "exam" && event.date === addDate(today, 1),
    );
    if (timeReached("19:00"))
      for (const item of exam)
        if (active(state.examPlans).some((plan) => plan.eventId === item.id))
          candidate(
            ar ? "قائمة الاستعداد للامتحان" : "Exam-day checklist",
            item.title,
            "exam-checklist",
            item.id + ":" + today,
          );
  }
  const due = active(state.formulas).filter(
    (item) => !item.nextReviewAt || Date.parse(item.nextReviewAt) <= +time,
  );
  if (
    settings.formulaReminder.enabled &&
    timeReached(settings.formulaReminder.time) &&
    due.length
  )
    candidate(
      ar ? "مراجعة المعادلات" : "Formula review",
      String(due.length),
      "formula-review",
      today,
    );
  if (
    settings.planner.shutdownEnabled &&
    timeReached(settings.planner.shutdownReminderAt) &&
    !active(state.dayReviews).some(
      (item) => item.date === today && item.reviewed,
    )
  )
    candidate(
      ar ? "حان وقت مراجعة اليوم" : "Daily shutdown",
      "",
      "shutdown",
      today,
    );
  return { notices, rescheduled };
}
