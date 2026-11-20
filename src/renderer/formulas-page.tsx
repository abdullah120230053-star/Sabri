import { useMemo, useState } from "react";
import {
  BookOpen,
  Calculator,
  FileDown,
  FlaskConical,
  Plus,
  Star,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";
import katex from "katex";
import DOMPurify from "dompurify";
import "katex/dist/katex.min.css";
import { active, type RecordFor } from "../shared/schema";
import { reviewFormula } from "../shared/logic/leitner";
import { calculate } from "../shared/logic/calculator";
import { dayKey } from "../shared/time";
import { changeSettings, fresh, remove, save, tell, useSabri } from "./store";
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

type Formula = RecordFor<"formulas">;
export function MathView({
  latex,
  block = false,
}: {
  latex: string;
  block?: boolean;
}) {
  const html = useMemo(
    () =>
      DOMPurify.sanitize(
        katex.renderToString(latex, {
          displayMode: block,
          trust: false,
          maxExpand: 100,
          maxSize: 12,
          throwOnError: false,
        }),
        { USE_PROFILES: { html: true, mathMl: true, svg: true } },
      ),
    [latex, block],
  );
  return (
    <span
      dir="ltr"
      className={block ? "addon-math addon-math-block" : "addon-math"}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
export function FormulaWidget() {
  const { t } = useTranslation(),
    state = useSabri((s) => s.data),
    go = useNavigate();
  const day = dayKey(useNow(60000), state.settings.location.timezone);
  const rows = active(state.formulas),
    item = rows[Math.floor(Date.parse(day) / 86400000) % rows.length];
  return (
    <Panel
      title={t("Formula of the day")}
      icon={FlaskConical}
      action={<Button onClick={() => go("/formulas")}>{t("Open")}</Button>}
    >
      {item ? (
        <>
          <strong>{item.name}</strong>
          <MathView block latex={item.latex} />
        </>
      ) : (
        <p className="muted">{t("Add a formula to get started.")}</p>
      )}
    </Panel>
  );
}
export function FormulasPage() {
  const { t } = useTranslation(),
    state = useSabri((s) => s.data),
    [params] = useSearchParams(),
    now = useNow(60000);
  const [course, setCourse] = useState(params.get("course") ?? ""),
    [exam, setExam] = useState(params.has("exam")),
    [favorite, setFavorite] = useState(false),
    [search, setSearch] = useState("");
  const [draft, setDraft] = useState<Formula>(),
    [quiz, setQuiz] = useState<Formula>(),
    [revealed, reveal] = useState(false),
    [sheet, setSheet] = useState(false),
    [tools, setTools] = useState(false);
  const list = active(state.formulas).filter(
    (item) =>
      (!course || item.courseId === course) &&
      (!exam || item.examExtra) &&
      (!favorite || item.favorite) &&
      (!search ||
        [item.name, item.description, ...item.tags]
          .join(" ")
          .toLowerCase()
          .includes(search.toLowerCase())),
  );
  const due = list
    .filter(
      (item) => !item.nextReviewAt || Date.parse(item.nextReviewAt) <= +now,
    )
    .sort((a, b) => (a.nextReviewAt ?? "").localeCompare(b.nextReviewAt ?? ""));
  return (
    <>
      <PageHead
        title={t("Formula sheets")}
        description={t(
          "Save LaTeX, prepare a course sheet, and review from memory.",
        )}
        action={
          <>
            <Button onClick={() => setTools(true)} icon={Calculator}>
              {t("Engineering tools")}
            </Button>
            <Button onClick={() => setSheet(true)} icon={FileDown}>
              {t("Sheet preview")}
            </Button>
            <Button
              disabled={!due.length}
              onClick={() => {
                setQuiz(due[0]);
                reveal(false);
              }}
            >
              {t("Quiz")} · {due.length}
            </Button>
            <Button
              variant="primary"
              icon={Plus}
              onClick={() =>
                setDraft({
                  ...fresh(),
                  courseId: course || undefined,
                  name: "",
                  latex: "",
                  variables: [],
                  tags: [],
                  examExtra: false,
                  favorite: false,
                  leitnerBox: 1,
                })
              }
            >
              {t("New formula")}
            </Button>
          </>
        }
      />
      <div className="toolbar">
        <div className="addon-controls">
          <Field label={t("Search formulas")}>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </Field>
          <Field label={t("Course")}>
            <select value={course} onChange={(e) => setCourse(e.target.value)}>
              <option value="">{t("All courses")}</option>
              {active(state.courses).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </Field>
          <label className="check-label">
            <input
              type="checkbox"
              checked={exam}
              onChange={(e) => setExam(e.target.checked)}
            />
            {t("Exam extras")}
          </label>
          <label className="check-label">
            <input
              type="checkbox"
              checked={favorite}
              onChange={(e) => setFavorite(e.target.checked)}
            />
            {t("Favorites")}
          </label>
        </div>
      </div>
      {list.length ? (
        <div className="two-col">
          {list.map((item) => (
            <Panel
              key={item.id}
              title={item.name}
              icon={FlaskConical}
              action={
                <>
                  <Button
                    icon={Star}
                    aria-pressed={item.favorite}
                    onClick={() =>
                      void save("formulas", {
                        ...item,
                        favorite: !item.favorite,
                      })
                    }
                  >
                    {t("Favorite")}
                  </Button>
                  <Button onClick={() => setDraft(item)}>{t("Edit")}</Button>
                </>
              }
            >
              <MathView block latex={item.latex} />
              <p>{item.description}</p>
              <small>{item.tags.join(" · ")}</small>
              {item.variables.map((row) => (
                <div className="data-row" key={row.symbol}>
                  <code dir="ltr">{row.symbol}</code>
                  <span className="grow">{row.meaning}</span>
                  {row.unit}
                </div>
              ))}
              <Button
                onClick={() =>
                  void navigator.clipboard
                    .writeText(item.latex)
                    .then(() => tell(t("Copied")))
                    .catch(() => tell(t("Could not copy LaTeX")))
                }
              >
                {t("Copy LaTeX")}
              </Button>
            </Panel>
          ))}
        </div>
      ) : (
        <Panel title={t("Formula sheets")}>
          <Empty title={t("No formulas found")} icon={BookOpen} />
        </Panel>
      )}
      {draft && (
        <FormulaEditor initial={draft} close={() => setDraft(undefined)} />
      )}
      {quiz && (
        <Modal title={t("Formula quiz")} close={() => setQuiz(undefined)}>
          <h3>{quiz.name}</h3>
          <ul>
            {quiz.variables.map((item) => (
              <li key={item.symbol}>
                {item.symbol} · {item.meaning} {item.unit}
              </li>
            ))}
          </ul>
          {!revealed ? (
            <Button variant="primary" onClick={() => reveal(true)}>
              {t("Reveal formula")}
            </Button>
          ) : (
            <>
              <MathView block latex={quiz.latex} />
              <div className="actions">
                {[false, true].map((value) => (
                  <Button
                    key={String(value)}
                    variant={value ? "primary" : "secondary"}
                    onClick={async () => {
                      if (
                        await save(
                          "formulas",
                          reviewFormula(quiz, value, new Date()),
                        )
                      ) {
                        setQuiz(due.find((item) => item.id !== quiz.id));
                        reveal(false);
                      }
                    }}
                  >
                    {t(value ? "Remembered" : "Review again")}
                  </Button>
                ))}
              </div>
            </>
          )}
          <p className="muted">
            {t("Leitner box")} {quiz.leitnerBox}/5
          </p>
        </Modal>
      )}
      {sheet && (
        <Modal title={t("A4 formula sheet")} close={() => setSheet(false)} wide>
          <div className="addon-print-sheet">
            <h1>
              {active(state.courses).find((item) => item.id === course)?.name ??
                t("Formula sheet")}
            </h1>
            <div className="addon-formula-sheet">
              {list.map((item) => (
                <section key={item.id}>
                  <h3>{item.name}</h3>
                  <MathView block latex={item.latex} />
                  <small>
                    {item.variables
                      .map(
                        (variable) =>
                          variable.symbol +
                          (variable.unit ? " (" + variable.unit + ")" : "") +
                          ": " +
                          variable.meaning,
                      )
                      .join(" · ")}
                  </small>
                </section>
              ))}
            </div>
          </div>
          {list.length > 18 && (
            <p className="warning">
              {t(
                "Filter formulas to 18 or fewer for a readable one-page sheet.",
              )}
            </p>
          )}
          <Button
            variant="primary"
            icon={FileDown}
            disabled={!list.length || list.length > 18}
            onClick={() =>
              void window.sabri
                .exportAddonPdf("formula")
                .catch(() => tell(t("Could not export the PDF")))
            }
          >
            {t("Export one-page PDF")}
          </Button>
        </Modal>
      )}
      {tools && <EngineeringTools close={() => setTools(false)} />}
    </>
  );
}

function FormulaEditor({
  initial,
  close,
}: {
  initial: Formula;
  close: () => void;
}) {
  const { t } = useTranslation(),
    state = useSabri((s) => s.data),
    [value, set] = useState(initial),
    [tags, setTags] = useState(initial.tags.join(", "));
  const [variables, setVariables] = useState(
    initial.variables
      .map((item) => [item.symbol, item.meaning, item.unit ?? ""].join(" | "))
      .join("\n"),
  );
  const valid = useMemo(() => {
    try {
      katex.renderToString(value.latex, {
        trust: false,
        maxExpand: 100,
        throwOnError: true,
      });
      return true;
    } catch {
      return false;
    }
  }, [value.latex]);
  return (
    <Modal
      title={t(initial.name ? "Edit formula" : "New formula")}
      close={close}
      wide
    >
      <form
        className="form-grid"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!valid) return;
          const rows = variables
            .split(/\r?\n/)
            .filter((line) => line.trim())
            .map((line) => line.split("|").map((item) => item.trim()))
            .map(([symbol, meaning, unit]) => ({
              symbol,
              meaning: meaning ?? "",
              unit: unit || undefined,
            }));
          if (
            await save("formulas", {
              ...value,
              variables: rows as Formula["variables"],
              tags: tags
                .split(",")
                .map((item) => item.trim())
                .filter(Boolean),
            })
          )
            close();
        }}
      >
        <Field label={t("Name")}>
          <input
            autoFocus
            required
            maxLength={200}
            value={value.name}
            onChange={(e) => set({ ...value, name: e.target.value })}
          />
        </Field>
        <Field label={t("Course")}>
          <select
            value={value.courseId ?? ""}
            onChange={(e) =>
              set({ ...value, courseId: e.target.value || undefined })
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
        <Field label={t("LaTeX")} wide>
          <textarea
            dir="ltr"
            required
            rows={3}
            maxLength={8000}
            value={value.latex}
            onChange={(e) => set({ ...value, latex: e.target.value })}
          />
        </Field>
        {value.latex && (
          <div className="wide addon-preview">
            {!valid && <p className="warning">{t("Check the LaTeX syntax")}</p>}
            <MathView block latex={value.latex} />
          </div>
        )}
        <Field label={t("Variables: symbol | meaning | unit")} wide>
          <textarea
            rows={4}
            value={variables}
            onChange={(e) => setVariables(e.target.value)}
          />
        </Field>
        <Field label={t("Description")} wide>
          <textarea
            maxLength={8000}
            value={value.description ?? ""}
            onChange={(e) => set({ ...value, description: e.target.value })}
          />
        </Field>
        <Field label={t("Tags")}>
          <input value={tags} onChange={(e) => setTags(e.target.value)} />
        </Field>
        <label className="check-label">
          <input
            type="checkbox"
            checked={value.examExtra}
            onChange={(e) => set({ ...value, examExtra: e.target.checked })}
          />
          {t("Include in exam sheet")}
        </label>
        <FormActions close={close} />
      </form>
      {initial.name && (
        <div className="modal-secondary">
          <Button
            variant="danger"
            onClick={() => {
              void remove("formulas", initial);
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

const constants = [
  ["Speed of light", "c", "299 792 458 m/s"],
  ["Planck constant", "h", "6.626 070 15 × 10⁻³⁴ J·s"],
  ["Elementary charge", "e", "1.602 176 634 × 10⁻¹⁹ C"],
  ["Boltzmann constant", "k", "1.380 649 × 10⁻²³ J/K"],
  ["Avogadro constant", "Nₐ", "6.022 140 76 × 10²³ mol⁻¹"],
];
const conversions = {
  length: { m: 1, km: 1000, cm: 0.01, mm: 0.001, ft: 0.3048, in: 0.0254 },
  mass: { kg: 1, g: 0.001, mg: 0.000001, lb: 0.45359237 },
  energy: { J: 1, kJ: 1000, Wh: 3600, kWh: 3600000 },
} as const;
function EngineeringTools({ close }: { close: () => void }) {
  const { t } = useTranslation(),
    settings = useSabri((s) => s.data.settings.formulaReminder);
  const [expr, setExpr] = useState(""),
    [result, setResult] = useState(""),
    [category, setCategory] = useState<keyof typeof conversions>("length"),
    [quantity, setQuantity] = useState(1),
    [from, setFrom] = useState(""),
    [to, setTo] = useState("");
  const units: Record<string, number> = conversions[category],
    keys = Object.keys(units);
  const first = from || keys[0]!,
    second = to || keys[1]!;
  return (
    <Modal title={t("Engineering tools")} close={close} wide>
      <h3>{t("Scientific calculator")}</h3>
      <form
        className="addon-controls addon-section"
        onSubmit={(e) => {
          e.preventDefault();
          try {
            setResult(String(calculate(expr)));
          } catch {
            setResult(t("Invalid expression"));
          }
        }}
      >
        <Field label={t("Expression")}>
          <input
            dir="ltr"
            value={expr}
            onChange={(e) => setExpr(e.target.value)}
            placeholder="sqrt(4) + sin(pi/2)"
          />
        </Field>
        <Button type="submit">{t("Calculate")}</Button>
        <output dir="ltr">{result}</output>
      </form>
      <h3>{t("Unit converter")}</h3>
      <div className="addon-controls addon-section">
        <Field label={t("Quantity")}>
          <input
            type="number"
            step="any"
            value={quantity}
            onChange={(e) => setQuantity(+e.target.value)}
          />
        </Field>
        <Field label={t("Dimension")}>
          <select
            value={category}
            onChange={(e) => {
              setCategory(e.target.value as typeof category);
              setFrom("");
              setTo("");
            }}
          >
            {Object.keys(conversions).map((item) => (
              <option key={item} value={item}>
                {t(item)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("From")}>
          <select value={first} onChange={(e) => setFrom(e.target.value)}>
            {keys.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </Field>
        <Field label={t("To")}>
          <select value={second} onChange={(e) => setTo(e.target.value)}>
            {keys.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </Field>
        <output>
          {Number(((quantity * units[first]!) / units[second]!).toPrecision(8))}{" "}
          {second}
        </output>
      </div>
      <h3>{t("Physical constants")}</h3>
      {constants.map(([name, symbol, value]) => (
        <div key={symbol} className="data-row">
          <span className="grow">{t(name ?? "")}</span>
          <code dir="ltr">
            {symbol} = {value}
          </code>
        </div>
      ))}
      <small>NIST · 2022 CODATA</small>
      <div className="addon-controls addon-section">
        <label className="check-label">
          <input
            type="checkbox"
            checked={settings.enabled}
            onChange={(e) =>
              void changeSettings({
                formulaReminder: { ...settings, enabled: e.target.checked },
              })
            }
          />
          {t("Remind me about formula reviews")}
        </label>
        <Field label={t("Reminder time")}>
          <input
            type="time"
            value={settings.time}
            onChange={(e) => {
              if (e.target.value)
                void changeSettings({
                  formulaReminder: { ...settings, time: e.target.value },
                });
            }}
          />
        </Field>
      </div>
    </Modal>
  );
}
