import { useState } from "react";
import { BookOpen, ExternalLink, ListChecks, Plus } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { active, type RecordFor } from "../shared/schema";
import { fresh, patch, remove, save, tell, useSabri } from "./store";
import {
  Button,
  Empty,
  Field,
  FormActions,
  Modal,
  PageHead,
  Panel,
} from "./ui";

type Resource = RecordFor<"courseResources">;
const labels = {
  link: "Resource links",
  reading: "Reading backlog",
  lab: "Lab kit checklist",
} as const;
export function ResourcesPage() {
  const { t } = useTranslation(),
    state = useSabri((s) => s.data),
    [params] = useSearchParams(),
    courses = active(state.courses);
  const [course, setCourse] = useState(
      params.get("course") ?? courses[0]?.id ?? "",
    ),
    [draft, setDraft] = useState<Resource>();
  const list = active(state.courseResources).filter(
    (item) => !course || item.courseId === course,
  );
  const add = (kind: Resource["kind"]) =>
    setDraft({
      ...fresh(),
      courseId: course,
      kind,
      name: "",
      complete: false,
      minutes: 20,
    });
  return (
    <>
      <PageHead
        title={t("Course resources")}
        description={t(
          "Keep lecture links, reading, and lab kit lists with each course.",
        )}
      />
      <div className="toolbar">
        <Field label={t("Course")}>
          <select value={course} onChange={(e) => setCourse(e.target.value)}>
            <option value="">{t("All courses")}</option>
            {courses.map((item) => (
              <option value={item.id} key={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {(Object.keys(labels) as Resource["kind"][]).map((kind) => (
        <Panel
          key={kind}
          title={t(labels[kind])}
          icon={kind === "lab" ? ListChecks : BookOpen}
          action={
            <>
              {kind === "lab" && (
                <Button
                  disabled={
                    !list.some((item) => item.kind === "lab" && item.complete)
                  }
                  onClick={() =>
                    void patch(
                      list
                        .filter((item) => item.kind === "lab" && item.complete)
                        .map((value) => ({
                          collection: "courseResources",
                          value: { ...value, complete: false },
                        })),
                    )
                  }
                >
                  {t("Reset checklist")}
                </Button>
              )}
              <Button icon={Plus} onClick={() => add(kind)}>
                {t("Add")}
              </Button>
            </>
          }
        >
          {list
            .filter((item) => item.kind === kind)
            .map((item) => (
              <div className="data-row" key={item.id}>
                {kind !== "link" && (
                  <input
                    aria-label={item.name}
                    type="checkbox"
                    checked={item.complete}
                    onChange={(e) =>
                      void save("courseResources", {
                        ...item,
                        complete: e.target.checked,
                      })
                    }
                  />
                )}
                <strong className="grow">{item.name}</strong>
                {item.url && (
                  <Button
                    icon={ExternalLink}
                    onClick={() =>
                      void window.sabri
                        .openResource(item.id)
                        .catch(() => tell(t("Could not open the link")))
                    }
                  >
                    {t("Open")}
                  </Button>
                )}
                <Button onClick={() => setDraft(item)}>{t("Edit")}</Button>
              </div>
            ))}
          {!list.some((item) => item.kind === kind) && (
            <Empty compact title={t("Nothing added yet")} icon={BookOpen} />
          )}
        </Panel>
      ))}
      {draft && (
        <Modal title={t(labels[draft.kind])} close={() => setDraft(undefined)}>
          <form
            className="form-grid"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await save("courseResources", draft)) setDraft(undefined);
            }}
          >
            <Field label={t("Name")} wide>
              <input
                required
                maxLength={200}
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </Field>
            <Field label={t("Course")}>
              <select
                required
                value={draft.courseId}
                onChange={(e) =>
                  setDraft({ ...draft, courseId: e.target.value })
                }
              >
                <option value="">—</option>
                {courses.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </Field>
            {draft.kind !== "lab" && (
              <Field label={t("Resource link")}>
                <input
                  type="url"
                  placeholder="https://"
                  required={draft.kind === "link"}
                  value={draft.url ?? ""}
                  onChange={(e) =>
                    setDraft({ ...draft, url: e.target.value || undefined })
                  }
                />
              </Field>
            )}
            {draft.kind === "reading" && (
              <Field label={t("Estimated minutes")}>
                <input
                  type="number"
                  min="5"
                  max="240"
                  value={draft.minutes}
                  onChange={(e) =>
                    setDraft({ ...draft, minutes: +e.target.value })
                  }
                />
              </Field>
            )}
            <FormActions close={() => setDraft(undefined)} />
          </form>
          {state.courseResources.some((item) => item.id === draft.id) && (
            <div className="modal-secondary">
              <Button
                variant="danger"
                onClick={() => {
                  void remove("courseResources", draft);
                  setDraft(undefined);
                }}
              >
                {t("Delete")}
              </Button>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
