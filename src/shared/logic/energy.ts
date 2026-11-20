import { formatInTimeZone } from "date-fns-tz";
import { active, type State } from "../schema";
import { addDate, dayKey, dayOf } from "../time";

export type EnergyPreset = "morning" | "balanced" | "night";

export function presetEnergy(preset: EnergyPreset) {
  const peak = { morning: 9, balanced: 13, night: 19 }[preset];
  return Array.from({ length: 7 }, () =>
    Array.from({ length: 24 }, (_, hour) =>
      Math.max(0.15, 0.95 - Math.abs(hour - peak) * 0.072),
    ),
  );
}

export function energyFor(state: State, date: string) {
  const fallback = presetEnergy(state.settings.planner.energyPreset);
  const profile = active(state.energyProfiles).find(
    (item) => item.source === "manual",
  );
  if (state.settings.planner.energyMode === "manual")
    return profile?.hours ?? fallback;
  if (state.settings.planner.energyMode === "preset") return fallback;
  const zone = state.settings.location.timezone;
  const cutoff = addDate(date, -28);
  const scores = new Map<number, { count: number; sum: number }>();
  const parked = active(state.parkingItems);
  let total = 0;
  for (const session of active(state.sessions)) {
    if (session.type !== "focus") continue;
    const started = new Date(session.startedAt);
    const dateKey = dayKey(started, zone);
    if (dateKey < cutoff || dateKey > date) continue;
    const hour = Number(formatInTimeZone(started, zone, "HH"));
    const key = dayOf(dateKey) * 24 + hour;
    const review = active(state.dayReviews).find(
      (entry) => entry.date === dateKey,
    );
    const interruptions = parked.filter(
      (item) =>
        item.sessionId === session.id ||
        (!item.sessionId &&
          item.createdAt >= session.startedAt &&
          item.createdAt <= session.endedAt),
    ).length;
    const performance = Math.min(
      1,
      session.actualMinutes / Math.max(1, session.plannedMinutes),
    );
    const focus = (session.focusRating ?? review?.focusRating ?? 3) / 5;
    const score = Math.max(
      0,
      0.55 * performance +
        0.35 * focus +
        0.1 * Number(session.completed) -
        Math.min(0.2, interruptions * 0.035),
    );
    const bucket = scores.get(key) ?? { count: 0, sum: 0 };
    scores.set(key, { count: bucket.count + 1, sum: bucket.sum + score });
    total++;
  }
  if (total < 20) return fallback;
  return fallback.map((row, day) =>
    row.map((preset, hour) => {
      const bucket = scores.get(day * 24 + hour);
      if (!bucket || bucket.count < 2) return preset;
      return (preset * 3 + bucket.sum) / (3 + bucket.count);
    }),
  );
}
