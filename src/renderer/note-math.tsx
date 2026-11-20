import { useState } from "react";
import type { Editor } from "@tiptap/react";
import { useTranslation } from "react-i18next";
import { active } from "../shared/schema";
import { useSabri, tell } from "./store";
import { Button, Field } from "./ui";
import { MathView } from "./formulas-page";

export type MathEdit = { block: boolean; latex: string; position?: number };
export const snippets: Record<string, string> = {
  frac: "\\frac{a}{b}",
  int: "\\int_{a}^{b} f(x)\\,dx",
  sum: "\\sum_{i=1}^{n} a_i",
  matrix: "\\begin{bmatrix}a & b \\\\ c & d\\end{bmatrix}",
};
export function convertTypedMath(editor: Editor) {
  const { $from } = editor.state.selection;
  if (!$from.parent.isTextblock || $from.parent.type.name === "codeBlock")
    return;
  const before = $from.parent.textBetween(0, $from.parentOffset, "");
  const block = /^\s*\$\$([^$]+)\$\$$/.exec(before);
  if (block && $from.parentOffset === $from.parent.content.size) {
    editor.commands.insertContentAt(
      { from: $from.before(), to: $from.after() },
      { type: "blockMath", attrs: { latex: block[1] } },
    );
    return;
  }
  const inline = /(?<!\$)\$([^$\n]+)\$$/.exec(before);
  if (inline && !/^\d+(?:\.\d+)?$/.test(inline[1] ?? "")) {
    editor.commands.insertContentAt(
      { from: $from.pos - inline[0].length, to: $from.pos },
      { type: "inlineMath", attrs: { latex: inline[1] } },
    );
  }
}
export function MathTools({
  editor,
  value,
  set,
}: {
  editor: Editor | null;
  value?: MathEdit;
  set: (value: MathEdit | undefined) => void;
}) {
  const { t } = useTranslation(),
    formulas = useSabri((s) => s.data.formulas);
  const [show, setShow] = useState(false);
  const insert = () => {
    if (!editor || !value?.latex.trim()) return;
    const attrs = { latex: value.latex.trim() };
    if (value.position !== undefined) {
      const chain = editor.chain().setNodeSelection(value.position);
      if (value.block) chain.updateBlockMath(attrs).focus().run();
      else chain.updateInlineMath(attrs).focus().run();
    } else if (value.block) editor.chain().focus().insertBlockMath(attrs).run();
    else editor.chain().focus().insertInlineMath(attrs).run();
    set(undefined);
  };
  return (
    <>
      <div className="addon-controls addon-section">
        <Button onClick={() => set({ block: false, latex: "" })}>
          {t("Inline math")}
        </Button>
        <Button onClick={() => set({ block: true, latex: "" })}>
          {t("Math block")}
        </Button>
        <Button onClick={() => setShow(!show)}>
          {t("Symbols and formulas")}
        </Button>
      </div>
      {show && (
        <div className="addon-controls">
          {[
            "\\alpha",
            "\\beta",
            "\\theta",
            "\\Delta",
            "\\times",
            "\\leq",
            "\\lim",
            "\\mathrm{m/s}",
            ...Object.values(snippets),
          ].map((value) => (
            <Button
              key={value}
              onClick={() => set({ block: false, latex: value })}
            >
              <MathView latex={value} />
            </Button>
          ))}
          <Field label={t("Insert a saved formula")}>
            <select
              value=""
              onChange={(e) => {
                const item = active(formulas).find(
                  (item) => item.id === e.target.value,
                );
                if (item)
                  editor
                    ?.chain()
                    .focus()
                    .insertInlineMath({ latex: item.latex })
                    .run();
              }}
            >
              <option value="">—</option>
              {active(formulas).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
      )}
      {value && (
        <div className="addon-preview addon-section">
          <Field label={t("LaTeX")}>
            <textarea
              dir="ltr"
              rows={3}
              value={value.latex}
              maxLength={8000}
              onChange={(e) => set({ ...value, latex: e.target.value })}
            />
          </Field>
          <MathView latex={value.latex} block={value.block} />
          <div className="actions">
            <Button variant="primary" onClick={insert}>
              {t("Apply")}
            </Button>
            <Button
              onClick={() =>
                void navigator.clipboard
                  .writeText(value.latex)
                  .then(() => tell(t("Copied")))
                  .catch(() => tell(t("Could not copy LaTeX")))
              }
            >
              {t("Copy LaTeX")}
            </Button>
            <Button onClick={() => set(undefined)}>{t("Cancel")}</Button>
          </div>
        </div>
      )}
    </>
  );
}
