import { useState } from "react";
import { ClipboardCheck, FileText, Link, Plus, Timer } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { active, type RecordFor } from "../shared/schema";
import {
  assignmentReminders,
  type LmsConnect,
  type LmsPreview,
} from "../shared/logic/lms-mapping";
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

type Assignment = RecordFor<"assignments">;
type Template = RecordFor<"checklistTemplates">;
const statusLabels = {
  not_started: "Not started",
  in_progress: "In progress",
  ready: "Ready to submit",
  submitted: "Submitted",
  graded: "Graded",
} as const;
const statuses = Object.keys(statusLabels) as Assignment["status"][];
const kinds = [
  "lab",
  "homework",
  "report",
  "project",
  "quiz",
  "other",
] as const;
const deadline = (date: string | undefined, now: Date) => {
  if (!date) return { value: 0, unit: "No deadline" };
  const left = +new Date(date) - +now;
  const amount = Math.abs(left);
  if (left < 0) return { value: 0, unit: "Overdue" };
  return amount >= 86400000
    ? { value: Math.floor(left / 86400000), unit: "days left" }
    : amount >= 3600000
      ? { value: Math.floor(left / 3600000), unit: "hours left" }
      : { value: Math.ceil(left / 60000), unit: "minutes left" };
};
const editable = (value: Assignment, next: Assignment["status"]) => {
  if (!["submitted", "graded"].includes(next))
    return {
      ...value,
      status: next,
      submittedSource: "user" as const,
      submittedAt: undefined,
    };
  return {
    ...value,
    status: next,
    submittedSource: "user" as const,
    submittedAt: value.submittedAt ?? new Date().toISOString(),
  };
};
const examples: Record<string, string[]> = {
  "Lab report": [
    "Pre-lab questions",
    "Code or simulation",
    "Results and screenshots",
    "Label figures and tables",
    "Discussion",
    "References",
    "Cover page",
    "Export PDF",
    "Submit",
  ],
  Homework: ["Solve", "Review", "Scan or export", "Submit"],
};

export function AssignmentsWidget() {
  const { t } = useTranslation(),
    go = useNavigate(),
    state = useSabri((s) => s.data),
    now = useNow(60000);
  const rows = active(state.assignments)
    .filter(
      (item) =>
        item.dueAt &&
        !item.upstream?.removed &&
        !["submitted", "graded"].includes(item.status),
    )
    .sort((a, b) => a.dueAt!.localeCompare(b.dueAt!));
  return (
    <Panel
      title={t("Assignments due")}
      icon={ClipboardCheck}
      action={<Button onClick={() => go("/assignments")}>{t("Open")}</Button>}
    >
      {rows.slice(0, 4).map((item) => {
        const due = deadline(item.dueAt, now);
        return (
          <div className="data-row" key={item.id}>
            <strong className="grow">{item.title}</strong>
            <span className={due.unit === "Overdue" ? "error" : "muted"}>
              {due.value || ""} {t(due.unit)}
            </span>
          </div>
        );
      })}
      {!rows.length && <p className="muted">{t("No assignments due")}</p>}
    </Panel>
  );
}

