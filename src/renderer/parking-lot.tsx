import { useEffect, useState } from "react";
import { CircleParking, Plus, Timer, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
  active,
  noteSchema,
  taskSchema,
  type RecordFor,
} from "../shared/schema";
import { addDate, dayKey } from "../shared/time";
import { generatePlan } from "../shared/logic/planner";
import {
  changeSettings,
  current,
  fresh,
  patch,
  remove,
  save,
  tell,
  useSabri,
} from "./store";
import {
  Button,
  Empty,
  Field,
  Modal,
  PageHead,
  Panel,
  Toast,
  useNow,
} from "./ui";

type Item = RecordFor<"parkingItems">;
const kinds = ["thought", "lookup", "task", "idea", "distraction"] as const;
const guess = (value: string): Item["kind"] => {
  if (/(?:look up|check|search|google|ابحث|راجع)/i.test(value)) return "lookup";
  if (/(?:idea|what if|فكرة)/i.test(value)) return "idea";
  if (/(?:send|call|email|submit|finish|أرسل|اتصل|سلّم)/i.test(value))
    return "task";
  if (/(?:scroll|phone|youtube|tiktok|الهاتف)/i.test(value))
    return "distraction";
  return "thought";
};

export function ParkingInput({
  compact = false,
  close,
}: {
  compact?: boolean;
  close?: () => void;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState(""),
    [kind, setKind] = useState<Item["kind"]>();
  const [breathe, setBreathe] = useState(0),
    [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!breathe) return;
    const timer = window.setTimeout(() => {
      if (breathe === 1) {
        if (close) close();
        setBreathe(0);
      } else setBreathe(breathe - 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [breathe, close]);
  const submit = async () => {
    const data = current();
    if (!text.trim() || saving) return;
    setSaving(true);
    const value = kind ?? guess(text);
    try {
      if (
        await save("parkingItems", {
          ...fresh(),
          text: text.trim(),
          kind: value,
          courseId: data.timer.courseId,
          sessionId:
            data.timer.phase === "focus" && data.timer.status !== "idle"
              ? data.timer.sessionId
              : undefined,
          status: "new",
        })
      ) {
        setText("");
        setKind(undefined);
        if (data.settings.parking.showToast) tell(t("Parked"));
        if (value === "distraction" && data.settings.parking.breathe)
          setBreathe(10);
        else if (close && data.settings.parking.showToast)
          window.setTimeout(close, 550);
        else close?.();
      }
    } finally {
      setSaving(false);
    }
  };
  if (breathe)
    return (
      <div className="addon-preview" role="status">
        <strong>{t("Take a slow breath")}</strong>
        <p>
          {breathe} {t("seconds")}
        </p>
        <Button
          onClick={() => {
            setBreathe(0);
            close?.();
          }}
        >
          {t("Skip")}
        </Button>
      </div>
    );
  return (
    <form
      className="addon-controls"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <Field label={t("Park a distraction")}>
        <input
          autoFocus={!!close}
          value={text}
          onChange={(e) => setText(e.target.value)}
          required
          maxLength={2000}
          placeholder={t("Capture it and keep focusing")}
        />
      </Field>
      {!compact && (
        <Field label={t("Category")}>
          <select
            value={kind ?? (text ? guess(text) : "")}
            onChange={(e) => setKind(e.target.value as Item["kind"])}
          >
            <option value="">{t("Automatic")}</option>
            {kinds.map((value) => (
              <option key={value} value={value}>
                {t(value)}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Button variant="primary" type="submit" disabled={saving} icon={Plus}>
        {t("Park")}
      </Button>
    </form>
  );
}
export function ParkingCapturePage() {
  const { t } = useTranslation();
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") window.close();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  return (
    <main className="mini">
      <Panel title={t("Distraction Parking Lot")} icon={CircleParking}>
        <ParkingInput close={() => window.close()} />
      </Panel>
      <Toast />
    </main>
  );
}
export function ParkingWidget() {
  const { t } = useTranslation(),
    go = useNavigate(),
    data = useSabri((s) => s.data);
  const open = active(data.parkingItems).filter(
    (item) => item.status === "new",
  );
  return (
    <Panel
      title={t("Parking lot")}
      icon={CircleParking}
      action={<Button onClick={() => go("/parking")}>{t("Review")}</Button>}
    >
      <strong>{t("{{count}} to review", { count: open.length })}</strong>
      {open.slice(0, 3).map((item) => (
        <div key={item.id} className="data-row">
          {item.text}
        </div>
      ))}
    </Panel>
  );
}

export function ParkingReview({ focused = false }: { focused?: boolean }) {
  const { t } = useTranslation(),
    state = useSabri((s) => s.data);
  const now = useNow(60000),
    today = dayKey(now, state.settings.location.timezone);
  const [showAll, setShowAll] = useState(false),
    [edit, setEdit] = useState<Item>();
  const latest = active(state.sessions)
    .filter((item) => item.type === "focus")
    .at(-1);
  const relevant = active(state.parkingItems).filter(
    (item) =>
      !focused ||
      item.sessionId === latest?.id ||
      item.sessionId === state.timer.sessionId,
  );
  const rows = relevant.filter((item) => showAll || item.status === "new");
  const convert = async (item: Item, type: "todo" | "note" | "planBlock") => {
    const stamp = fresh(),
      title = item.text.slice(0, 200);
    const common = { ...stamp, title };
    const queued = taskSchema.parse({
      ...common,
      courseId: item.courseId,
      deferUntil: addDate(today, 1),
      estimated: 1,
    });
    const slot =
      type === "planBlock"
        ? generatePlan(
            { ...state, tasks: [...state.tasks, queued] },
            { date: addDate(today, 1), pinned: [queued.id] },
          )[0]?.blocks.find((block) => block.refId === queued.id)
        : undefined;
    const actual = type === "planBlock" && !slot ? "todo" : type;
    const status = {
      ...item,
      status: "converted",
      convertedTo: { type: actual, id: stamp.id },
    };
    const body = item.text.replace(
      /[&<>"']/g,
      (char) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[char] ?? char,
    );
    const entry =
      actual === "todo"
        ? {
            collection: "tasks" as const,
            value:
              type === "planBlock"
                ? queued
                : taskSchema.parse({ ...common, courseId: item.courseId }),
          }
        : type === "note"
          ? {
              collection: "notes" as const,
              value: noteSchema.parse({
                ...common,
                content: "<p>" + body + "</p>",
                courseId: item.courseId,
                tags: [],
                pinned: false,
                color: "#6A5ACD",
              }),
            }
          : {
              collection: "planBlocks" as const,
              value: {
                ...slot,
                ...common,
                refId: undefined,
                refType: undefined,
                reason: "Carried from the parking lot",
              },
            };
    if (await patch([{ collection: "parkingItems", value: status }, entry]))
      tell(t("Saved"), () => {
        void patch([
          { collection: "parkingItems", value: item },
          {
            collection: entry.collection,
            value: { ...entry.value, deletedAt: new Date().toISOString() },
          },
        ]);
      });
  };
  return (
    <Panel
      title={t(focused ? "Parked this session" : "Parking lot review")}
      icon={CircleParking}
      action={
        <label className="check-label">
          <input
            type="checkbox"
            checked={showAll}
            onChange={(e) => setShowAll(e.target.checked)}
          />
          {t("Show reviewed")}
        </label>
      }
    >
      {rows.length ? (
        rows.map((item) => (
          <div className="data-row addon-wrap" key={item.id}>
            <span className="grow">
              <strong>{item.text}</strong>
              <small>
                {t(item.kind)} · {t(item.status)}
              </small>
            </span>
            {item.status === "new" && (
              <>
                <Button onClick={() => void convert(item, "todo")}>
                  {t("Task")}
                </Button>
                <Button onClick={() => void convert(item, "note")}>
                  {t("Note")}
                </Button>
                <Button onClick={() => void convert(item, "planBlock")}>
                  {t("Later")}
                </Button>
                <Button
                  onClick={() =>
                    void save("parkingItems", { ...item, status: "done" })
                  }
                >
                  {t("Done")}
                </Button>
                <Button
                  onClick={() =>
                    void save("parkingItems", { ...item, status: "dismissed" })
                  }
                >
                  {t("Dismiss")}
                </Button>
              </>
            )}
            <Button onClick={() => setEdit(item)}>{t("Edit")}</Button>
            <Button
              icon={Trash2}
              onClick={() => void remove("parkingItems", item)}
            >
              {t("Delete")}
            </Button>
          </div>
        ))
      ) : (
        <Empty icon={CircleParking} title={t("Nothing to review")} compact />
      )}
      {focused && latest && (
        <div className="addon-controls addon-section">
          <Field label={t("Focus rating")}>
            <select
              value={latest.focusRating ?? ""}
              onChange={(e) =>
                void save("sessions", {
                  ...latest,
                  focusRating: e.target.value
                    ? (+e.target.value as typeof latest.focusRating)
                    : undefined,
                })
              }
            >
              <option value="">—</option>
              {[1, 2, 3, 4, 5].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </Field>
          <Field label={t("Session reflection")}>
            <input
              key={latest.id}
              defaultValue={latest.reflection ?? ""}
              maxLength={500}
              onBlur={(e) => {
                if (e.target.value !== (latest.reflection ?? ""))
                  void save("sessions", {
                    ...latest,
                    reflection: e.target.value,
                  });
              }}
            />
          </Field>
        </div>
      )}
      {edit && (
        <Modal title={t("Edit parking item")} close={() => setEdit(undefined)}>
          <form
            className="form-grid"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await save("parkingItems", edit)) setEdit(undefined);
            }}
          >
            <Field wide label={t("Text")}>
              <textarea
                required
                value={edit.text}
                maxLength={2000}
                onChange={(e) => setEdit({ ...edit, text: e.target.value })}
              />
            </Field>
            <Field label={t("Category")}>
              <select
                value={edit.kind}
                onChange={(e) =>
                  setEdit({ ...edit, kind: e.target.value as Item["kind"] })
                }
              >
                {kinds.map((value) => (
                  <option key={value} value={value}>
                    {t(value)}
                  </option>
                ))}
              </select>
            </Field>
            <Button variant="primary" type="submit">
              {t("Save")}
            </Button>
          </form>
        </Modal>
      )}
    </Panel>
  );
}

export function ParkingPage() {
  const { t } = useTranslation(),
    state = useSabri((s) => s.data);
  const counts = new Map<number, number>();
  for (const item of active(state.parkingItems)) {
    const hour = +new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      hourCycle: "h23",
      timeZone: state.settings.location.timezone,
    }).format(new Date(item.createdAt));
    counts.set(hour, (counts.get(hour) ?? 0) + 1);
  }
  const top = [...counts].sort((a, b) => b[1] - a[1])[0];
  const hours =
    active(state.sessions)
      .filter((value) => value.type === "focus")
      .reduce((sum, value) => sum + value.actualMinutes, 0) / 60;
  return (
    <>
      <PageHead
        title={t("Distraction Parking Lot")}
        description={t("Save a thought without pausing your focus timer.")}
        action={
          <Button onClick={() => void window.sabri.captureParking()}>
            Ctrl+Alt+P
          </Button>
        }
      />
      <Panel title={t("Quick capture")} icon={CircleParking}>
        <ParkingInput />
        <div className="check-grid addon-section">
          <label className="check-label">
            <input
              type="checkbox"
              checked={state.settings.parking.showToast}
              onChange={(e) =>
                void changeSettings({
                  parking: {
                    ...state.settings.parking,
                    showToast: e.target.checked,
                  },
                })
              }
            />
            {t("Show capture confirmation")}
          </label>
          <label className="check-label">
            <input
              type="checkbox"
              checked={state.settings.parking.breathe}
              onChange={(e) =>
                void changeSettings({
                  parking: {
                    ...state.settings.parking,
                    breathe: e.target.checked,
                  },
                })
              }
            />
            {t("Offer a 10-second breathing pause")}
          </label>
          <label className="check-label">
            <input
              type="checkbox"
              checked={state.settings.parking.breakReview}
              onChange={(e) =>
                void changeSettings({
                  parking: {
                    ...state.settings.parking,
                    breakReview: e.target.checked,
                  },
                })
              }
            />
            {t("Review during breaks")}
          </label>
        </div>
      </Panel>
      <ParkingReview />
      <Panel title={t("Distraction insights")} icon={Timer}>
        <div className="data-row">
          <span className="grow">{t("Most distracting hour")}</span>
          <strong>{top ? String(top[0]).padStart(2, "0") + ":00" : "—"}</strong>
        </div>
        <div className="data-row">
          <span className="grow">{t("Interruptions per focus hour")}</span>
          <strong>
            {hours
              ? (
                  active(state.parkingItems).filter((item) => item.sessionId)
                    .length / hours
                ).toFixed(1)
              : "—"}
          </strong>
        </div>
        {active(state.courses).map((course) => (
          <div key={course.id} className="data-row">
            <span className="grow">{course.name}</span>
            {
              active(state.parkingItems).filter(
                (item) => item.courseId === course.id,
              ).length
            }
          </div>
        ))}
      </Panel>
    </>
  );
}
