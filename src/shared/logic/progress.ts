import { active, stamp, type State, type RecordFor } from "../schema";
import { addDate, dateSpan, dayKey, weekAt } from "../time";

type Earn = Pick<
  RecordFor<"progressEvents">,
  "type" | "sourceType" | "sourceId" | "occurredAt" | "points"
>;
const rules = {
  focus: 10,
  low: 3,
  medium: 5,
  high: 8,
  urgent: 10,
  assignment: 20,
  early: 10,
  exam: 8,
  review: 5,
  habit: 2,
  day: 15,
  week: 40,
  parking: 1,
  worship: 2,
};
export const pointRules = rules;
const caps: Record<string, number> = {
  focus: 200,
  task: 100,
  assignment: 120,
  exam: 80,
  habit: 20,
  parking: 5,
  worship: 20,
  day: 100,
  week: 100,
};
const uuid = (value: string) => {
  let seed = 2166136261;
  for (const ch of value) {
    seed ^= ch.codePointAt(0) ?? 0;
    seed = Math.imul(seed, 16777619);
  }
  const next = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0).toString(16).padStart(8, "0");
  };
  const body = next() + next() + next() + next();
  return (
    body.slice(0, 8) +
    "-" +
    body.slice(8, 12) +
    "-4" +
    body.slice(13, 16) +
    "-a" +
    body.slice(17, 20) +
    "-" +
    body.slice(20)
  );
};
const key = (item: { sourceType: string; sourceId: string }) =>
  item.sourceType + ":" + item.sourceId;
const seasonFor = (day: string) => {
  const half = Number(day.slice(5, 7)) < 7 ? 1 : 2,
    year = day.slice(0, 4);
  return {
    id: uuid(year + ":" + half),
    start: year + (half === 1 ? "-01-01" : "-07-01"),
    end: year + (half === 1 ? "-06-30" : "-12-31"),
    name: year + " · " + half,
    rivalSeed: Number(year) * 2 + half,
  };
};

export const xpForLevel = (level: number) => Math.round(100 * level ** 1.5);
export function levelFor(points: number) {
  let level = Math.floor((Math.max(0, points) / 100) ** (2 / 3));
  while (xpForLevel(level + 1) <= points) level++;
  return level;
}
export function progressSummary(state: State, now: Date) {
  const zone = state.settings.location.timezone,
    today = dayKey(now, zone),
    week = weekAt(today, state.settings.weekStart);
  const items = active(state.progressEvents).filter(
    (item) =>
      state.settings.progress.includeWorship || item.sourceType !== "worship",
  );
  const byDay = new Map<string, number>();
  for (const item of items) {
    const date = dayKey(new Date(item.occurredAt), zone);
    if (item.sourceType !== "worship")
      byDay.set(date, (byDay.get(date) ?? 0) + item.points);
  }
  const total = items.reduce((sum, item) => sum + item.points, 0),
    weekly = items
      .filter((item) => dayKey(new Date(item.occurredAt), zone) >= week)
      .reduce((sum, item) => sum + item.points, 0);
  const level = levelFor(total);
  let streak = 0,
    freezes = 0,
    chain = 0;
  let previous: string | undefined;
  for (const date of [...byDay.keys()].sort()) {
    const gap = previous ? dateSpan(previous, date) - 1 : 0;
    if (gap > freezes) {
      streak = 0;
      chain = 0;
    }
    freezes = Math.max(0, freezes - gap);
    streak++;
    chain++;
    if (chain % 7 === 0) freezes = Math.min(2, freezes + 1);
    previous = date;
  }
  const gap = previous ? Math.max(0, dateSpan(previous, today) - 1) : 0;
  if (gap > freezes) streak = 0;
  freezes = Math.max(0, freezes - gap);
  const weeklyFocus = active(state.sessions).filter(
    (item) =>
      item.completed &&
      item.type === "focus" &&
      dayKey(new Date(item.endedAt), zone) >= week,
  );
  const longest = weeklyFocus.reduce(
    (highest, item) => Math.max(highest, item.actualMinutes),
    0,
  );
  const focus = weeklyFocus.reduce((sum, item) => sum + item.actualMinutes, 0);
  return {
    total,
    weekly,
    level,
    streak,
    freezes,
    byDay,
    focus,
    longest,
    week,
    today,
    items,
  };
}

