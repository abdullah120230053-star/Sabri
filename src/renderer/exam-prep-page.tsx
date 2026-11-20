import { useState } from "react";
import {
  BookOpen,
  Check,
  ClipboardList,
  GraduationCap,
  Plus,
  Timer,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { active, applyPatch, type RecordFor } from "../shared/schema";
import {
  examReadiness,
  examSchedule,
  moveMissed,
  suggestedMinutes,
  weight,
} from "../shared/logic/exam-prep";
import { dateSpan, dayKey, dayOf } from "../shared/time";
import {
  changeSettings,
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

type Plan = RecordFor<"examPlans">;
type Topic = Plan["topics"][number];
type Session = RecordFor<"studySessions">;
const checklist = [
  "ID",
  "Calculator",
  "Pens",
  "Location",
  "Time",
  "Transport",
] as const;
const newTopic = (name: string): Topic => ({
  id: crypto.randomUUID(),
  name,
  difficulty: 3,
  confidence: 3,
  estimatedHours: 2.25,
  resources: [],
});

export function ExamWidget() {
  const { t } = useTranslation(),
    go = useNavigate(),
    state = useSabri((s) => s.data);
  const today = dayKey(useNow(60000), state.settings.location.timezone);
  const upcoming = active(state.examPlans)
    .flatMap((plan) => {
      const exam = active(state.calendar).find(
        (item) => item.id === plan.eventId && item.date >= today,
      );
      return exam ? [{ plan, exam }] : [];
    })
    .sort((a, b) => a.exam.date.localeCompare(b.exam.date))[0];
  return (
    <Panel
      title={t("Exam readiness")}
      icon={GraduationCap}
      action={<Button onClick={() => go("/exam-prep")}>{t("Open")}</Button>}
    >
      {upcoming ? (
        <>
          <strong>{upcoming.exam.title}</strong>
          <p>
            {dateSpan(today, upcoming.exam.date)} {t("days")}
          </p>
          <progress
            className="addon-meter"
            value={examReadiness(upcoming.plan, state.studySessions)}
            max={100}
          />
          <small>{examReadiness(upcoming.plan, state.studySessions)}%</small>
        </>
      ) : (
        <p className="muted">{t("No upcoming exam plans")}</p>
      )}
    </Panel>
  );
}

export function ExamPrepPage() {
  const { t } = useTranslation(),
    state = useSabri((s) => s.data),
    go = useNavigate();
  const today = dayKey(useNow(60000), state.settings.location.timezone);
  const [edit, setEdit] = useState<Plan>(),
    [only, setOnly] = useState<string>(),
    [preview, setPreview] = useState<ReturnType<typeof examSchedule>>();
  const [options, setOptions] = useState(false);
  const [score, setScore] = useState<Plan>(),
    [mock, setMock] = useState<{
      plan: Plan;
      end: number;
      recorded: boolean;
    }>();
  const now = useNow(1000);
  const leaveMock = () => {
    void window.sabri.quietMock(0);
    setMock(undefined);
  };
  const plans = active(state.examPlans),
    sessions = active(state.studySessions),
    events = active(state.calendar);
  const add = () =>
    setEdit({
      ...fresh(),
      eventId: "",
      courseId: "",
      topics: [],
      settings: { ...state.settings.examPrep },
      checklist: [],
    });
  const generate = (id?: string) => {
    setOnly(id);
    setPreview(examSchedule(state, today, id));
  };
  const accept = async () => {
    if (!preview) return;
    const replaced = sessions.filter(
      (item) => item.status !== "done" && (!only || item.planId === only),
    );
    if (
      await patch([
        ...replaced.map((value) => ({
          collection: "studySessions" as const,
          value: { ...value, deletedAt: new Date().toISOString() },
        })),
        ...preview.sessions.map((value) => ({
          collection: "studySessions" as const,
          value: { ...fresh(), ...value },
        })),
      ])
    )
      setPreview(undefined);
  };
  const complete = (item: Session, confidence: Topic["confidence"]) => {
    const plan = plans.find((row) => row.id === item.planId);
    if (!plan) return;
    const changes: Parameters<typeof patch>[0] = [
      {
        collection: "studySessions",
        value: { ...item, status: "done", confidenceAfter: confidence },
      },
      {
        collection: "examPlans",
        value: {
          ...plan,
          topics: plan.topics.map((topic) =>
            topic.id === item.topicId ? { ...topic, confidence } : topic,
          ),
        },
      },
    ];
    if (confidence <= 2) {
      const draft = applyPatch(state, { changes });
      const proposal = examSchedule(draft, today, plan.id).sessions.filter(
        (value) => value.topicId === item.topicId && value.kind === "review",
      );
      const extra = proposal.find((value) => {
        if (
          sessions.some(
            (existing) =>
              existing.planId === item.planId &&
              existing.topicId === item.topicId &&
              existing.date === value.date &&
              existing.kind === "review",
          )
        )
          return false;
        const booked = sessions.filter(
          (existing) =>
            existing.date === value.date && existing.status !== "missed",
        );
        const total = booked.reduce((sum, row) => sum + row.minutes, 0);
        const own = booked
          .filter((row) => row.planId === plan.id)
          .reduce((sum, row) => sum + row.minutes, 0);
        return (
          total + value.minutes <=
            state.settings.examPrep.maxHoursPerDay * 60 &&
          own + value.minutes <=
            Math.min(
              plan.settings.maxHoursPerDay,
              plan.settings.availableHoursByWeekday?.[dayOf(value.date)] ?? 24,
            ) *
              60
        );
      });
      if (extra)
        changes.push({
          collection: "studySessions",
          value: { ...fresh(), ...extra },
        });
    }
    void patch(changes);
  };
  return (
    <>
      <PageHead
        title={t("Exam Prep")}
        description={t(
          "Schedule learning, spaced reviews, and practice before each exam.",
        )}
        action={
          <>
            <Button onClick={() => setOptions(true)}>
              {t("Exam preferences")}
            </Button>
            <Button
              onClick={() =>
                void patch(
                  moveMissed(state, today).map((value) => ({
                    collection: "studySessions",
                    value,
                  })),
                )
              }
            >
              {t("Reschedule missed sessions")}
            </Button>
            <Button onClick={() => generate()} disabled={!plans.length}>
              {t("Balance all exams")}
            </Button>
            <Button variant="primary" icon={Plus} onClick={add}>
              {t("New exam plan")}
            </Button>
          </>
        }
      />
      {preview && (
        <Panel
          title={t("Review session draft")}
          icon={ClipboardList}
          action={
            <>
              <Button onClick={() => setPreview(undefined)}>
                {t("Cancel")}
              </Button>
              <Button variant="primary" onClick={() => void accept()}>
                {t("Accept all")}
              </Button>
            </>
          }
        >
          {preview.didNotFit.map((item, index) => (
            <p key={index} className="warning">
              {
                plans
                  .find((plan) => plan.id === item.planId)
                  ?.topics.find((topic) => topic.id === item.topicId)?.name
              }{" "}
              ·{" "}
              {t(
                item.reason === "minimum"
                  ? "Learning and review could not both fit"
                  : "Some practice time did not fit",
              )}
            </p>
          ))}
          {preview.sessions.map((item, index) => (
            <div className="data-row" key={index}>
              <span className="addon-time">{item.date}</span>
              <span className="grow">
                {
                  plans
                    .find((plan) => plan.id === item.planId)
                    ?.topics.find((topic) => topic.id === item.topicId)?.name
                }
              </span>
              {t(item.kind)} · {item.minutes} {t("min")}
            </div>
          ))}
        </Panel>
      )}
      {!plans.length && (
        <Panel title={t("Exam Prep")} icon={GraduationCap}>
          <Empty
            title={t("No exam plans yet")}
            detail={t(
              "Add an exam on your calendar, then create a plan for its topics.",
            )}
            icon={BookOpen}
          />
          <Button onClick={() => go("/calendar")}>{t("Open calendar")}</Button>
        </Panel>
      )}
      {plans.map((plan) => {
        const exam = events.find((item) => item.id === plan.eventId),
          rows = sessions
            .filter((item) => item.planId === plan.id)
            .sort((a, b) => a.date.localeCompare(b.date)),
          readiness = examReadiness(plan, sessions);
        return (
          <Panel
            key={plan.id}
            className="addon-card"
            title={exam?.title ?? t("Exam")}
            icon={GraduationCap}
            action={
              <>
                <Button onClick={() => setEdit(plan)}>{t("Edit")}</Button>
                <Button onClick={() => generate(plan.id)}>
                  {t("Generate")}
                </Button>
                <Button
                  icon={Timer}
                  onClick={() => {
                    setMock({
                      plan,
                      end: Date.now() + plan.settings.sessionMinutes * 60000,
                      recorded: false,
                    });
                    if (state.settings.examPrep.quietMock)
                      void window.sabri.quietMock(plan.settings.sessionMinutes);
                  }}
                >
                  {t("Mock exam")}
                </Button>
                <Button onClick={() => setScore(plan)}>
                  {t("Log exam score")}
                </Button>
              </>
            }
          >
            <p>
              {exam?.date} · {readiness}% {t("ready")}
            </p>
            <progress className="addon-meter" value={readiness} max={100} />
            <details className="addon-section">
              <summary>{t("Weak topics")}</summary>
              <div className="addon-grid">
                {plan.topics
                  .slice()
                  .sort((a, b) => weight(b) - weight(a))
                  .map((topic) => (
                    <div className="addon-preview" key={topic.id}>
                      <strong>{topic.name}</strong>
                      <p>
                        {t("Confidence")}: {topic.confidence}/5
                      </p>
                      <progress value={topic.confidence} max="5" />
                    </div>
                  ))}
              </div>
            </details>
            <details className="addon-section">
              <summary>{t("Exam-day checklist")}</summary>
              <div className="check-grid">
                {checklist.map((label) => (
                  <label className="check-label" key={label}>
                    <input
                      type="checkbox"
                      checked={plan.checklist.includes(label)}
                      onChange={(e) =>
                        void save("examPlans", {
                          ...plan,
                          checklist: e.target.checked
                            ? [...plan.checklist, label]
                            : plan.checklist.filter((item) => item !== label),
                        })
                      }
                    />
                    {t(label)}
                  </label>
                ))}
              </div>
            </details>
            <details className="addon-section">
              <summary>{t("Exam formula sheet")}</summary>
              {active(state.formulas)
                .filter(
                  (item) => item.courseId === plan.courseId && item.examExtra,
                )
                .map((item) => (
                  <div key={item.id} className="data-row">
                    <strong className="grow">{item.name}</strong>
                    <code dir="ltr">{item.latex}</code>
                  </div>
                ))}
              <Button
                onClick={() =>
                  go("/formulas?course=" + plan.courseId + "&exam=1")
                }
              >
                {t("Open formula sheet")}
              </Button>
            </details>
            {rows.map((item) => (
              <div className="data-row addon-wrap" key={item.id}>
                <span className="addon-time">{item.date}</span>
                <span className="grow">
                  <strong>
                    {
                      plan.topics.find((topic) => topic.id === item.topicId)
                        ?.name
                    }
                  </strong>
                  <small>
                    {t(item.kind)} · {item.minutes} {t("min")} ·{" "}
                    {t(item.status)}
                  </small>
                </span>
                {item.status === "done" ? (
                  <Check size={17} />
                ) : (
                  <Field label={t("Complete and rate confidence")}>
                    <select
                      value=""
                      onChange={(e) => {
                        if (e.target.value)
                          complete(
                            item,
                            +e.target.value as Topic["confidence"],
                          );
                      }}
                    >
                      <option value="">—</option>
                      {[1, 2, 3, 4, 5].map((value) => (
                        <option key={value}>{value}</option>
                      ))}
                    </select>
                  </Field>
                )}
              </div>
            ))}
          </Panel>
        );
      })}
      {options && (
        <Modal title={t("Exam preferences")} close={() => setOptions(false)}>
          <div className="form-grid">
            <Field label={t("Combined daily cap (hours)")}>
              <input
                type="number"
                min=".25"
                max="24"
                step=".25"
                defaultValue={state.settings.examPrep.maxHoursPerDay}
                onBlur={(e) => {
                  if (e.target.validity.valid)
                    void changeSettings({
                      examPrep: {
                        ...state.settings.examPrep,
                        maxHoursPerDay: +e.target.value,
                      },
                    });
                }}
              />
            </Field>
            <Field label={t("Reminder time")}>
              <input
                type="time"
                value={state.settings.examPrep.remindAt}
                onChange={(e) => {
                  if (e.target.value)
                    void changeSettings({
                      examPrep: {
                        ...state.settings.examPrep,
                        remindAt: e.target.value,
                      },
                    });
                }}
              />
            </Field>
            <label className="check-label">
              <input
                type="checkbox"
                checked={state.settings.examPrep.reminders}
                onChange={(e) =>
                  void changeSettings({
                    examPrep: {
                      ...state.settings.examPrep,
                      reminders: e.target.checked,
                    },
                  })
                }
              />
              {t("Exam prep reminders")}
            </label>
            <label className="check-label">
              <input
                type="checkbox"
                checked={state.settings.examPrep.quietMock}
                onChange={(e) =>
                  void changeSettings({
                    examPrep: {
                      ...state.settings.examPrep,
                      quietMock: e.target.checked,
                    },
                  })
                }
              />
              {t("Mute desktop alerts in mock exams")}
            </label>
          </div>
        </Modal>
      )}
      {edit && <ExamEditor initial={edit} close={() => setEdit(undefined)} />}
      {score && <ExamScore plan={score} close={() => setScore(undefined)} />}
      {mock && (
        <Modal title={t("Mock exam")} close={leaveMock}>
          <p className="metric" role="timer">
            {Math.floor(Math.max(0, mock.end - +now) / 60000)}:
            {String(
              Math.floor(Math.max(0, mock.end - +now) / 1000) % 60,
            ).padStart(2, "0")}
          </p>
          <p>{t("When you finish, record your confidence for each topic.")}</p>
          {mock.plan.topics.map((topic) => (
            <div className="data-row" key={topic.id}>
              <strong className="grow">{topic.name}</strong>
              <Field label={t("Confidence")}>
                <select
                  value={topic.confidence}
                  onChange={(e) =>
                    setMock({
                      ...mock,
                      plan: {
                        ...mock.plan,
                        topics: mock.plan.topics.map((item) =>
                          item.id === topic.id
                            ? {
                                ...item,
                                confidence: +e.target
                                  .value as Topic["confidence"],
                              }
                            : item,
                        ),
                      },
                    })
                  }
                >
                  {[1, 2, 3, 4, 5].map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </Field>
            </div>
          ))}
          <Button
            variant="primary"
            onClick={async () => {
              if (
                !mock.recorded &&
                (await patch([
                  { collection: "examPlans", value: mock.plan },
                  ...mock.plan.topics.map((topic) => ({
                    collection: "studySessions" as const,
                    value: {
                      ...fresh(),
                      planId: mock.plan.id,
                      topicId: topic.id,
                      kind: "mock",
                      date: today,
                      minutes: mock.plan.settings.sessionMinutes,
                      status: "done",
                      confidenceAfter: topic.confidence,
                    },
                  })),
                ]))
              )
                leaveMock();
            }}
          >
            {t("Log mock exam")}
          </Button>
        </Modal>
      )}
    </>
  );
}

function ExamEditor({ initial, close }: { initial: Plan; close: () => void }) {
  const { t } = useTranslation(),
    state = useSabri((s) => s.data),
    [draft, setDraft] = useState(initial),
    [syllabus, setSyllabus] = useState("");
  const exists = state.examPlans.some((item) => item.id === initial.id);
  const editTopic = (id: string, fields: Partial<Topic>) =>
    setDraft({
      ...draft,
      topics: draft.topics.map((item) =>
        item.id === id ? { ...item, ...fields } : item,
      ),
    });
  const settings = (fields: Partial<Plan["settings"]>) =>
    setDraft({ ...draft, settings: { ...draft.settings, ...fields } });
  return (
    <Modal
      title={t(exists ? "Edit exam plan" : "New exam plan")}
      close={close}
      wide
    >
      <form
        className="form-grid"
        onSubmit={async (e) => {
          e.preventDefault();
          if (draft.topics.length && (await save("examPlans", draft))) close();
        }}
      >
        <Field label={t("Calendar exam")}>
          <select
            required
            value={draft.eventId}
            onChange={(e) => {
              const event = state.calendar.find(
                (item) => item.id === e.target.value,
              );
              setDraft({
                ...draft,
                eventId: e.target.value,
                courseId: event?.courseId ?? draft.courseId,
              });
            }}
          >
            <option value="">—</option>
            {active(state.calendar)
              .filter((item) => item.type === "exam")
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title} · {item.date}
                </option>
              ))}
          </select>
        </Field>
        <Field label={t("Course")}>
          <select
            required
            value={draft.courseId}
            onChange={(e) => setDraft({ ...draft, courseId: e.target.value })}
          >
            <option value="">—</option>
            {active(state.courses).map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("Paste syllabus")} wide>
          <textarea
            value={syllabus}
            onChange={(e) => setSyllabus(e.target.value)}
            placeholder={t("One topic per line")}
          />
        </Field>
        <div className="wide addon-controls">
          <Button
            onClick={() => {
              setDraft({
                ...draft,
                topics: [
                  ...draft.topics,
                  ...syllabus
                    .split(/\r?\n/)
                    .map((line) => line.trim().slice(0, 200))
                    .filter(Boolean)
                    .map(newTopic),
                ].slice(0, 300),
              });
              setSyllabus("");
            }}
            disabled={!syllabus.trim()}
          >
            {t("Add topics")}
          </Button>
          <Button
            icon={Plus}
            onClick={() =>
              setDraft({ ...draft, topics: [...draft.topics, newTopic("")] })
            }
          >
            {t("Add topic")}
          </Button>
        </div>
        <div className="wide">
          {draft.topics.map((item) => (
            <div className="addon-controls addon-section" key={item.id}>
              <Field label={t("Topic")}>
                <input
                  required
                  maxLength={200}
                  value={item.name}
                  onChange={(e) => editTopic(item.id, { name: e.target.value })}
                />
              </Field>
              <Field label={t("Difficulty")}>
                <input
                  type="number"
                  min="1"
                  max="5"
                  value={item.difficulty}
                  onChange={(e) =>
                    editTopic(item.id, {
                      difficulty: +e.target.value as Topic["difficulty"],
                      estimatedHours:
                        suggestedMinutes(+e.target.value, item.confidence) / 60,
                    })
                  }
                />
              </Field>
              <Field label={t("Confidence")}>
                <input
                  type="number"
                  min="1"
                  max="5"
                  value={item.confidence}
                  onChange={(e) =>
                    editTopic(item.id, {
                      confidence: +e.target.value as Topic["confidence"],
                      estimatedHours:
                        suggestedMinutes(item.difficulty, +e.target.value) / 60,
                    })
                  }
                />
              </Field>
              <Field label={t("Estimated hours")}>
                <input
                  type="number"
                  min=".25"
                  step=".25"
                  value={item.estimatedHours}
                  onChange={(e) =>
                    editTopic(item.id, { estimatedHours: +e.target.value })
                  }
                />
              </Field>
              <Field label={t("Resource link")}>
                <input
                  type="url"
                  value={
                    item.resources.find((value) => value.type === "link")
                      ?.url ?? ""
                  }
                  onChange={(e) =>
                    editTopic(item.id, {
                      resources: e.target.value
                        ? [{ type: "link", url: e.target.value }]
                        : [],
                    })
                  }
                />
              </Field>
              <Button
                onClick={() =>
                  setDraft({
                    ...draft,
                    topics: draft.topics.filter(
                      (value) => value.id !== item.id,
                    ),
                  })
                }
              >
                {t("Delete")}
              </Button>
            </div>
          ))}
        </div>
        <Field label={t("Session minutes")}>
          <input
            type="number"
            min="5"
            max="180"
            value={draft.settings.sessionMinutes}
            onChange={(e) => settings({ sessionMinutes: +e.target.value })}
          />
        </Field>
        <Field label={t("Daily cap (hours)")}>
          <input
            type="number"
            min=".25"
            max="24"
            step=".25"
            value={draft.settings.maxHoursPerDay}
            onChange={(e) => settings({ maxHoursPerDay: +e.target.value })}
          />
        </Field>
        <Field label={t("Practice share (%)")}>
          <input
            type="number"
            min="0"
            max="100"
            value={Math.round(draft.settings.practiceShare * 100)}
            onChange={(e) => settings({ practiceShare: +e.target.value / 100 })}
          />
        </Field>
        <Field label={t("Review spacing (days)")}>
          <input
            defaultValue={draft.settings.reviewSpacingDays.join(", ")}
            onBlur={(e) =>
              settings({
                reviewSpacingDays: [
                  ...new Set(
                    e.target.value
                      .split(",")
                      .map(Number)
                      .filter((value) => value > 0),
                  ),
                ],
              })
            }
          />
        </Field>
        <Field label={t("Blocked dates")}>
          <input
            defaultValue={draft.settings.blockedDates?.join(", ") ?? ""}
            placeholder="YYYY-MM-DD"
            onBlur={(e) =>
              settings({
                blockedDates: e.target.value
                  .split(",")
                  .map((item) => item.trim())
                  .filter(Boolean),
              })
            }
          />
        </Field>
        <label className="check-label">
          <input
            type="checkbox"
            checked={draft.settings.restDayBefore}
            onChange={(e) => settings({ restDayBefore: e.target.checked })}
          />
          {t("Rest the day before")}
        </label>
        <div className="wide addon-grid">
          {Array.from({ length: 7 }, (_, i) => (
            <Field
              key={i}
              label={new Intl.DateTimeFormat(state.settings.language, {
                weekday: "short",
                timeZone: "UTC",
              }).format(new Date(Date.UTC(2026, 10, 15 + i)))}
            >
              <input
                type="number"
                min="0"
                max="24"
                step=".25"
                value={
                  draft.settings.availableHoursByWeekday?.[i] ??
                  draft.settings.maxHoursPerDay
                }
                onChange={(e) =>
                  settings({
                    availableHoursByWeekday: Array.from(
                      { length: 7 },
                      (_, index) =>
                        index === i
                          ? +e.target.value
                          : (draft.settings.availableHoursByWeekday?.[index] ??
                            draft.settings.maxHoursPerDay),
                    ),
                  })
                }
              />
            </Field>
          ))}
        </div>
        <FormActions close={close} />
      </form>
      {exists && (
        <div className="modal-secondary">
          <Button
            variant="danger"
            onClick={() => {
              void remove("examPlans", initial);
              close();
            }}
          >
            {t("Delete")}
          </Button>
        </div>
      )}
    </Modal>
  );
}

