import { useState } from "react";
import { Flag, Leaf, Medal, Rocket, Shield, Trophy } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { active, type State } from "../shared/schema";
import {
  pointRules,
  progressSummary,
  rivals,
  themeUnlocked,
  xpForLevel,
} from "../shared/logic/progress";
import { examReadiness } from "../shared/logic/exam-prep";
import { addDate, dayKey, weekAt } from "../shared/time";
import { artwork, ThemeArt } from "./theme-art";
import { selectedTheme, themes } from "./themes";
import { changeSettings, tell, useSabri } from "./store";
import { Button, Field, Modal, PageHead, Panel, useNow } from "./ui";

const placement = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
const achievements = {
  "first-focus": "First Focus",
  "week-warrior": "Week Warrior",
  "early-bird": "Early Bird",
  "exam-ready": "Exam Ready",
  "clean-sweep": "Clean Sweep",
} as const;
function Scores({ state, full = false }: { state: State; full?: boolean }) {
  const { t } = useTranslation(),
    now = useNow(60000);
  const progress = progressSummary(state, now),
    theme = selectedTheme(state),
    skin = theme.progressSkin;
  const { weekly, level, total, streak, freezes, focus, longest, week } =
    progress;
  const ratio = focus / state.settings.focus.weeklyGoal;
  const weekGroups = new Map<string, number>();
  for (const item of progress.items) {
    const k = weekAt(
      dayKey(new Date(item.occurredAt), state.settings.location.timezone),
      state.settings.weekStart,
    );
    weekGroups.set(k, (weekGroups.get(k) ?? 0) + item.points);
  }
  const history = [...weekGroups.entries()]
    .filter(([date]) => date < week)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, 5);
  const avg = history.length
    ? history.reduce((sum, row) => sum + row[1], 0) / history.length
    : Math.max(30, weekly);
  const seed =
    active(state.seasons).at(-1)?.rivalSeed ?? Number(week.slice(0, 4));
  const difficulty = state.settings.progress.difficulty;
  const entries = [
    { name: t("You"), score: weekly },
    ...rivals(
      seed,
      avg,
      week,
      difficulty,
      skin === "league" ? "league" : "race",
    ),
  ].sort((a, b) => b.score - a.score);
  const actual = entries.findIndex((item) => item.name === t("You"));
  const goal = (
    <>
      <progress
        className="addon-meter"
        value={Math.min(100, Math.round(ratio * 100))}
        max={100}
      />
      <small>
        {t("Weekly focus goal")} · {Math.round(ratio * 100)}%
      </small>
    </>
  );
  const levelProgress = (
    <>
      <div className="metric">
        {t("Level")} {level}
      </div>
      <progress
        className="addon-meter"
        value={total - xpForLevel(level)}
        max={Math.max(1, xpForLevel(level + 1) - xpForLevel(level))}
      />
      <small>
        {total} XP · {t("Next level")} {xpForLevel(level + 1)} XP
      </small>
    </>
  );
  if (skin === "mosaic")
    return (
      <div className="addon-score">
        <div className="addon-mosaic">
          {Array.from({ length: 7 }, (_, index) => {
            const key = addDate(week, index);
            return (
              <div
                className={progress.byDay.has(key) ? "filled" : ""}
                key={key}
                title={key}
              />
            );
          })}
        </div>
        <p>{t("A tile for each day you studied this week.")}</p>
      </div>
    );
  if (skin === "forest") {
    const planted = progress.items.filter(
      (item) => item.type === "focus",
    ).length;
    const rare = Math.floor(planted / 10);
    const visible = Math.min(32, planted);
    return (
      <div className="addon-score">
        <div className="addon-forest" aria-hidden="true">
          {Array.from(
            {
              length: visible,
            },
            (_, index) => (
              <Leaf
                key={index}
                size={index < rare ? 25 : 19}
                className={index < rare ? "rare" : undefined}
              />
            ),
          )}
        </div>
        <p>
          {planted} {t("trees planted")}
          {rare > 0 && (
            <>
              {" "}
              · {rare} {t("rare trees")}
            </>
          )}
        </p>
        {goal}
      </div>
    );
  }
  if (skin === "championship" || skin === "league") {
    const won = ratio >= 1,
      draw = !won && ratio >= 0.7,
      league = won ? 3 : draw ? 1 : 0;
    const season = active(state.seasons).at(-1);
    const sums = new Map(entries.map((item) => [item.name, 0]));
    const roundDates = [...new Set([...history.map(([date]) => date), week])]
      .filter((date) => !season || (date >= season.start && date <= season.end))
      .sort();
    let wins = 0;
    for (const date of roundDates) {
      const own = weekGroups.get(date) ?? 0;
      const simulated = [
        { name: t("You"), score: own },
        ...rivals(
          seed,
          avg,
          date,
          difficulty,
          skin === "league" ? "league" : "race",
        ),
      ].sort((a, b) => b.score - a.score);
      const dateFocus = active(state.sessions)
        .filter(
          (item) =>
            item.completed &&
            item.type === "focus" &&
            weekAt(
              dayKey(new Date(item.endedAt), state.settings.location.timezone),
              state.settings.weekStart,
            ) === date,
        )
        .reduce((sum, item) => sum + item.actualMinutes, 0);
      const ownResult =
        dateFocus >= state.settings.focus.weeklyGoal
          ? 3
          : dateFocus >= state.settings.focus.weeklyGoal * 0.7
            ? 1
            : 0;
      if (ownResult === 3) wins++;
      simulated.forEach((item, index) =>
        sums.set(
          item.name,
          (sums.get(item.name) ?? 0) +
            (skin === "championship"
              ? (placement[index] ?? 0)
              : item.name === t("You")
                ? ownResult
                : item.score > avg
                  ? 3
                  : item.score > avg * 0.7
                    ? 1
                    : 0),
        ),
      );
    }
    const standings = [...sums].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
    );
    const division =
      roundDates.length < 3
        ? t("Qualifying season")
        : wins / roundDates.length >= 0.66
          ? t("Premier division")
          : wins / roundDates.length >= 0.34
            ? t("First division")
            : t("Second division");
    return (
      <div className="addon-score">
        <div className="metric">
          {skin === "championship"
            ? actual + 1 + " / 10"
            : league + " " + t("match points")}
        </div>
        <p>
          {skin === "championship"
            ? (placement[actual] ?? 0) + " " + t("championship points")
            : t(won ? "Win" : draw ? "Draw" : "Loss")}
        </p>
        <small>
          {skin === "championship"
            ? t("Fastest lap") + " · " + Math.round(longest) + " " + t("min")
            : t("Best day") +
              " · " +
              ([...progress.byDay.entries()].sort(
                (a, b) => b[1] - a[1],
              )[0]?.[0] ?? "—")}
        </small>
        {full && skin === "championship" && weekly > 0 && (
          <ol
            key={week}
            className="race-podium"
            aria-label={t("Weekly podium")}
          >
            {entries.slice(0, 3).map((entry, index) => (
              <li key={entry.name}>
                <Medal size={18} aria-hidden="true" />
                <strong>
                  {index + 1}. {entry.name}
                </strong>
              </li>
            ))}
          </ol>
        )}
        {full && (
          <details open className="addon-section">
            <summary>
              {t(
                skin === "championship"
                  ? "Championship standings"
                  : "League table",
              )}
            </summary>
            {standings.map(([name, points], index) => (
              <div className="data-row" key={name}>
                <strong>{index + 1}.</strong>
                <span className="grow">{name}</span>
                {points}
              </div>
            ))}
            {skin === "league" && (
              <p>
                {division} · {t("Cup readiness")}:{" "}
                {active(state.examPlans).length
                  ? Math.round(
                      active(state.examPlans).reduce(
                        (sum, plan) =>
                          sum + examReadiness(plan, state.studySessions),
                        0,
                      ) / active(state.examPlans).length,
                    )
                  : 0}
                %
              </p>
            )}
          </details>
        )}
        {goal}
      </div>
    );
  }
  if (skin === "credits")
    return (
      <div className="addon-score">
        <div className="metric">
          {total} {t("credits")}
        </div>
        <p>
          {t("Rank")} {level + 1}
        </p>
        <progress
          className="addon-meter"
          aria-label={t("Hack level")}
          value={total - xpForLevel(level)}
          max={Math.max(1, xpForLevel(level + 1) - xpForLevel(level))}
        />
        {goal}
      </div>
    );
  if (skin === "xp") {
    const exams = active(state.examPlans);
    const readiness = exams.length
      ? Math.max(
          ...exams.map((plan) => examReadiness(plan, state.studySessions)),
        )
      : 0;
    const labels = ["Rookie", "Apprentice", "Adept", "Master", "Legend"];
    return (
      <div className="addon-score">
        <p key={level} className="xp-rank">
          <Rocket size={16} aria-hidden="true" />{" "}
          {t(labels[Math.min(4, Math.floor(level / 3))]!)}
        </p>
        {levelProgress}
        {full && (
          <div className="addon-section">
            <div
              className="stat-radar"
              role="img"
              aria-label={t("Study stat radar")}
              style={{
                clipPath:
                  "polygon(50% " +
                  (50 - Math.min(1, ratio) * 50) +
                  "%, " +
                  (50 +
                    Math.min(
                      1,
                      progress.items.filter((item) => item.type === "task")
                        .length / 8,
                    ) *
                      50) +
                  "% 50%, 50% " +
                  (50 + readiness / 2) +
                  "%, " +
                  (50 - Math.min(1, streak / 7) * 50) +
                  "% 50%)",
              }}
            />
            <small>
              {t("Focus")} · {t("Discipline")} · {t("Knowledge")} ·{" "}
              {t("Consistency")}
            </small>
            <h3>{t("Exam boss battle")}</h3>
            <p>
              {t("Remaining preparation")} · {100 - readiness}%
            </p>
            <progress
              className="addon-meter"
              value={100 - readiness}
              max={100}
            />
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="addon-score">
      {levelProgress}
      <div className="addon-section">{goal}</div>
      <small>
        {streak} {t("study-day streak")} · {freezes} {t("streak freezes")}
      </small>
    </div>
  );
}
export function ProgressWidget() {
  const { t } = useTranslation(),
    go = useNavigate(),
    state = useSabri((s) => s.data);
  if (!state.settings.progress.enabled) return null;
  return (
    <Panel
      title={t("Progress")}
      icon={Trophy}
      action={<Button onClick={() => go("/progress")}>{t("Open")}</Button>}
    >
      <Scores state={state} />
    </Panel>
  );
}
async function recapImage(state: State, label: string) {
  const view = progressSummary(state, new Date()),
    canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 630;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const theme = selectedTheme(state),
    current = active(state.seasons).at(-1);
  ctx.fillStyle = theme.colors.background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = theme.colors.text;
  ctx.font = "bold 62px Manrope";
  ctx.fillText(label, 60, 105);
  ctx.font = "30px Inter";
  ctx.fillText(current?.name ?? view.week, 60, 163);
  const days = [...view.byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-21),
    peak = Math.max(1, ...days.map((row) => row[1]));
  for (const [index, [, value]] of days.entries()) {
    const height = (value / peak) * 300;
    ctx.fillStyle = theme.colors.primary;
    ctx.fillRect(60 + index * 50, 520 - height, 30, height);
  }
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );
  if (blob)
    await window.sabri.saveRecapImage(new Uint8Array(await blob.arrayBuffer()));
}
export function ProgressPage() {
  const { t } = useTranslation(),
    state = useSabri((s) => s.data),
    settings = state.settings.progress;
  const [preview, setPreview] = useState<string>();
  const update = (update: Partial<typeof settings>) =>
    void changeSettings({ progress: { ...settings, ...update } });
  const rows = active(state.achievements),
    currentTheme = selectedTheme(state);
  const now = useNow(1000),
    level = progressSummary(state, now).level,
    cosmetics = settings.cosmetics;
  const celebrate =
    rows.some((item) => +now - Date.parse(item.unlockedAt) < 6000) &&
    cosmetics.celebration !== "none";
  return (
    <>
      <PageHead
        title={t("Progress")}
        description={t("See your study habits grow at your own pace.")}
        action={
          <Button
            onClick={() =>
              void recapImage(state, t("Sabri study recap")).catch(() =>
                tell(t("Could not save recap")),
              )
            }
          >
            {t("Save recap image")}
          </Button>
        }
      />
      <Panel title={t("Rewards preferences")} icon={Shield}>
        <div className="addon-controls">
          <label className="check-label">
            <input
              type="checkbox"
              checked={settings.enabled}
              onChange={(e) => update({ enabled: e.target.checked })}
            />
            {t("Show progress")}
          </label>
          <label className="check-label">
            <input
              type="checkbox"
              checked={settings.includeWorship}
              onChange={(e) => update({ includeWorship: e.target.checked })}
            />
            {t("Include worship in personal points")}
          </label>
          <Field label={t("Reward mode")}>
            <select
              value={settings.rewardMode}
              onChange={(e) =>
                update({
                  rewardMode: e.target.value as typeof settings.rewardMode,
                })
              }
            >
              <option value="all-unlocked">{t("All themes unlocked")}</option>
              <option value="earn-themes">{t("Earn themes")}</option>
            </select>
          </Field>
          <Field label={t("Rival difficulty")}>
            <select
              value={settings.difficulty}
              onChange={(e) =>
                update({
                  difficulty: e.target.value as typeof settings.difficulty,
                })
              }
            >
              {(["easy", "normal", "hard"] as const).map((item) => (
                <option key={item} value={item}>
                  {t(item)}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <details className="addon-section">
          <summary>{t("Edit point rules")}</summary>
          <div className="addon-grid">
            {Object.entries(pointRules).map(([name, value]) => (
              <Field key={name} label={t(name)}>
                <input
                  type="number"
                  min="0"
                  max="100"
                  defaultValue={settings.rules[name] ?? value}
                  onBlur={(e) => {
                    const points = Number(e.target.value);
                    if (
                      Number.isInteger(points) &&
                      points >= 0 &&
                      points <= 100
                    )
                      update({ rules: { ...settings.rules, [name]: points } });
                  }}
                />
              </Field>
            ))}
          </div>
        </details>
      </Panel>
      {settings.enabled && (
        <div className="two-col">
          <Panel
            title={t("Study progress")}
            icon={currentTheme.progressSkin === "championship" ? Flag : Rocket}
          >
            <Scores state={state} full />
          </Panel>
          <Panel title={t("Achievements")} icon={Medal}>
            {Object.entries(achievements).map(([key, name]) => (
              <div key={key} className="data-row">
                <span className="grow">{t(name)}</span>
                <span className="pill">
                  {rows.some((item) => item.key === key)
                    ? t("Unlocked")
                    : t("Locked")}
                </span>
              </div>
            ))}
          </Panel>
        </div>
      )}
      {settings.enabled && (
        <Panel title={t("Cosmetic rewards")} icon={Rocket}>
          <div className="addon-controls">
            <Field label={t("Timer skin")}>
              <select
                value={cosmetics.timer}
                onChange={(event) =>
                  update({
                    cosmetics: {
                      ...cosmetics,
                      timer: event.target.value as typeof cosmetics.timer,
                    },
                  })
                }
              >
                <option value="theme">{t("Match theme")}</option>
                <option value="geometric" disabled={level < 3}>
                  {t("Geometric")} · 3
                </option>
                <option value="neon" disabled={level < 5}>
                  {t("Neon")} · 5
                </option>
              </select>
            </Field>
            <Field label={t("Sound pack")}>
              <select
                value={cosmetics.sound}
                onChange={(event) =>
                  update({
                    cosmetics: {
                      ...cosmetics,
                      sound: event.target.value as typeof cosmetics.sound,
                    },
                  })
                }
              >
                <option value="classic">{t("Classic")}</option>
                <option value="chime" disabled={level < 2}>
                  {t("Chime")} · 2
                </option>
              </select>
            </Field>
            <Field label={t("Profile title")}>
              <select
                value={cosmetics.title}
                onChange={(event) =>
                  update({
                    cosmetics: {
                      ...cosmetics,
                      title: event.target.value as typeof cosmetics.title,
                    },
                  })
                }
              >
                <option value="none">{t("None")}</option>
                <option value="steady" disabled={level < 1}>
                  {t("Steady Learner")} · 1
                </option>
                <option value="scholar" disabled={level < 5}>
                  {t("Study Scholar")} · 5
                </option>
              </select>
            </Field>
            <Field label={t("Celebration style")}>
              <select
                value={cosmetics.celebration}
                onChange={(event) =>
                  update({
                    cosmetics: {
                      ...cosmetics,
                      celebration: event.target
                        .value as typeof cosmetics.celebration,
                    },
                  })
                }
              >
                <option value="none">{t("None")}</option>
                <option value="spark" disabled={level < 2}>
                  {t("Spark")} · 2
                </option>
                <option value="confetti" disabled={level < 4}>
                  {t("Confetti")} · 4
                </option>
              </select>
            </Field>
          </div>
          {celebrate && (
            <p
              className={"addon-celebration " + cosmetics.celebration}
              role="status"
            >
              {t("New achievement")}
            </p>
          )}
        </Panel>
      )}
      <Panel title={t("Theme rewards")} icon={Trophy}>
        <div className="addon-grid">
          {themes.map((theme) => {
            const unlocked = themeUnlocked(state, theme.id);
            return (
              <div className="addon-theme" key={theme.id}>
                <img src={artwork[theme.art]} alt="" />
                <strong>{t(theme.name)}</strong>
                <div className="actions">
                  <Button
                    disabled={state.settings.theme === theme.id}
                    onClick={() => {
                      if (unlocked) void changeSettings({ theme: theme.id });
                      else setPreview(theme.id);
                    }}
                  >
                    {t(unlocked ? "Use theme" : "Preview theme")}
                  </Button>
                  {!unlocked && <span className="pill">{t("Locked")}</span>}
                </div>
              </div>
            );
          })}
        </div>
      </Panel>
      {preview && (
        <ThemePreview id={preview} close={() => setPreview(undefined)} />
      )}
    </>
  );
}
function ThemePreview({ id, close }: { id: string; close: () => void }) {
  const { t } = useTranslation(),
    state = useSabri((s) => s.data),
    now = useNow(1000),
    [end] = useState(Date.now() + 60000);
  const theme = themes.find((item) => item.id === id);
  if (!theme) return null;
  return (
    <Modal title={t(theme.name)} close={close} wide>
      {+now < end ? (
        <div
          className="hero"
          style={{
            background: theme.colors["hero-from"],
            color: theme.colors["hero-text"],
          }}
        >
          <div className="hero-copy">
            <strong>{t("Theme preview")}</strong>
            <p>
              {Math.max(0, Math.floor((end - +now) / 1000))} {t("seconds")}
            </p>
          </div>
          <ThemeArt theme={theme.art} motion={state.settings.themeMotion} />
        </div>
      ) : (
        <p>{t("Theme preview ended")}</p>
      )}
    </Modal>
  );
}
