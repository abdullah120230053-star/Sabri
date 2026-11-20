import { useState } from "react";
import {
  CalendarClock,
  CalendarDays,
  Check,
  Clock,
  Lock,
  Play,
  Plus,
  WandSparkles,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { formatInTimeZone } from "date-fns-tz";
import { active, scheduleSchema, type RecordFor } from "../shared/schema";
import {
  type DraftBlock,
  type PlanDay,
  type PlannerRequest,
  referencedBlockDone,
} from "../shared/logic/planner";
import { studyStats } from "../shared/academic";
import { PlanTimeline } from "./plan-timeline";
import { focusScore } from "../shared/logic/study-insights";
import { presetEnergy } from "../shared/logic/energy";
import { addDate, dayKey, dayOf, minutesAt, minuteTime } from "../shared/time";
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
  FormActions,
  Modal,
  PageHead,
  Panel,
  useNow,
} from "./ui";
import "./addon-ui.css";

type Block = RecordFor<"planBlocks">;
type Review = RecordFor<"dayReviews">;

export function TodayPlanWidget() {
  const { t } = useTranslation(),
    go = useNavigate(),
    state = useSabri((s) => s.data);
  const today = dayKey(useNow(60000), state.settings.location.timezone);
  const blocks = active(state.planBlocks)
    .filter(
      (item) =>
        item.date === today && ["planned", "done"].includes(item.status),
    )
    .sort((a, b) => a.start.localeCompare(b.start));
  return (
    <Panel
      title={t("Today Plan")}
      icon={CalendarClock}
      action={<Button onClick={() => go("/plan")}>{t("Open")}</Button>}
    >
      {blocks.length ? (
        blocks.slice(0, 4).map((block) => (
          <div key={block.id} className="data-row">
            <strong>{block.start}</strong>
            <span>{block.title ?? t("Study block")}</span>
            {referencedBlockDone(block, state) && <Check size={16} />}
          </div>
        ))
      ) : (
        <Empty
          compact
          title={t("No plan yet")}
          icon={CalendarDays}
          action={<Button onClick={() => go("/plan")}>{t("Generate")}</Button>}
        />
      )}
    </Panel>
  );
}