export function AssignmentsPage() {
  const { t } = useTranslation(),
    go = useNavigate(),
    state = useSabri((s) => s.data),
    now = useNow(60000);
  const [edit, setEdit] = useState<Assignment>(),
    [template, setTemplate] = useState<Template>(),
    [mode, setMode] = useState("board"),
    [course, setCourse] = useState(""),
    [sync, setSync] = useState(false);
  const courses = active(state.courses);
  const rows = active(state.assignments)
    .filter((item) => !course || item.courseId === course)
    .sort((a, b) => (a.dueAt ?? "9999").localeCompare(b.dueAt ?? "9999"));
  const newItem = () =>
    setEdit({
      ...fresh(),
      title: "",
      courseId: course || courses[0]?.id || "",
      kind: "homework",
      status: "not_started",
      source: "manual",
      checklist: [],
      attachments: [],
      timeSpentMinutes: 0,
      reminderMinutes: assignmentReminders.slice(),
    });
  const start = async (item: Assignment) => {
    if (current().timer.status === "idle") {
      const timer = useSabri.getState().timer;
      await timer({ type: "select", phase: "focus" });
      await timer({
        type: "link",
        courseId: item.courseId,
        assignmentId: item.id,
      });
      await timer({ type: "toggle" });
    }
    go("/focus");
  };
  const card = (item: Assignment) => {
    const due = deadline(item.dueAt, now);
    return (
      <div className="data-row addon-wrap" key={item.id}>
        <span className="grow">
          <strong>{item.title}</strong>
          <small>
            {courses.find((course) => course.id === item.courseId)?.name} ·{" "}
            {due.value || ""} {t(due.unit)}
          </small>
          {item.upstream?.changed && (
            <small className="warning">
              {t("Deadline changed")}
              {item.upstream.previousDueAt
                ? " · " +
                  formatInTimeZone(
                    item.upstream.previousDueAt,
                    state.settings.location.timezone,
                    "yyyy-MM-dd HH:mm",
                  )
                : ""}
            </small>
          )}
          {item.upstream?.removed && <small>{t("Removed from LMS")}</small>}
          {item.submittedSource === "lms" && (
            <small>{t("Submitted (synced)")}</small>
          )}
        </span>
        <Button icon={Timer} onClick={() => void start(item)}>
          {t("Focus")}
        </Button>
        <Button onClick={() => setEdit(item)}>{t("Edit")}</Button>
      </div>
    );
  };
  return (
    <>
      <PageHead
        title={t("Assignments")}
        description={t(
          "Track lab reports, deadlines, submissions, and grades.",
        )}
        action={
          <>
            <Button icon={Link} onClick={() => setSync(true)}>
              {t("LMS connections")}
            </Button>
            <Button variant="primary" icon={Plus} onClick={newItem}>
              {t("New assignment")}
            </Button>
          </>
        }
      />
      <div className="toolbar">
        <div className="addon-controls">
          <Field label={t("View")}>
            <select value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="board">{t("Board")}</option>
              <option value="list">{t("By deadline")}</option>
              <option value="courses">{t("By course")}</option>
            </select>
          </Field>
          <Field label={t("Course")}>
            <select value={course} onChange={(e) => setCourse(e.target.value)}>
              <option value="">{t("All courses")}</option>
              {courses.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </div>
      {!rows.length ? (
        <Panel title={t("Assignments")} icon={ClipboardCheck}>
          <Empty icon={ClipboardCheck} title={t("No assignments yet")} />
        </Panel>
      ) : mode === "board" ? (
        <div className="addon-board">
          {statuses.map((status) => (
            <Panel key={status} title={t(statusLabels[status])}>
              {rows.filter((item) => item.status === status).map(card)}
            </Panel>
          ))}
        </div>
      ) : mode === "courses" ? (
        courses
          .filter((item) => !course || item.id === course)
          .map((item) => (
            <Panel key={item.id} title={item.name}>
              {rows.filter((row) => row.courseId === item.id).map(card)}
            </Panel>
          ))
      ) : (
        <Panel title={t("By deadline")} icon={FileText}>
          {rows.map(card)}
        </Panel>
      )}
      <Panel
        title={t("Checklist templates")}
        icon={ClipboardCheck}
        action={
          <Button
            icon={Plus}
            onClick={() =>
              setTemplate({
                ...fresh(),
                name: "",
                kind: "homework",
                items: [""],
              })
            }
          >
            {t("New template")}
          </Button>
        }
      >
        {active(state.checklistTemplates).map((item) => (
          <div className="data-row" key={item.id}>
            <strong className="grow">{item.name}</strong>
            <Button onClick={() => setTemplate(item)}>{t("Edit")}</Button>
          </div>
        ))}
        {!active(state.checklistTemplates).length && (
          <p className="muted">
            {t(
              "Lab report and Homework starter templates are available in assignment settings.",
            )}
          </p>
        )}
      </Panel>
      {edit && (
        <AssignmentEditor initial={edit} close={() => setEdit(undefined)} />
      )}
      {template && (
        <TemplateEditor
          initial={template}
          close={() => setTemplate(undefined)}
        />
      )}
      {sync && <LmsDialog close={() => setSync(false)} />}
    </>
  );
}

function AssignmentEditor({
  initial,
  close,
}: {
  initial: Assignment;
  close: () => void;
}) {
  const { t } = useTranslation(),
    state = useSabri((s) => s.data),
    [draft, setDraft] = useState(initial);
  const zone = state.settings.location.timezone,
    course = active(state.courses).find((item) => item.id === draft.courseId);
  const [due, setDue] = useState(
    initial.dueAt
      ? formatInTimeZone(initial.dueAt, zone, "yyyy-MM-dd'T'HH:mm")
      : "",
  );
  const [reminders, setReminders] = useState(
    initial.reminderMinutes.join(", "),
  );
  const [manual, setManual] = useState(""),
    [mode, setMode] = useState<"copied" | "linked">("copied");
  const change = (value: Partial<Assignment>) =>
    setDraft({ ...draft, ...value });
  const persisted = state.assignments.some((item) => item.id === initial.id);
  const addFile = async () => {
    try {
      const file = await window.sabri.addAttachment({
        id: draft.id,
        domain: "assignment",
        mode,
      });
      if (file)
        setDraft((value) => ({
          ...value,
          attachments: [...value.attachments, file],
        }));
    } catch {
      tell(t("Could not attach the file"));
    }
  };
  return (
    <Modal
      title={t(persisted ? "Edit assignment" : "New assignment")}
      close={close}
      wide
    >
      <form
        className="form-grid"
        onSubmit={async (e) => {
          e.preventDefault();
          const next = {
            ...draft,
            dueAt: due ? fromZonedTime(due, zone).toISOString() : undefined,
            reminderMinutes: reminders
              .split(",")
              .map((item) => item.trim())
              .filter(Boolean)
              .map(Number),
          };
          const changes: Parameters<typeof patch>[0] = [
            { collection: "assignments", value: next },
          ];
          if (course && next.gradeComponentId && next.score !== undefined) {
            changes.push({
              collection: "courses",
              value: {
                ...course,
                gradeComponents: course.gradeComponents.map((item) =>
                  item.id === next.gradeComponentId
                    ? {
                        ...item,
                        earnedScore: next.score,
                        maxScore: next.maxScore ?? item.maxScore,
                      }
                    : item,
                ),
              },
            });
          }
          if (await patch(changes)) close();
        }}
      >
        <Field label={t("Title")} wide>
          <input
            autoFocus
            required
            maxLength={200}
            value={draft.title}
            onChange={(e) => change({ title: e.target.value })}
          />
        </Field>
        <Field label={t("Course")}>
          <select
            required
            value={draft.courseId}
            onChange={(e) =>
              change({ courseId: e.target.value, gradeComponentId: undefined })
            }
          >
            <option value="">—</option>
            {active(state.courses).map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("Type")}>
          <select
            value={draft.kind}
            onChange={(e) =>
              change({ kind: e.target.value as Assignment["kind"] })
            }
          >
            {kinds.map((item) => (
              <option key={item} value={item}>
                {t(item)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("Status")}>
          <select
            value={draft.status}
            onChange={(e) =>
              setDraft(editable(draft, e.target.value as Assignment["status"]))
            }
          >
            {statuses.map((item) => (
              <option value={item} key={item}>
                {t(statusLabels[item])}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("Deadline")}>
          <input
            type="datetime-local"
            value={due}
            onChange={(e) => setDue(e.target.value)}
          />
        </Field>
        <Field label={t("Estimated minutes")}>
          <input
            type="number"
            min="0"
            value={draft.estimatedMinutes ?? ""}
            onChange={(e) =>
              change({
                estimatedMinutes: e.target.value ? +e.target.value : undefined,
              })
            }
          />
        </Field>
        <Field label={t("Reminder lead times (minutes)")}>
          <input
            value={reminders}
            onChange={(e) => setReminders(e.target.value)}
          />
        </Field>
        <p className="muted">
          {t("Time spent")}: {draft.timeSpentMinutes} {t("min")}
        </p>
        <div className="wide addon-section">
          <h3>{t("Submission checklist")}</h3>
          <Field label={t("Apply a template")}>
            <select
              value=""
              onChange={(e) => {
                const list =
                  examples[e.target.value] ??
                  state.checklistTemplates.find(
                    (item) => item.id === e.target.value,
                  )?.items ??
                  [];
                change({
                  checklist: [
                    ...draft.checklist,
                    ...list.map((label) => ({
                      id: crypto.randomUUID(),
                      label: t(label),
                      done: false,
                    })),
                  ].slice(0, 100),
                });
              }}
            >
              <option value="">—</option>
              {Object.keys(examples).map((item) => (
                <option value={item} key={item}>
                  {t(item)}
                </option>
              ))}
              {active(state.checklistTemplates).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </Field>
          {draft.checklist.map((item) => (
            <div className="data-row" key={item.id}>
              <label className="check-label grow">
                <input
                  type="checkbox"
                  checked={item.done}
                  onChange={(e) =>
                    change({
                      checklist: draft.checklist.map((value) =>
                        value.id === item.id
                          ? { ...value, done: e.target.checked }
                          : value,
                      ),
                    })
                  }
                />
                {item.label}
              </label>
              <Button
                onClick={() =>
                  change({
                    checklist: draft.checklist.filter(
                      (value) => value.id !== item.id,
                    ),
                  })
                }
              >
                {t("Delete")}
              </Button>
            </div>
          ))}
          <div className="addon-controls">
            <Field label={t("Checklist item")}>
              <input
                maxLength={200}
                value={manual}
                onChange={(e) => setManual(e.target.value)}
              />
            </Field>
            <Button
              disabled={!manual.trim() || draft.checklist.length >= 100}
              onClick={() => {
                change({
                  checklist: [
                    ...draft.checklist,
                    {
                      id: crypto.randomUUID(),
                      label: manual.trim(),
                      done: false,
                    },
                  ],
                });
                setManual("");
              }}
            >
              {t("Add")}
            </Button>
          </div>
        </div>
        <div className="wide addon-section">
          <h3>{t("Attachments")}</h3>
          <div className="addon-controls">
            <Field label={t("Attachment mode")}>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as typeof mode)}
              >
                <option value="copied">{t("Copy into Sabri")}</option>
                <option value="linked">{t("Link external file")}</option>
              </select>
            </Field>
            <Button
              onClick={() => void addFile()}
              disabled={draft.attachments.length >= 100}
            >
              {t("Add attachment")}
            </Button>
            <Button
              disabled={!persisted}
              onClick={() =>
                void window.sabri
                  .openAttachment({
                    id: draft.id,
                    domain: "assignment",
                    folder: true,
                  })
                  .catch(() => tell(t("Could not open the folder")))
              }
            >
              {t("Open folder")}
            </Button>
          </div>
          {draft.attachments.map((item) => (
            <div className="data-row" key={item.id}>
              <span className="grow">{item.name}</span>
              <Button
                disabled={
                  !initial.attachments.some((file) => file.id === item.id)
                }
                onClick={() =>
                  void window.sabri
                    .openAttachment({
                      id: draft.id,
                      domain: "assignment",
                      file: item.id,
                    })
                    .catch(() => tell(t("Could not open the file")))
                }
              >
                {t("Open")}
              </Button>
              <Button
                onClick={() =>
                  change({
                    attachments: draft.attachments.filter(
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
        <Field label={t("Score")}>
          <input
            type="number"
            min="0"
            max={draft.maxScore}
            value={draft.score ?? ""}
            onChange={(e) =>
              change({ score: e.target.value ? +e.target.value : undefined })
            }
          />
        </Field>
        <Field label={t("Maximum score")}>
          <input
            type="number"
            min="1"
            value={draft.maxScore ?? ""}
            onChange={(e) =>
              change({ maxScore: e.target.value ? +e.target.value : undefined })
            }
          />
        </Field>
        <Field label={t("Course grade component")} wide>
          <select
            value={draft.gradeComponentId ?? ""}
            onChange={(e) =>
              change({ gradeComponentId: e.target.value || undefined })
            }
          >
            <option value="">—</option>
            {course?.gradeComponents.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("Feedback")} wide>
          <textarea
            maxLength={8000}
            value={draft.feedback ?? ""}
            onChange={(e) => change({ feedback: e.target.value })}
          />
        </Field>
        <FormActions close={close} />
      </form>
      {persisted && (
        <div className="modal-secondary">
          <Button
            variant="danger"
            onClick={() => {
              void remove("assignments", initial);
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

function TemplateEditor({
  initial,
  close,
}: {
  initial: Template;
  close: () => void;
}) {
  const { t } = useTranslation(),
    [value, setValue] = useState(initial),
    [items, setItems] = useState(initial.items.join("\n"));
  return (
    <Modal title={t("Checklist template")} close={close}>
      <form
        className="form-grid"
        onSubmit={async (e) => {
          e.preventDefault();
          if (
            await save("checklistTemplates", {
              ...value,
              items: items
                .split(/\r?\n/)
                .map((row) => row.trim())
                .filter(Boolean),
            })
          )
            close();
        }}
      >
        <Field label={t("Name")} wide>
          <input
            required
            maxLength={200}
            value={value.name}
            onChange={(e) => setValue({ ...value, name: e.target.value })}
          />
        </Field>
        <Field label={t("Type")}>
          <select
            value={value.kind}
            onChange={(e) =>
              setValue({ ...value, kind: e.target.value as Template["kind"] })
            }
          >
            {kinds.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </Field>
        <Field label={t("Checklist items, one per line")} wide>
          <textarea
            rows={6}
            required
            value={items}
            onChange={(e) => setItems(e.target.value)}
          />
        </Field>
        <FormActions close={close} />
      </form>
      {initial.name && (
        <div className="modal-secondary">
          <Button
            variant="danger"
            onClick={() => {
              void remove("checklistTemplates", initial);
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

function LmsDialog({ close }: { close: () => void }) {
  const { t } = useTranslation(),
    data = useSabri((s) => s.data),
    [type, setType] = useState<LmsConnect["type"]>("moodle_ics");
  const [label, setLabel] = useState(""),
    [url, setUrl] = useState(""),
    [token, setToken] = useState(""),
    [client, setClient] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [preview, setPreview] = useState<LmsPreview>(),
    [map, setMap] = useState<Record<string, string>>({});
  const [enabled, setEnabled] = useState(true);
  const read = async (fn: () => Promise<LmsPreview | null>) => {
    setBusy(true);
    setError("");
    try {
      const result = await fn();
      if (!result) return;
      setPreview(result);
      const connection = current().lmsConnections.find(
        (item) => item.id === result.connectionId,
      );
      setMap(
        Object.fromEntries(
          connection?.courseMap.map((item) => [
            item.remoteId,
            item.courseId ?? "",
          ]) ?? [],
        ),
      );
      setUrl("");
      setToken("");
    } catch {
      setError(
        t("The LMS connection failed. Check access or use an ICS file."),
      );
    } finally {
      setBusy(false);
    }
  };
  const connect = () =>
    read(() =>
      window.sabri.connectLms(
        type === "moodle_ics"
          ? { type, label, url }
          : type === "moodle_ws"
            ? { type, label, url, token }
            : { type, label, clientId: client, clientSecret: token },
      ),
    );
  return (
    <Modal title={t("LMS connections")} close={close} wide>
      <p className="muted">
        {t(
          "Read-only import. Choose which Sabri course receives each source course.",
        )}
      </p>
      {active(data.lmsConnections).map((item) => (
        <div key={item.id} className="data-row addon-wrap">
          <span className="grow">
            <strong>{item.label}</strong>
            <small>
              {item.lastSyncAt ?? t("Never synced")} ·{" "}
              {item.enabled
                ? t(item.paused ? "Paused" : "Enabled")
                : t("Disconnected")}
            </small>
            {item.lastError && (
              <small className="error">{t(item.lastError)}</small>
            )}
          </span>
          {item.enabled && !item.fileOnly && (
            <Button
              disabled={busy}
              onClick={() =>
                void save("lmsConnections", { ...item, paused: !item.paused })
              }
            >
              {t(
                item.paused
                  ? "Resume automatic refresh"
                  : "Pause automatic refresh",
              )}
            </Button>
          )}
          {item.enabled && !item.fileOnly && (
            <Button
              disabled={busy}
              onClick={() => void read(() => window.sabri.syncLms(item.id))}
            >
              {t("Refresh")}
            </Button>
          )}
          {item.enabled && (
            <Button
              disabled={busy}
              onClick={() =>
                void window.sabri
                  .disconnectLms(item.id)
                  .then(() => {
                    if (preview?.connectionId === item.id)
                      setPreview(undefined);
                  })
                  .catch(() => setError(t("Could not disconnect this source.")))
              }
            >
              {t("Disconnect")}
            </Button>
          )}
        </div>
      ))}
      {preview ? (
        <div className="addon-section">
          <h3>{t("Map courses")}</h3>
          <p>
            {preview.items} {t("items found")}
          </p>
          {preview.courses.map((item) => (
            <Field key={item.id} label={item.name}>
              <select
                value={map[item.id] ?? ""}
                onChange={(e) => setMap({ ...map, [item.id]: e.target.value })}
              >
                <option value="">{t("Skip this course")}</option>
                {active(data.courses).map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.name}
                  </option>
                ))}
              </select>
            </Field>
          ))}
          <div className="form-actions">
            <Button onClick={() => setPreview(undefined)}>{t("Cancel")}</Button>
            <Button
              variant="primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const result = await window.sabri.applyLms({
                    id: preview.connectionId,
                    courseMap: preview.courses.map((item) => ({
                      remoteId: item.id,
                      remoteName: item.name,
                      courseId: map[item.id] || undefined,
                    })),
                  });
                  setPreview(undefined);
                  tell(
                    t("{{count}} assignments imported", {
                      count: result.created,
                    }),
                  );
                } catch {
                  setError(t("Could not apply the selected mappings."));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {t("Confirm mappings and sync")}
            </Button>
          </div>
        </div>
      ) : (
        <form
          className="form-grid addon-section"
          onSubmit={(e) => {
            e.preventDefault();
            void connect();
          }}
        >
          <Field label={t("Connection name")}>
            <input
              required
              maxLength={200}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </Field>
          <Field label={t("Source")}>
            <select
              value={type}
              onChange={(e) => {
                setType(e.target.value as typeof type);
                setToken("");
                setUrl("");
              }}
            >
              <option value="moodle_ics">{t("Moodle ICS")}</option>
              <option value="moodle_ws">{t("Moodle Web Services")}</option>
              <option value="google_classroom">{t("Google Classroom")}</option>
            </select>
          </Field>
          {type !== "google_classroom" && (
            <Field
              label={t(
                type === "moodle_ics"
                  ? "Private calendar link"
                  : "Moodle site address",
              )}
              wide
            >
              <input
                required
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </Field>
          )}
          {type === "google_classroom" && (
            <Field label={t("Desktop OAuth client ID")} wide>
              <input
                required
                value={client}
                onChange={(e) => setClient(e.target.value)}
              />
            </Field>
          )}
          {type !== "moodle_ics" && (
            <Field
              label={t(
                type === "moodle_ws"
                  ? "Read-only Moodle token"
                  : "Desktop OAuth client secret",
              )}
              wide
            >
              <input
                required
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
              />
            </Field>
          )}
          <div className="wide addon-controls">
            <Button variant="primary" type="submit" disabled={busy}>
              {t(busy ? "Connecting…" : "Connect")}
            </Button>
            <Button
              disabled={busy}
              onClick={() =>
                void read(() =>
                  window.sabri.importLmsCalendar(
                    label.trim() || t("Moodle calendar"),
                  ),
                )
              }
            >
              {t("Import ICS file")}
            </Button>
            <Button onClick={() => setEnabled(!enabled)}>
              {t("Sync preferences")}
            </Button>
          </div>
        </form>
      )}
      {enabled && (
        <div className="addon-controls">
          <Field label={t("Refresh interval (minutes, 0 for manual)")}>
            <input
              type="number"
              min="0"
              max="10080"
              key={data.settings.integrations.syncIntervalMin}
              defaultValue={data.settings.integrations.syncIntervalMin}
              onBlur={(e) =>
                void changeSettings({
                  integrations: {
                    ...current().settings.integrations,
                    syncIntervalMin: +e.target.value,
                  },
                })
              }
            />
          </Field>
          <label className="check-label">
            <input
              type="checkbox"
              checked={data.settings.integrations.changeAlerts}
              onChange={(e) =>
                void changeSettings({
                  integrations: {
                    ...current().settings.integrations,
                    changeAlerts: e.target.checked,
                  },
                })
              }
            />
            {t("Notify me when LMS assignments change")}
          </label>
        </div>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </Modal>
  );
}
