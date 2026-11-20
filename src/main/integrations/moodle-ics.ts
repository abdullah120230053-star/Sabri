import { parseIcs } from "../import-ics";
import { calendarUrl } from "../import-service";
import { atTime } from "../../shared/time";
import type { LmsItem } from "../../shared/logic/lms-mapping";
import { cleanText, limitedText } from "./http";

export function moodleCalendarItems(raw: string, zone: string, label: string) {
  const preview = parseIcs(raw, zone);
  const items: LmsItem[] = preview.rows.flatMap((row) => {
    if (
      !row.externalUid ||
      !row.date ||
      row.recurrence !== "once" ||
      row.eventType === "exam"
    )
      return [];
    const title = cleanText(row.title);
    if (!title) return [];
    const kind =
      row.eventType === "quiz"
        ? "quiz"
        : /\b(?:lab|practical)\b|مختبر/i.test(title)
          ? "lab"
          : /\bproject\b|مشروع/i.test(title)
            ? "project"
            : "homework";
    return [
      {
        id: row.externalUid,
        title,
        course: { id: "calendar", name: label },
        kind,
        cancelled: row.cancelled,
        dueAt: atTime(row.date, row.start || "23:59", zone).toISOString(),
      },
    ];
  });
  return { items, complete: false };
}
export async function readMoodleCalendar(
  url: string,
  zone: string,
  label: string,
) {
  const response = await fetch(calendarUrl(url), {
    headers: { Accept: "text/calendar" },
    redirect: "error",
    signal: AbortSignal.timeout(18000),
  });
  return moodleCalendarItems(await limitedText(response), zone, label);
}