export function recordProgress(state: State, now: Date): State {
  if (!state.settings.progress.enabled) return state;
  const zone = state.settings.location.timezone,
    today = dayKey(now, zone),
    cutoff = addDate(today, -100);
  const value = (name: keyof typeof rules) =>
    state.settings.progress.rules[name] ?? rules[name];
  const candidates: Earn[] = [];
  const add = (
    type: string,
    sourceType: string,
    sourceId: string,
    occurredAt: string,
    points: number,
  ) => {
    if (points > 0 && dayKey(new Date(occurredAt), zone) >= cutoff)
      candidates.push({ type, sourceType, sourceId, occurredAt, points });
  };
  const sessionRows = active(state.sessions).filter(
    (item) =>
      item.completed && item.type === "focus" && item.actualMinutes >= 10,
  );
  const byDay = new Map<string, { minutes: number; last: string }>(),
    byWeek = new Map<string, { minutes: number; last: string }>();
  const log = (
    map: typeof byDay,
    key: string,
    minutes: number,
    instant: string,
  ) => {
    const before = map.get(key);
    map.set(key, {
      minutes: (before?.minutes ?? 0) + minutes,
      last: before && before.last > instant ? before.last : instant,
    });
  };
  for (const item of sessionRows) {
    const date = dayKey(new Date(item.endedAt), zone);
    add(
      "focus",
      "focus",
      item.id,
      item.endedAt,
      Math.max(0, Math.round((item.actualMinutes / 25) * value("focus"))),
    );
    log(byDay, date, item.actualMinutes, item.endedAt);
    log(
      byWeek,
      weekAt(date, state.settings.weekStart),
      item.actualMinutes,
      item.endedAt,
    );
  }
  for (const item of active(state.tasks))
    if (
      item.status === "done" &&
      item.completedAt &&
      Date.parse(item.completedAt) - Date.parse(item.createdAt) >= 60000
    )
      add("task", "task", item.id, item.completedAt, value(item.priority));
  for (const item of active(state.assignments))
    if (item.submittedAt && ["submitted", "graded"].includes(item.status)) {
      const early =
        !!item.dueAt &&
        Date.parse(item.dueAt) - Date.parse(item.submittedAt) >= 86400000;
      add(
        early ? "early" : "assignment",
        "assignment",
        item.id,
        item.submittedAt,
        value("assignment") + (early ? value("early") : 0),
      );
    }
  for (const item of active(state.studySessions))
    if (item.status === "done")
      add(
        item.kind === "review" ? "review" : "exam",
        "exam",
        item.id,
        item.updatedAt,
        value(item.kind === "review" ? "review" : "exam"),
      );
  for (const item of active(state.habitLogs)) {
    const habit = active(state.habits).find((row) => row.id === item.habitId);
    if (!habit || item.value < habit.targetCount) continue;
    const worship =
      /qur[a'’]?an|prayer|dhikr|worship|قرآن|صلاة|ذكر|عبادة/i.test(
        habit.category + " " + habit.name,
      );
    if (!worship || state.settings.progress.includeWorship)
      add(
        "habit",
        worship ? "worship" : "habit",
        uuid(habit.id + ":" + item.date),
        item.updatedAt,
        value(worship ? "worship" : "habit"),
      );
  }
  for (const [date, item] of byDay)
    if (item.minutes >= state.settings.focus.dailyGoal)
      add("day", "day", uuid("daily:" + date), item.last, value("day"));
  for (const [date, item] of byWeek)
    if (item.minutes >= state.settings.focus.weeklyGoal)
      add("week", "week", uuid("weekly:" + date), item.last, value("week"));
  for (const item of active(state.parkingItems))
    add("parking", "parking", item.id, item.createdAt, value("parking"));
  if (state.settings.progress.includeWorship)
    for (const item of active(state.prayerDays))
      for (const [name, status] of Object.entries(item.status))
        if (status === "done" || status === "late")
          add(
            "worship",
            "worship",
            uuid(item.id + ":" + name),
            item.updatedAt,
            value("worship"),
          );
  if (state.settings.progress.includeWorship)
    for (const item of active(state.mushafWerds))
      if (item.completedOn)
        add(
          "quran",
          "worship",
          uuid(item.id + ":" + item.completedOn),
          item.updatedAt,
          value("worship"),
        );
  const events = state.progressEvents.slice(),
    seen = new Set(events.map(key)),
    daily = new Map<string, number>(),
    seasons = state.seasons.slice();
  for (const event of events) {
    const date = dayKey(new Date(event.occurredAt), zone),
      id = event.sourceType + date;
    daily.set(id, (daily.get(id) ?? 0) + event.points);
  }
  for (const candidate of candidates.sort(
    (a, b) =>
      a.occurredAt.localeCompare(b.occurredAt) || key(a).localeCompare(key(b)),
  )) {
    if (seen.has(key(candidate))) continue;
    const date = dayKey(new Date(candidate.occurredAt), zone),
      id = candidate.sourceType + date;
    const points = Math.min(
      candidate.points,
      Math.max(0, (caps[candidate.sourceType] ?? 100) - (daily.get(id) ?? 0)),
    );
    const capped =
      candidate.sourceType === "parking" ? Math.min(1, points) : points;
    const season = seasonFor(date);
    if (!seasons.some((item) => item.id === season.id))
      seasons.push({
        ...stamp(season.id, now.toISOString()),
        ...season,
        skin: "minimal",
      });
    events.push({
      ...stamp(uuid(key(candidate)), now.toISOString()),
      ...candidate,
      points: capped,
      seasonId: season.id,
    });
    seen.add(key(candidate));
    daily.set(id, (daily.get(id) ?? 0) + capped);
  }
  const achievements = state.achievements.slice();
  const unlock = (name: string, earned: boolean) => {
    if (earned && !achievements.some((item) => item.key === name))
      achievements.push({
        ...stamp(uuid("achievement:" + name), now.toISOString()),
        key: name,
        unlockedAt: now.toISOString(),
      });
  };
  unlock(
    "first-focus",
    events.some((item) => item.type === "focus" && item.points > 0),
  );
  unlock(
    "week-warrior",
    events.filter((item) => item.type === "week" && item.points > 0).length >=
      4,
  );
  unlock(
    "early-bird",
    active(state.assignments).some(
      (item) =>
        item.dueAt &&
        item.submittedAt &&
        Date.parse(item.dueAt) - Date.parse(item.submittedAt) >= 172800000,
    ),
  );
  unlock(
    "exam-ready",
    active(state.examPlans).some((plan) => {
      const rows = active(state.studySessions).filter(
        (item) => item.planId === plan.id,
      );
      return (
        rows.length > 0 &&
        rows.filter(
          (item) => item.status === "done" && (item.confidenceAfter ?? 3) >= 4,
        ).length /
          rows.length >=
          0.9
      );
    }),
  );
  const clean = new Set(
    active(state.dayReviews)
      .filter((item) => item.cleanSweep)
      .map((item) => item.date),
  );
  unlock(
    "clean-sweep",
    [...clean].some((date) =>
      Array.from({ length: 7 }, (_, offset) => addDate(date, -offset)).every(
        (day) => clean.has(day),
      ),
    ),
  );
  return events.length === state.progressEvents.length &&
    achievements.length === state.achievements.length
    ? state
    : { ...state, progressEvents: events, seasons, achievements };
}