export function PlannerPage() {
  const { t } = useTranslation(),
    go = useNavigate(),
    state = useSabri((s) => s.data);
  const now = useNow(60000),
    today = dayKey(now, state.settings.location.timezone);
  const [date, setDate] = useState(today),
    [count, setCount] = useState<1 | 7>(1);
  const [energy, setEnergy] =
    useState<NonNullable<PlannerRequest["energy"]>>("normal");
  const [load, setLoad] =
    useState<NonNullable<PlannerRequest["load"]>>("normal");
  const [examPeriod, setExamPeriod] = useState(false),
    [draft, setDraft] = useState<PlanDay[]>(),
    [from, setFrom] = useState<number>();
  const [edit, setEdit] = useState<Block>(),
    [swap, setSwap] = useState<string>(),
    [showReview, setShowReview] = useState(false),
    [showSettings, setShowSettings] = useState(false),
    [weekly, setWeekly] = useState(false);
  const review = active(state.dayReviews).find((item) => item.date === date);
  const [pins, setPins] = useState<string[]>(review?.big3 ?? []);
  const dates = Array.from({ length: count }, (_, i) => addDate(date, i));
  const stored = active(state.planBlocks).filter(
    (item) =>
      dates.includes(item.date) && !["skipped", "moved"].includes(item.status),
  );
  const generate = async (minute?: number, target = date, selected = pins) => {
    try {
      setFrom(minute);
      setDraft(
        await window.sabri.generatePlan({
          date: target,
          count,
          energy,
          load,
          examPeriod,
          pinned: selected,
          fromMinute: minute,
        }),
      );
    } catch {
      tell(t("Could not generate the plan"));
    }
  };
  const accept = async () => {
    if (!draft) return;
    const days = new Set(draft.map((item) => item.date));
    const replacements = active(current().planBlocks).filter(
      (item) =>
        days.has(item.date) &&
        !item.locked &&
        !referencedBlockDone(item, current()) &&
        (item.date !== date ||
          from === undefined ||
          minutesAt(item.start) >= from),
    );
    const timestamp = new Date().toISOString();
    if (
      await patch([
        ...replacements.map((value) => ({
          collection: "planBlocks" as const,
          value: { ...value, deletedAt: timestamp },
        })),
        ...draft.flatMap((day) =>
          day.blocks.map((value) => ({
            collection: "planBlocks" as const,
            value: { ...fresh(), ...value },
          })),
        ),
      ])
    )
      setDraft(undefined);
  };
  const start = async (item: Block) => {
    const data = current(),
      timer = useSabri.getState().timer;
    if (data.timer.status !== "idle") {
      go("/focus");
      return;
    }
    const task =
      item.refType === "todo"
        ? data.tasks.find((row) => row.id === item.refId)
        : undefined;
    const assignment =
      item.refType === "assignment"
        ? data.assignments.find((row) => row.id === item.refId)
        : undefined;
    const session =
      item.refType === "studySession"
        ? data.studySessions.find((row) => row.id === item.refId)
        : undefined;
    const plan = data.examPlans.find((row) => row.id === session?.planId);
    await timer({ type: "select", phase: "focus" });
    await timer({
      type: "link",
      taskId: task?.id,
      courseId: task?.courseId ?? assignment?.courseId ?? plan?.courseId,
      assignmentId: assignment?.id,
      studySessionId: session?.id,
      planBlockId: item.id,
    });
    await timer({ type: "toggle" });
    go("/focus");
  };
  const suggested = (value: DraftBlock) =>
    save("planBlocks", { ...fresh(), ...value });
  const modify = (item: Block) => {
    if (!swap) {
      setSwap(item.id);
      return;
    }
    const other = stored.find((block) => block.id === swap);
    setSwap(undefined);
    if (!other || other.id === item.id || other.locked || item.locked) return;
    if (
      minutesAt(other.end) - minutesAt(other.start) !==
      minutesAt(item.end) - minutesAt(item.start)
    ) {
      tell(t("Swap blocks with the same duration."));
      return;
    }
    void patch([
      {
        collection: "planBlocks",
        value: {
          ...item,
          date: other.date,
          start: other.start,
          end: other.end,
        },
      },
      {
        collection: "planBlocks",
        value: { ...other, date: item.date, start: item.start, end: item.end },
      },
    ]);
  };
  const setDateView = (key: string) => {
    if (!key) return;
    setDate(key);
    setDraft(undefined);
    setPins(
      active(state.dayReviews).find((item) => item.date === key)?.big3 ?? [],
    );
  };
  return (
    <>
      <PageHead
        title={t("Today Plan")}
        description={t(
          "Fit study around your classes, meals, and prayer times.",
        )}
        action={
          <>
            <Button onClick={() => setShowSettings(true)}>
              {t("Plan preferences")}
            </Button>
            <Button onClick={() => setWeekly(true)}>
              {t("Weekly review")}
            </Button>
            <Button onClick={() => setShowReview(true)}>
              {t("Daily shutdown")}
            </Button>
            <Button
              variant="primary"
              icon={WandSparkles}
              onClick={() => void generate()}
            >
              {t("Generate")}
            </Button>
          </>
        }
      />
      <Panel title={t("Planning window")} icon={CalendarDays}>
        <div className="addon-controls">
          <Field label={t("Date")}>
            <input
              type="date"
              value={date}
              onChange={(e) => setDateView(e.target.value)}
            />
          </Field>
          <Field label={t("View")}>
            <select
              value={count}
              onChange={(e) => {
                setCount(e.target.value === "7" ? 7 : 1);
                setDraft(undefined);
              }}
            >
              <option value="1">{t("Day")}</option>
              <option value="7">{t("Week")}</option>
            </select>
          </Field>
          <Field label={t("Energy today")}>
            <select
              value={energy}
              onChange={(e) => setEnergy(e.target.value as typeof energy)}
            >
              {(["low", "normal", "high"] as const).map((item) => (
                <option key={item} value={item}>
                  {t(item)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("Daily load")}>
            <select
              value={load}
              onChange={(e) => setLoad(e.target.value as typeof load)}
            >
              {(["light", "normal", "heavy"] as const).map((item) => (
                <option key={item} value={item}>
                  {t(item)}
                </option>
              ))}
            </select>
          </Field>
          <label className="check-label">
            <input
              type="checkbox"
              checked={examPeriod}
              onChange={(e) => setExamPeriod(e.target.checked)}
            />
            {t("Exam-period mode")}
          </label>
          {date === today && (
            <Button
              onClick={() =>
                void generate(
                  minutesAt(
                    formatInTimeZone(
                      now,
                      state.settings.location.timezone,
                      "HH:mm",
                    ),
                  ),
                )
              }
            >
              {t("Replan from now")}
            </Button>
          )}
        </div>
        <BigThree
          state={state}
          pins={pins}
          setPins={(value) => {
            setPins(value);
            void save("dayReviews", {
              ...(review ?? fresh()),
              date,
              big3: value,
              carryCounts: review?.carryCounts ?? {},
            });
          }}
        />
      </Panel>
      {draft && (
        <Panel
          title={t("Draft plan")}
          icon={WandSparkles}
          action={
            <>
              <Button onClick={() => setDraft(undefined)}>
                {t("Discard draft")}
              </Button>
              <Button variant="primary" onClick={() => void accept()}>
                {t("Accept all")}
              </Button>
            </>
          }
        >
          {draft.map((day) => (
            <section key={day.date} className="addon-section">
              <h3>{day.date}</h3>
              {[
                ...day.fixed.map((block) => ({
                  key: block.title + block.start,
                  start: minuteTime(Math.max(0, block.start)),
                  title: block.title,
                  info: t("Fixed"),
                })),
                ...day.blocks.map((item) => ({
                  key: item.start + item.kind,
                  start: item.start,
                  title: item.title ?? t("Study block"),
                  info: t(item.reason ?? ""),
                })),
              ]
                .sort((a, b) => a.start.localeCompare(b.start))
                .map((block, index) => (
                  <div className="data-row" key={block.key + index}>
                    <strong>{block.start}</strong>
                    <span className="grow">{t(block.title)}</span>
                    <small>{block.info}</small>
                  </div>
                ))}
              {day.unused.length > 0 && (
                <details open>
                  <summary>
                    {t("Didn’t fit")} ({day.unused.length})
                  </summary>
                  {day.unused.map(({ work, minutes, reason }) => (
                    <div key={work.key} className="data-row addon-wrap">
                      <span className="grow">
                        <strong>{work.title}</strong>
                        <small>
                          {minutes} {t("min")} ·{" "}
                          {t(
                            reason === "capacity"
                              ? "Daily limit or buffer reached"
                              : "No open window of the required length",
                          )}
                        </small>
                      </span>
                      {work.refType === "todo" && (
                        <>
                          <Button
                            onClick={() => {
                              const task = current().tasks.find(
                                (item) => item.id === work.refId,
                              );
                              if (task)
                                void save("tasks", {
                                  ...task,
                                  deferUntil: addDate(day.date, 1),
                                }).then(() => generate());
                            }}
                          >
                            {t("Move to tomorrow")}
                          </Button>
                          <Button
                            onClick={() => {
                              const task = current().tasks.find(
                                (item) => item.id === work.refId,
                              );
                              if (task)
                                void save("tasks", {
                                  ...task,
                                  estimated: Math.max(1, task.estimated - 1),
                                }).then(() => generate());
                            }}
                          >
                            {t("Shorten")}
                          </Button>
                          <Button
                            onClick={async () => {
                              const task = current().tasks.find(
                                (item) => item.id === work.refId,
                              );
                              if (!task || task.estimated < 2) return;
                              const first = Math.ceil(task.estimated / 2);
                              await patch([
                                {
                                  collection: "tasks",
                                  value: { ...task, estimated: first },
                                },
                                {
                                  collection: "tasks",
                                  value: {
                                    ...task,
                                    ...fresh(),
                                    title: (
                                      task.title +
                                      " · " +
                                      t("Part 2")
                                    ).slice(0, 200),
                                    estimated: task.estimated - first,
                                    pomodoros: 0,
                                    deferUntil: addDate(day.date, 1),
                                  },
                                },
                              ]);
                              await generate();
                            }}
                            disabled={
                              (state.tasks.find(
                                (item) => item.id === work.refId,
                              )?.estimated ?? 0) < 2
                            }
                          >
                            {t("Split")}
                          </Button>
                        </>
                      )}
                      <Button
                        onClick={() =>
                          setDraft(
                            draft.map((item) =>
                              item === day
                                ? {
                                    ...item,
                                    unused: item.unused.filter(
                                      (entry) => entry.work.key !== work.key,
                                    ),
                                  }
                                : item,
                            ),
                          )
                        }
                      >
                        {t("Dismiss")}
                      </Button>
                    </div>
                  ))}
                </details>
              )}
            </section>
          ))}
        </Panel>
      )}
      <Panel
        title={t("Accepted plan")}
        icon={Clock}
        action={
          <Button
            icon={Plus}
            onClick={() =>
              setEdit({
                ...fresh(),
                date,
                start: "18:00",
                end: "18:25",
                kind: "task",
                locked: false,
                status: "planned",
                title: "",
              })
            }
          >
            {t("Add block")}
          </Button>
        }
      >
        {dates.map((key) => (
          <section
            className="addon-section"
            key={key}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const value = stored.find(
                (item) => item.id === event.dataTransfer.getData("text/plain"),
              );
              if (value && !value.locked) setEdit({ ...value, date: key });
            }}
          >
            {count === 7 && <h3>{key}</h3>}
            <PlanTimeline
              date={key}
              blocks={stored.filter((item) => item.date === key)}
              edit={setEdit}
            />
            {stored
              .filter((item) => item.date === key)
              .sort((a, b) => a.start.localeCompare(b.start))
              .map((item) => (
                <div
                  key={item.id}
                  className="data-row addon-wrap"
                  aria-selected={swap === item.id}
                  draggable={!item.locked}
                  onDragStart={(event) =>
                    event.dataTransfer.setData("text/plain", item.id)
                  }
                >
                  <span className="addon-time">
                    {item.start}–{item.end}
                  </span>
                  <span className="grow">
                    <strong>{t(item.title ?? "Study block")}</strong>
                    <small>{t(item.reason ?? "")}</small>
                  </span>
                  {referencedBlockDone(item, state) ? (
                    <Check size={17} />
                  ) : (
                    !["break", "buffer"].includes(item.kind) && (
                      <Button icon={Play} onClick={() => void start(item)}>
                        {t("Start")}
                      </Button>
                    )
                  )}
                  <Button
                    onClick={() =>
                      void save("planBlocks", {
                        ...item,
                        status: item.status === "done" ? "planned" : "done",
                      })
                    }
                  >
                    {t(item.status === "done" ? "Reopen" : "Mark done")}
                  </Button>
                  <Button
                    icon={Lock}
                    aria-pressed={item.locked}
                    onClick={() =>
                      void save("planBlocks", { ...item, locked: !item.locked })
                    }
                  >
                    {t(item.locked ? "Unlock" : "Lock")}
                  </Button>
                  <Button onClick={() => modify(item)} disabled={item.locked}>
                    {t("Swap")}
                  </Button>
                  <Button onClick={() => setEdit(item)}>{t("Edit")}</Button>
                </div>
              ))}
          </section>
        ))}
        {!stored.length && (
          <p className="muted">
            {t("Generate a draft and accept it to start planning.")}
          </p>
        )}
      </Panel>
      {edit && (
        <Modal title={t("Plan block")} close={() => setEdit(undefined)}>
          <form
            className="form-grid"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await suggested(edit)) setEdit(undefined);
            }}
          >
            <Field label={t("Title")} wide>
              <input
                required
                value={edit.title ?? ""}
                onChange={(e) => setEdit({ ...edit, title: e.target.value })}
              />
            </Field>
            <Field label={t("Date")}>
              <input
                required
                type="date"
                value={edit.date}
                onChange={(e) => setEdit({ ...edit, date: e.target.value })}
              />
            </Field>
            <Field label={t("Start time")}>
              <input
                required
                type="time"
                value={edit.start}
                onChange={(e) => setEdit({ ...edit, start: e.target.value })}
              />
            </Field>
            <Field label={t("End time")}>
              <input
                required
                type="time"
                value={edit.end}
                onChange={(e) => setEdit({ ...edit, end: e.target.value })}
              />
            </Field>
            <FormActions close={() => setEdit(undefined)} />
          </form>
          {state.planBlocks.some((item) => item.id === edit.id) && (
            <div className="modal-secondary">
              <Button
                variant="danger"
                onClick={() => {
                  void remove("planBlocks", edit);
                  setEdit(undefined);
                }}
              >
                {t("Delete")}
              </Button>
              <Button
                onClick={() =>
                  void save(
                    "schedule",
                    scheduleSchema.parse({
                      ...fresh(),
                      title: edit.title,
                      kind: "study",
                      dayOfWeek: dayOf(edit.date),
                      start: edit.start,
                      end: edit.end,
                      recurrence: "once",
                      onDate: edit.date,
                    }),
                  ).then(() => tell(t("Saved")))
                }
              >
                {t("Pin to timetable")}
              </Button>
            </div>
          )}
        </Modal>
      )}
      {showReview && (
        <Shutdown
          date={date}
          close={() => setShowReview(false)}
          planTomorrow={(selected) => {
            const next = addDate(date, 1);
            setDateView(next);
            setPins(selected);
            void generate(undefined, next, selected);
          }}
        />
      )}
      {weekly && (
        <WeeklyReview
          date={date}
          close={() => setWeekly(false)}
          planWeek={() => {
            setWeekly(false);
            setCount(7);
            setDraft(undefined);
            void window.sabri
              .generatePlan({
                date,
                count: 7,
                energy,
                load,
                examPeriod,
                pinned: pins,
              })
              .then(setDraft)
              .catch(() => tell(t("Could not generate the plan")));
          }}
        />
      )}
      {showSettings && <PlanPreferences close={() => setShowSettings(false)} />}
    </>
  );
}

