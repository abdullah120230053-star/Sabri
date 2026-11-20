import { useState, type ReactNode } from "react";
import GridLayout, { useContainerWidth, type Layout } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import {
  Activity,
  CalendarDays,
  Clock3,
  GripHorizontal,
  LayoutGrid,
  Settings2,
  Trash2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  active,
  layoutSchema,
  widgetIds,
  type RecordFor,
} from "../shared/schema";
import { studyStats } from "../shared/academic";
import { addDate, clock, dayKey, friendlyDate, weekAt } from "../shared/time";
import { UpcomingEvents } from "./calendar";
import { FocusCard } from "./focus";
import { HabitSummary } from "./habits";
import { MusicWidget } from "./music";
import { QuickNote } from "./quick-note";
import { PrayerChecklist } from "./prayers";
import { QuoteWidget } from "./quotes";
import { TodaySchedule } from "./schedule";
import { GoalSummary } from "./goal-widget";
import { TodayTasks } from "./tasks";
import { changeSettings, fresh, remove, save, tell, useSabri } from "./store";
import { Button, Field, IconButton, Panel, useNow } from "./ui";

type Widget = RecordFor<"layouts">["widgets"][number];
type WidgetId = Widget["i"];
const labels: Record<WidgetId, string> = {
  schedule: "Today’s schedule",
  focus: "Focus timer",
  prayers: "Prayer times",
  tasks: "Today’s tasks",
  quote: "A moment of reflection",
  upcoming: "Upcoming events",
  stats: "Statistics",
  calendar: "Mini calendar",
  music: "Focus sounds",
  habits: "Habits",
  goal: "Study goal",
  notes: "Quick note",
  clock: "Clock",
};
const inventory: Widget[] = [
  { i: "schedule", x: 0, y: 0, w: 2, h: 4 },
  { i: "prayers", x: 2, y: 0, w: 2, h: 5 },
  { i: "focus", x: 0, y: 4, w: 2, h: 4 },
  { i: "tasks", x: 2, y: 5, w: 2, h: 4 },
  { i: "upcoming", x: 0, y: 8, w: 2, h: 3 },
  { i: "quote", x: 2, y: 9, w: 2, h: 3 },
  { i: "stats", x: 0, y: 11, w: 2, h: 2 },
  { i: "calendar", x: 2, y: 12, w: 2, h: 2 },
  { i: "habits", x: 0, y: 13, w: 2, h: 3 },
  { i: "goal", x: 2, y: 14, w: 1, h: 2 },
  { i: "music", x: 3, y: 14, w: 1, h: 2 },
  { i: "notes", x: 0, y: 16, w: 2, h: 2 },
  { i: "clock", x: 2, y: 16, w: 2, h: 2 },
];
const presets: Record<string, { name: string; widgets: Widget[] }> = {
  overview: { name: "Overview", widgets: inventory },
  study: {
    name: "Study Mode",
    widgets: [
      { i: "focus", x: 0, y: 0, w: 2, h: 4 },
      { i: "tasks", x: 2, y: 0, w: 2, h: 4 },
      { i: "goal", x: 0, y: 4, w: 2, h: 2 },
      { i: "music", x: 2, y: 4, w: 2, h: 2 },
      { i: "stats", x: 0, y: 6, w: 2, h: 2 },
    ],
  },
  minimal: {
    name: "Minimal",
    widgets: [
      { i: "clock", x: 0, y: 0, w: 2, h: 2 },
      { i: "prayers", x: 2, y: 0, w: 2, h: 5 },
      { i: "tasks", x: 0, y: 2, w: 2, h: 4 },
    ],
  },
  exam: {
    name: "Exam Mode",
    widgets: [
      { i: "upcoming", x: 0, y: 0, w: 2, h: 4 },
      { i: "focus", x: 2, y: 0, w: 2, h: 4 },
      { i: "tasks", x: 0, y: 4, w: 2, h: 4 },
      { i: "notes", x: 2, y: 4, w: 2, h: 2 },
    ],
  },
};
function ClockCard() {
  const { t } = useTranslation(),
    settings = useSabri((s) => s.data.settings),
    now = useNow();
  const key = dayKey(now, settings.location.timezone);
  return (
    <Panel title={t("Clock")} icon={Clock3}>
      <div className="metric">{clock(now, settings)}</div>
      <small>
        {friendlyDate(key, settings.language, {
          weekday: "long",
          month: "short",
          day: "numeric",
        })}
      </small>
    </Panel>
  );
}
function CalendarCard() {
  const { t } = useTranslation(),
    settings = useSabri((s) => s.data.settings),
    today = dayKey(useNow(60000), settings.location.timezone);
  const first = weekAt(today, settings.weekStart);
  return (
    <Panel title={t("Mini calendar")} icon={CalendarDays}>
      <div className="mini-calendar">
        {Array.from({ length: 7 }, (_, i) => addDate(first, i)).map((key) => (
          <div key={key} className={key === today ? "active-pill" : ""}>
            <small>
              {friendlyDate(key, settings.language, { weekday: "narrow" })}
            </small>
            <strong>
              {friendlyDate(key, settings.language, { day: "numeric" })}
            </strong>
          </div>
        ))}
      </div>
    </Panel>
  );
}
function StatsCard() {
  const { t } = useTranslation(),
    state = useSabri((s) => s.data),
    today = dayKey(useNow(60000), state.settings.location.timezone);
  const stats = studyStats(state, today, 7);
  return (
    <Panel title={t("Statistics")} icon={Activity}>
      <div className="metric">
        {Math.round(stats.totalMinutes)}{" "}
        <span>{t("focus minutes this week")}</span>
      </div>
    </Panel>
  );
}
const widgets: Record<WidgetId, () => ReactNode> = {
  schedule: () => <TodaySchedule dense />,
  focus: () => <FocusCard compact />,
  prayers: () => <PrayerChecklist compact />,
  tasks: () => <TodayTasks />,
  quote: () => <QuoteWidget />,
  upcoming: () => <UpcomingEvents />,
  stats: () => <StatsCard />,
  calendar: () => <CalendarCard />,
  music: () => <MusicWidget />,
  habits: () => <HabitSummary />,
  goal: () => <GoalSummary />,
  notes: () => <QuickNote />,
  clock: () => <ClockCard />,
};
export function DashboardWidgets({
  editing,
  close,
}: {
  editing: boolean;
  close(): void;
}) {
  const { t } = useTranslation(),
    state = useSabri((s) => s.data);
  const { settings } = state,
    custom = active(state.layouts);
  const saved = settings.layoutPerTheme
    ? (settings.themeLayouts[settings.theme] ?? settings.layout)
    : settings.layout;
  const fallback =
    custom.find((entry) => entry.id === saved)?.widgets ??
    presets[saved]?.widgets ??
    inventory;
  const [chosen, setChosen] = useState(saved),
    [work, setWork] = useState<Widget[]>(fallback),
    [name, setName] = useState("");
  const { width, containerRef, mounted } = useContainerWidth();
  const values = editing ? work : fallback;
  const selection = (layout: string) => {
    setChosen(layout);
    setWork(
      custom.find((item) => item.id === layout)?.widgets ??
        presets[layout]?.widgets ??
        inventory,
    );
  };
  const changeSelected = (id: string) =>
    changeSettings(
      settings.layoutPerTheme
        ? { themeLayouts: { ...settings.themeLayouts, [settings.theme]: id } }
        : { layout: id },
    );
  const normalize = (layout: Layout) =>
    layout.flatMap((item) => {
      const i = widgetIds.find((id) => id === item.i);
      return i ? [{ i, x: item.x, y: item.y, w: item.w, h: item.h }] : [];
    });
  if (!editing && saved === "overview")
    return (
      <>
        <div className="dashboard-grid">
          <div className="stack">
            <TodaySchedule />
            <FocusCard compact />
            <UpcomingEvents />
          </div>
          <div className="stack">
            <PrayerChecklist compact />
            <TodayTasks />
            <QuoteWidget />
          </div>
        </div>
        <div className="below-widgets">
          <GoalSummary />
          <StatsCard />
          <CalendarCard />
          <HabitSummary />
          <MusicWidget />
          <QuickNote />
          <ClockCard />
        </div>
      </>
    );
  return (
    <div className="layout-editor" ref={containerRef}>
      {editing && (
        <Panel
          title={t("Dashboard layout")}
          icon={LayoutGrid}
          action={<Button onClick={close}>{t("Close")}</Button>}
        >
          <div className="toolbar">
            <Field label={t("Layout preset")}>
              <select
                value={chosen}
                onChange={(e) => selection(e.target.value)}
              >
                {Object.entries(presets).map(([id, item]) => (
                  <option key={id} value={id}>
                    {t(item.name)}
                  </option>
                ))}
                {custom.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </Field>
            <div className="actions">
              <Button
                onClick={async () => {
                  if (await changeSelected(chosen)) close();
                }}
              >
                {t("Apply preset")}
              </Button>
              {custom.some((item) => item.id === chosen) && (
                <IconButton
                  label={t("Delete layout")}
                  icon={Trash2}
                  onClick={() => {
                    const value = custom.find((item) => item.id === chosen);
                    if (value) void remove("layouts", value);
                    selection("overview");
                  }}
                />
              )}
            </div>
          </div>
          <div className="check-grid">
            {widgetIds.map((id) => (
              <label className="check-label" key={id}>
                <input
                  type="checkbox"
                  checked={work.some((item) => item.i === id)}
                  onChange={(e) => {
                    const item = inventory.find((widget) => widget.i === id);
                    if (!item) return;
                    setWork(
                      e.target.checked
                        ? [
                            ...work,
                            {
                              ...item,
                              y: Math.max(
                                0,
                                ...work.map((entry) => entry.y + entry.h),
                              ),
                            },
                          ]
                        : work.filter((entry) => entry.i !== id),
                    );
                  }}
                />
                {t(labels[id])}
              </label>
            ))}
          </div>
          <div className="toolbar">
            <label className="check-label">
              <input
                type="checkbox"
                checked={settings.layoutPerTheme}
                onChange={(e) => {
                  void changeSettings({ layoutPerTheme: e.target.checked });
                }}
              />
              {t("Keep a layout per theme")}
            </label>
            <div className="actions">
              <input
                aria-label={t("Layout name")}
                placeholder={t("Layout name")}
                value={name}
                maxLength={200}
                onChange={(e) => setName(e.target.value)}
              />
              <Button
                variant="primary"
                icon={Settings2}
                onClick={async () => {
                  const previous = custom.find((item) => item.id === chosen);
                  const entry = layoutSchema.parse({
                    ...(previous ?? fresh()),
                    name: name.trim() || previous?.name || t("My dashboard"),
                    widgets: work,
                  });
                  if (
                    (await save("layouts", entry)) &&
                    (await changeSelected(entry.id))
                  ) {
                    tell(t("Saved"));
                    close();
                  }
                }}
              >
                {t("Save layout")}
              </Button>
            </div>
          </div>
        </Panel>
      )}
      {mounted && (
        <GridLayout
          width={width}
          gridConfig={{
            cols: 4,
            rowHeight: 63,
            margin: [12, 12],
            containerPadding: [0, 0],
            maxRows: 150,
          }}
          layout={values.map((item) => ({
            ...item,
            minW: 1,
            minH: 1,
            maxW: 4,
            maxH: 12,
          }))}
          dragConfig={{ enabled: editing, handle: ".widget-drag" }}
          resizeConfig={{ enabled: editing, handles: ["se"] }}
          onDragStop={(value) => setWork(normalize(value))}
          onResizeStop={(value) => setWork(normalize(value))}
        >
          {values.map((item) => (
            <div
              className={"widget-frame " + (editing ? "widget-editing" : "")}
              key={item.i}
            >
              {editing && (
                <div className="widget-drag" title={t("Drag to move widget")}>
                  <GripHorizontal size={16} />
                  <span>{t(labels[item.i])}</span>
                </div>
              )}
              {widgets[item.i]()}
            </div>
          ))}
        </GridLayout>
      )}
    </div>
  );
}