export function themeUnlocked(state: State, id: string) {
  if (
    state.settings.progress.rewardMode === "all-unlocked" ||
    !state.settings.progress.enabled ||
    ["light", "dark"].includes(id)
  )
    return true;
  const level = levelFor(
    state.progressEvents
      .filter(
        (item) =>
          state.settings.progress.includeWorship ||
          item.sourceType !== "worship",
      )
      .reduce((sum, item) => sum + item.points, 0),
  );
  const trophy = new Set(active(state.achievements).map((item) => item.key));
  return id === "nature"
    ? level >= 3
    : id === "football"
      ? level >= 5
      : id === "f1"
        ? level >= 8
        : id === "cyberpunk"
          ? trophy.has("week-warrior")
          : id === "anime"
            ? trophy.has("exam-ready")
            : id === "islamic"
              ? trophy.has("clean-sweep")
              : true;
}

const racers = [
  "Ari Vale",
  "Noa Cinder",
  "Mina Quartz",
  "Ivo Ember",
  "Lina Arc",
  "Tari Sol",
  "Zia Moss",
  "Leo Flint",
  "Nia Drift",
];
const clubs = [
  "Vale United",
  "Cinder Borough",
  "Quartz Athletic",
  "Ember Rovers",
  "Arc City",
  "Sol Wanderers",
  "Moss Forest",
  "Flint Town",
  "Drift Albion",
];
export function rivals(
  seed: number,
  average: number,
  week: string,
  difficulty: "easy" | "normal" | "hard",
  mode: "race" | "league" = "race",
) {
  const factor = { easy: 0.8, normal: 1, hard: 1.2 }[difficulty];
  const values = mode === "race" ? racers : clubs;
  return values
    .map((name, index) => {
      const salt =
        Number.parseInt(uuid(seed + week + index).slice(0, 8), 16) / 0xffffffff;
      return {
        name,
        score: Math.max(
          0,
          Math.round(Math.max(30, average) * factor * (0.55 + salt * 0.9)),
        ),
      };
    })
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}