function BigThree({
  state,
  pins,
  setPins,
}: {
  state: ReturnType<typeof current>;
  pins: string[];
  setPins: (value: string[]) => void;
}) {
  const { t } = useTranslation();
  const options = [
    ...active(state.tasks).filter((item) => item.status !== "done"),
    ...active(state.assignments).filter(
      (item) => !["submitted", "graded"].includes(item.status),
    ),
  ];
  return (
    <fieldset className="addon-section">
      <legend>{t("Big 3")}</legend>
      <div className="addon-controls">
        {[0, 1, 2].map((index) => (
          <Field key={index} label={String(index + 1)}>
            <select
              value={pins[index] ?? ""}
              onChange={(e) => {
                const values = pins.slice();
                values[index] = e.target.value;
                setPins(values.filter(Boolean));
              }}
            >
              <option value="">—</option>
              {options
                .filter(
                  (item) => !pins.includes(item.id) || pins[index] === item.id,
                )
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
            </select>
          </Field>
        ))}
      </div>
    </fieldset>
  );
}

function Shutdown({
  date,
  close,
  planTomorrow,
}: {
  date: string;
  close: () => void;
  planTomorrow: (selected: string[]) => void;
}) {
  const { t } = useTranslation(),
    state = useSabri((s) => s.data),
    tomorrow = addDate(date, 1);
  const before = active(state.dayReviews).find((item) => item.date === date),
    next = active(state.dayReviews).find((item) => item.date === tomorrow);
  const [rating, setRating] = useState<Review["focusRating"]>(
      before?.focusRating,
    ),
    [notes, setNotes] = useState(before?.notes ?? "");
  const [pins, setPins] = useState(next?.big3 ?? []);
  const blocks = active(state.planBlocks).filter(
    (item) =>
      item.date === date && item.kind !== "break" && item.kind !== "buffer",
  );
  const carry = async (item: Block) => {
    const task = state.tasks.find(
      (row) => row.id === item.refId && !row.deletedAt,
    );
    if (!task) {
      void save("planBlocks", { ...item, date: tomorrow, status: "planned" });
      return;
    }
    const carries = (before?.carryCounts[task.id] ?? 0) + 1;
    const priority = {
      low: "medium",
      medium: "high",
      high: "urgent",
      urgent: "urgent",
    } as const;
    await patch([
      {
        collection: "tasks",
        value: {
          ...task,
          priority: priority[task.priority],
          deferUntil: tomorrow,
        },
      },
      { collection: "planBlocks", value: { ...item, status: "moved" } },
      {
        collection: "dayReviews",
        value: {
          ...(before ?? fresh()),
          date,
          big3: before?.big3 ?? [],
          carryCounts: { ...before?.carryCounts, [task.id]: carries },
        },
      },
    ]);
    if (carries >= 3)
      tell(t("Carried three times. Do it, shorten it, or drop it."));
  };
  return (
    <Modal title={t("Daily shutdown")} close={close} wide>
      <p>
        {blocks.filter((item) => referencedBlockDone(item, state)).length} /{" "}
        {blocks.length} {t("planned blocks done")}
      </p>
      <p>
        {t("Daily focus score")} · {focusScore(state, date) ?? "—"}
      </p>
      {blocks
        .filter(
          (item) =>
            !referencedBlockDone(item, state) && item.status === "planned",
        )
        .map((item) => (
          <div key={item.id} className="data-row">
            <span className="grow">{item.title}</span>
            <Button
              onClick={() =>
                void save("planBlocks", { ...item, status: "done" })
              }
            >
              {t("Mark done")}
            </Button>
            <Button onClick={() => void carry(item)}>
              {t("Carry to tomorrow")}
            </Button>
          </div>
        ))}
      <form
        className="form-grid addon-section"
        onSubmit={async (e) => {
          e.preventDefault();
          if (
            await patch([
              {
                collection: "dayReviews",
                value: {
                  ...(before ?? fresh()),
                  date,
                  big3: before?.big3 ?? [],
                  carryCounts: before?.carryCounts ?? {},
                  focusRating: rating,
                  notes,
                  reviewed: true,
                  cleanSweep:
                    blocks.length > 0 &&
                    blocks.every((item) => referencedBlockDone(item, state)),
                },
              },
              {
                collection: "dayReviews",
                value: {
                  ...(next ?? fresh()),
                  date: tomorrow,
                  carryCounts: next?.carryCounts ?? {},
                  big3: pins,
                },
              },
            ])
          ) {
            close();
            planTomorrow(pins);
          }
        }}
      >
        <Field label={t("Focus rating")}>
          <select
            value={rating ?? ""}
            onChange={(e) =>
              setRating(
                e.target.value
                  ? (Number(e.target.value) as Review["focusRating"])
                  : undefined,
              )
            }
          >
            <option value="">—</option>
            {[1, 2, 3, 4, 5].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </Field>
        <Field label={t("Reflection")}>
          <input
            maxLength={8000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>
        <div className="wide">
          <BigThree state={state} pins={pins} setPins={setPins} />
        </div>
        <FormActions close={close} label={t("Draft tomorrow")} />
      </form>
    </Modal>
  );
}

function WeeklyReview({
  date,
  close,
  planWeek,
}: {
  date: string;
  close: () => void;
  planWeek: () => void;
}) {
  const { t } = useTranslation(),
    state = useSabri((s) => s.data),
    [goal, setGoal] = useState(state.settings.focus.weeklyGoal);
  const report = studyStats(state, date, 7);
  return (
    <Modal title={t("Weekly review")} close={close}>
      <div className="data-row">
        <span className="grow">{t("Focus time this week")}</span>
        {Math.round(report.thisWeek)} {t("min")}
      </div>
      <div className="data-row">
        <span className="grow">{t("Focus time last week")}</span>
        {Math.round(report.lastWeek)} {t("min")}
      </div>
      <div className="data-row">
        <span className="grow">{t("Tasks completed")}</span>
        {report.completed}
      </div>
      <form
        className="form-grid addon-section"
        onSubmit={async (event) => {
          event.preventDefault();
          if (
            await changeSettings({
              focus: { ...state.settings.focus, weeklyGoal: goal },
            })
          )
            planWeek();
        }}
      >
        <Field wide label={t("Weekly focus goal (minutes)")}>
          <input
            type="number"
            required
            min="5"
            max="10080"
            value={goal}
            onChange={(event) => setGoal(+event.target.value)}
          />
        </Field>
        <FormActions close={close} label={t("Draft week")} />
      </form>
    </Modal>
  );
}

function PlanPreferences({ close }: { close: () => void }) {
  const { t } = useTranslation(),
    state = useSabri((s) => s.data),
    [draft, setDraft] = useState(state.settings.planner);
  const profile = active(state.energyProfiles).find(
    (item) => item.source === "manual",
  );
  const [hours, setHours] = useState(
    profile?.hours ?? presetEnergy(draft.energyPreset),
  );
  const [weekday, setWeekday] = useState(0);
  const update = (value: Partial<typeof draft>) =>
    setDraft({ ...draft, ...value });
  return (
    <Modal title={t("Plan preferences")} close={close} wide>
      <form
        className="form-grid"
        onSubmit={async (e) => {
          e.preventDefault();
          if (
            draft.energyMode === "manual" &&
            !(await save("energyProfiles", {
              ...(profile ?? fresh()),
              hours,
              source: "manual",
              sampleCount: 0,
            }))
          )
            return;
          if (await changeSettings({ planner: draft })) close();
        }}
      >
        {(["dayStart", "dayEnd", "shutdownReminderAt"] as const).map((key) => (
          <Field
            key={key}
            label={t(
              {
                dayStart: "Day starts",
                dayEnd: "Day ends",
                shutdownReminderAt: "Shutdown reminder",
              }[key],
            )}
          >
            <input
              type="time"
              required
              value={draft[key]}
              onChange={(e) => update({ [key]: e.target.value })}
            />
          </Field>
        ))}
        {(
          [
            "maxFocusHoursPerDay",
            "minBlockMin",
            "bufferPercent",
            "commuteBufferMin",
            "prayerBufferBeforeMin",
            "prayerBufferAfterMin",
          ] as const
        ).map((key) => (
          <Field
            key={key}
            label={t(
              {
                maxFocusHoursPerDay: "Daily focus cap (hours)",
                minBlockMin: "Minimum block (minutes)",
                bufferPercent: "Buffer (%)",
                commuteBufferMin: "Commute buffer (minutes)",
                prayerBufferBeforeMin: "Before prayer (minutes)",
                prayerBufferAfterMin: "After prayer (minutes)",
              }[key],
            )}
          >
            <input
              type="number"
              min="0"
              value={draft[key]}
              onChange={(e) => update({ [key]: +e.target.value })}
            />
          </Field>
        ))}
        <Field label={t("Energy profile")}>
          <select
            value={draft.energyMode}
            onChange={(e) =>
              update({ energyMode: e.target.value as typeof draft.energyMode })
            }
          >
            {(["preset", "manual", "learned"] as const).map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </Field>
        <Field label={t("Energy preset")}>
          <select
            value={draft.energyPreset}
            onChange={(e) =>
              update({
                energyPreset: e.target.value as typeof draft.energyPreset,
              })
            }
          >
            {(["morning", "balanced", "night"] as const).map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </Field>
        <label className="check-label">
          <input
            type="checkbox"
            checked={draft.shutdownEnabled}
            onChange={(e) => update({ shutdownEnabled: e.target.checked })}
          />
          {t("Daily shutdown reminder")}
        </label>
        {draft.energyMode === "manual" && (
          <div className="wide">
            <Field label={t("Day of week")}>
              <select
                value={weekday}
                onChange={(e) => setWeekday(+e.target.value)}
              >
                {Array.from({ length: 7 }, (_, i) => (
                  <option key={i} value={i}>
                    {new Intl.DateTimeFormat(state.settings.language, {
                      weekday: "long",
                      timeZone: "UTC",
                    }).format(new Date(Date.UTC(2026, 10, 15 + i)))}
                  </option>
                ))}
              </select>
            </Field>
            <div className="addon-energy">
              {hours[weekday]?.map((value, index) => (
                <Field key={index} label={minuteTime(index * 60)}>
                  <input
                    type="number"
                    min="0"
                    max="1"
                    step=".1"
                    value={value}
                    onChange={(e) =>
                      setHours(
                        hours.map((row, i) =>
                          i === weekday
                            ? row.map((v, j) =>
                                j === index ? +e.target.value : v,
                              )
                            : row,
                        ),
                      )
                    }
                  />
                </Field>
              ))}
            </div>
          </div>
        )}
        <div className="wide">
          <Button
            onClick={() =>
              update({
                meals: [
                  ...draft.meals,
                  { label: t("Meal"), start: "13:00", end: "14:00" },
                ],
              })
            }
            disabled={draft.meals.length >= 8}
          >
            {t("Add meal window")}
          </Button>
          {draft.meals.map((value, index) => (
            <div className="addon-controls" key={index}>
              <Field label={t("Title")}>
                <input
                  required
                  value={value.label}
                  onChange={(e) =>
                    update({
                      meals: draft.meals.map((item, i) =>
                        i === index ? { ...item, label: e.target.value } : item,
                      ),
                    })
                  }
                />
              </Field>
              {(["start", "end"] as const).map((key) => (
                <Field key={key} label={t(key)}>
                  <input
                    type="time"
                    required
                    value={value[key]}
                    onChange={(e) =>
                      update({
                        meals: draft.meals.map((item, i) =>
                          i === index
                            ? { ...item, [key]: e.target.value }
                            : item,
                        ),
                      })
                    }
                  />
                </Field>
              ))}
              <Button
                onClick={() =>
                  update({ meals: draft.meals.filter((_, i) => i !== index) })
                }
              >
                {t("Delete")}
              </Button>
            </div>
          ))}
        </div>
        <FormActions close={close} />
      </form>
    </Modal>
  );
}
