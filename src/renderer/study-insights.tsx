import { Timer, Activity } from "lucide-react";
import { useTranslation } from "react-i18next";
import { active } from "../shared/schema";
import { focusScore } from "../shared/logic/study-insights";
import { dayKey, addDate } from "../shared/time";
import { useSabri } from "./store";
import { Panel, useNow } from "./ui";

export function StudyInsights() {
  const { t } = useTranslation(),
    state = useSabri((s) => s.data),
    today = dayKey(useNow(60000), state.settings.location.timezone);
  const plans = active(state.examPlans);
  const courses = active(state.courses);
  const formulas = active(state.formulas);
  const scores = Array.from({ length: 7 }, (_, index) =>
    addDate(today, index - 6),
  ).map((date) => ({ date, value: focusScore(state, date) }));
  return (
    <div className="two-col addon-summary">
      <Panel title={t("Daily focus score")} icon={Timer}>
        {scores.map(({ date, value }) => (
          <div key={date} className="data-row">
            <span className="grow">{date}</span>
            {value === null ? "—" : value + " / 100"}
          </div>
        ))}
      </Panel>
      <Panel title={t("Weak-topic heatmap")} icon={Activity}>
        {courses.length ? (
          courses.map((course) => {
            const topics = plans
              .filter((plan) => plan.courseId === course.id)
              .flatMap((plan) =>
                plan.topics.map((topic) => ({
                  id: topic.id,
                  name: topic.name,
                  level: topic.confidence,
                })),
              );
            const entries = [
              ...topics,
              ...formulas
                .filter((item) => item.courseId === course.id)
                .map((item) => ({
                  id: item.id,
                  name: item.name,
                  level: item.leitnerBox,
                })),
            ].sort((a, b) => a.level - b.level);
            return (
              <section className="addon-section" key={course.id}>
                <h3>{course.name}</h3>
                <div className="addon-grid">
                  {entries.map((item) => (
                    <div key={item.id} className="addon-preview">
                      <small>{item.name}</small>
                      <progress
                        className="addon-meter"
                        value={item.level}
                        max={5}
                      />
                      <small>{item.level}/5</small>
                    </div>
                  ))}
                  {!entries.length && (
                    <small>
                      {t("No topics or formulas for this course yet")}
                    </small>
                  )}
                </div>
              </section>
            );
          })
        ) : (
          <p className="muted">{t("Add a course to see topic confidence.")}</p>
        )}
      </Panel>
    </div>
  );
}
