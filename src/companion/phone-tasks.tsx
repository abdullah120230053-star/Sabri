import { useState } from "react";
import { Check, ClipboardList } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { PhoneOperation, PhoneSnapshot } from "../shared/phone";
import { Button, Panel, Segments, titleCase } from "../renderer/ui";

type Task = PhoneSnapshot["tasks"][number];
type Pending = { id: string; status: "todo"; title: string };
export function PhoneTasks({
  data,
  operations,
  editing,
  compact = false,
  add,
  complete,
}: {
  data: PhoneSnapshot;
  operations: PhoneOperation[];
  editing: boolean;
  compact?: boolean;
  add(title: string): void;
  complete(id: string, done: boolean): void;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(""),
    [filter, setFilter] = useState<"today" | "all" | "upcoming">(
      compact ? "today" : "all",
    );
  const pending: Pending[] = operations.flatMap((op) =>
    op.type === "task-add" &&
    !data.tasks.some((item) => item.id === op.operationId)
      ? [{ id: op.operationId, title: op.title, status: "todo" }]
      : [],
  );
  const shown =
    filter === "today"
      ? data.tasks.filter((task) => !task.dueDate || task.dueDate <= data.today)
      : filter === "upcoming"
        ? data.tasks.filter((task) => task.dueDate && task.dueDate > data.today)
        : data.tasks;
  const tasks: (Task | Pending)[] =
    filter === "upcoming" ? shown : [...shown, ...pending];
  return (
    <Panel
      title={t(compact ? "Today’s tasks" : "Tasks")}
      icon={ClipboardList}
      tone="orange"
    >
      {!compact && (
        <Segments<typeof filter>
          label={t("Tasks")}
          value={filter}
          onChange={setFilter}
          options={[
            { value: "today", label: t("Today") },
            { value: "all", label: t("All tasks") },
            { value: "upcoming", label: t("Upcoming") },
          ]}
        />
      )}
      {tasks.length ? (
        tasks.map((item) => {
          const next = operations.findLast(
            (op) => op.type === "task-status" && op.id === item.id,
          );
          const checked =
            next?.type === "task-status" ? next.done : item.status === "done";
          const date =
            "dueDate" in item
              ? [
                  item.dueDate === data.today ? t("Today") : item.dueDate,
                  item.dueTime,
                ]
                  .filter(Boolean)
                  .join(" · ")
              : "";
          return (
            <div className="task-row" key={item.id}>
              <button
                className="check-circle"
                aria-label={item.title}
                aria-pressed={checked}
                disabled={!editing}
                onClick={() => complete(item.id, !checked)}
              >
                {checked && <Check size={13} />}
              </button>
              <div className="grow">
                <strong>{item.title}</strong>
                {"course" in item && (
                  <small className="phone-task-meta">
                    {[date, item.course, item.category]
                      .filter(Boolean)
                      .join(" · ")}
                  </small>
                )}
              </div>
              {"priority" in item && (
                <span className={"pill priority-" + item.priority}>
                  {t(titleCase(item.priority))}
                </span>
              )}
            </div>
          );
        })
      ) : (
        <p className="muted">
          {t(compact ? "No tasks today" : "No tasks to show")}
        </p>
      )}
      {editing && filter !== "upcoming" && (
        <form
          className="quick-add"
          onSubmit={(event) => {
            event.preventDefault();
            if (title.trim()) {
              add(title.trim());
              setTitle("");
            }
          }}
        >
          <input
            required
            maxLength={200}
            aria-label={t("Add a task")}
            placeholder={t("Add a task")}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
          <Button type="submit">{t("Add")}</Button>
        </form>
      )}
    </Panel>
  );
}