function ExamScore({ plan, close }: { plan: Plan; close: () => void }) {
  const { t } = useTranslation(),
    state = useSabri((s) => s.data),
    course = state.courses.find(
      (item) => item.id === plan.courseId && !item.deletedAt,
    );
  const [score, setScore] = useState(plan.result?.score ?? 0),
    [max, setMax] = useState(plan.result?.max ?? 100),
    [memo, setMemo] = useState(plan.result?.memo ?? "");
  const [componentChoice, setComponent] = useState(
      plan.result?.componentId ?? "",
    ),
    [weight, setWeight] = useState(20);
  return (
    <Modal title={t("Log exam score")} close={close}>
      <form
        className="form-grid"
        onSubmit={async (e) => {
          e.preventDefault();
          if (score > max) return;
          const component = course?.gradeComponents.find(
            (item) => item.id === componentChoice,
          );
          const componentId = component?.id ?? crypto.randomUUID();
          const changes = [
            {
              collection: "examPlans",
              value: { ...plan, result: { score, max, memo, componentId } },
            },
          ] as Parameters<typeof patch>[0];
          if (course)
            changes.push({
              collection: "courses",
              value: {
                ...course,
                gradeComponents: [
                  ...course.gradeComponents.filter(
                    (item) => item.id !== componentId,
                  ),
                  {
                    id: componentId,
                    name:
                      state.calendar.find((item) => item.id === plan.eventId)
                        ?.title ?? t("Exam"),
                    weight: component?.weight ?? weight,
                    earnedScore: score,
                    maxScore: max,
                  },
                ],
              },
            });
          if (await patch(changes)) {
            tell(t("Saved"));
            close();
          }
        }}
      >
        <Field label={t("Score")}>
          <input
            type="number"
            min="0"
            max={max}
            value={score}
            onChange={(e) => setScore(+e.target.value)}
          />
        </Field>
        <Field label={t("Maximum score")}>
          <input
            type="number"
            min="1"
            value={max}
            onChange={(e) => setMax(+e.target.value)}
          />
        </Field>
        <Field wide label={t("Course grade component")}>
          <select
            value={componentChoice}
            onChange={(e) => setComponent(e.target.value)}
          >
            <option value="">{t("Create an exam component")}</option>
            {course?.gradeComponents.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </Field>
        {!componentChoice && (
          <Field label={t("Weight (%)")}>
            <input
              type="number"
              min="0"
              max="100"
              value={weight}
              onChange={(e) => setWeight(+e.target.value)}
            />
          </Field>
        )}
        <Field label={t("What worked or should change?")} wide>
          <textarea
            value={memo}
            maxLength={8000}
            onChange={(e) => setMemo(e.target.value)}
          />
        </Field>
        <FormActions close={close} />
      </form>
    </Modal>
  );
}
