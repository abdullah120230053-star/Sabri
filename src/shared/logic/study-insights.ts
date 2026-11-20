import { active, type State } from "../schema";
import { dayKey } from "../time";

export function focusScore(state: State, day: string) {
  const zone = state.settings.location.timezone;
  const sessions = active(state.sessions).filter(
    (item) =>
      item.type === "focus" && dayKey(new Date(item.endedAt), zone) === day,
  );
  const completed = sessions.filter((item) => item.completed);
  const minutes = completed.reduce((sum, item) => sum + item.actualMinutes, 0);
  const disruptions = active(state.parkingItems).filter(
    (item) =>
      item.sessionId &&
      sessions.some((session) => session.id === item.sessionId),
  ).length;
  if (!sessions.length) return null;
  const completion = completed.length / sessions.length;
  const goal = Math.min(1, minutes / state.settings.focus.dailyGoal);
  return Math.max(
    0,
    Math.round(45 * completion + 55 * goal - Math.min(20, disruptions * 2)),
  );
}
