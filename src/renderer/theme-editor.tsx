import { useEffect, useRef, useState } from "react";
import { Download, Palette, Plus, Upload } from "lucide-react";
import { useTranslation } from "react-i18next";
import { active, themeSchema, type RecordFor } from "../shared/schema";
import { artwork } from "./theme-art";
import { accessibleTheme, applyTheme, makeTheme, themes } from "./themes";
import { changeSettings, fresh, remove, save, tell, useSabri } from "./store";
import { Button, Field, FormActions, Modal, Panel, titleCase } from "./ui";

type ThemeRecord = RecordFor<"themes">;
const initial = () => ({
  ...themeSchema.parse({
    ...fresh(),
    name: "Theme",
    parent: "light",
    colors: {},
    radius: 16,
    font: "manrope",
    shadow: "soft",
    pattern: "none",
  }),
  name: "",
});
export function ThemeEditor() {
  const { t } = useTranslation(),
    state = useSabri((s) => s.data);
  const [draft, setDraft] = useState<ThemeRecord>();
  const preview = useRef<HTMLDivElement>(null);
  const selected = draft ? makeTheme(draft) : undefined;
  const base = themes.find((theme) => theme.id === draft?.parent) ?? themes[0]!;
  const custom = active(state.themes);
  useEffect(() => {
    if (selected && preview.current) applyTheme(selected, preview.current);
  }, [selected]);
  const importTheme = async () => {
    try {
      const theme = await window.sabri.importTheme();
      if (theme) setDraft({ ...theme, ...fresh() });
    } catch {
      tell(t("Could not read the theme file."));
    }
  };
  return (
    <Panel title={t("Custom themes")} icon={Palette}>
      <div className="actions">
        <Button
          icon={Plus}
          variant="primary"
          onClick={() => setDraft(initial())}
        >
          {t("Create theme")}
        </Button>
        <Button
          icon={Download}
          onClick={() => {
            void importTheme();
          }}
        >
          {t("Import theme")}
        </Button>
      </div>
      {custom.map((item) => (
        <div key={item.id} className="data-row">
          <strong className="grow">{item.name}</strong>
          <Button onClick={() => setDraft(item)}>{t("Edit")}</Button>
          <Button
            icon={Upload}
            onClick={() => {
              void window.sabri
                .exportTheme(item)
                .catch(() => tell(t("Could not export the theme.")));
            }}
          >
            {t("Export")}
          </Button>
          <Button
            variant="danger"
            onClick={async () => {
              if (state.settings.theme === item.id)
                await changeSettings({ theme: item.parent });
              await remove("themes", item);
            }}
          >
            {t("Delete")}
          </Button>
        </div>
      ))}
      {draft && selected && (
        <Modal
          title={t(draft.name ? "Edit theme" : "Create theme")}
          wide
          close={() => setDraft(undefined)}
        >
          <form
            className="form-grid"
            onSubmit={async (e) => {
              e.preventDefault();
              const result = themeSchema.safeParse(draft);
              if (result.success && (await save("themes", result.data))) {
                await changeSettings({ theme: result.data.id });
                setDraft(undefined);
              }
            }}
          >
            <Field label={t("Name")}>
              <input
                autoFocus
                required
                maxLength={200}
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </Field>
            <Field label={t("Base theme")}>
              <select
                value={draft.parent}
                onChange={(e) => setDraft({ ...draft, parent: e.target.value })}
              >
                {themes.map((item) => (
                  <option key={item.id} value={item.id}>
                    {t(item.name)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("Corner radius")}>
              <input
                type="range"
                min={0}
                max={32}
                value={draft.radius}
                onChange={(e) =>
                  setDraft({ ...draft, radius: +e.target.value })
                }
              />
            </Field>
            <Field label={t("Heading font")}>
              <select
                value={draft.font}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    font: e.target.value as ThemeRecord["font"],
                  })
                }
              >
                <option value="manrope">Manrope</option>
                <option value="inter">Inter</option>
                <option value="arabic">Noto Sans Arabic</option>
              </select>
            </Field>
            <Field label={t("Card shadow")}>
              <select
                value={draft.shadow}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    shadow: e.target.value as ThemeRecord["shadow"],
                  })
                }
              >
                {(["none", "soft", "strong"] as const).map((item) => (
                  <option key={item} value={item}>
                    {t(titleCase(item))}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("Background pattern")}>
              <select
                value={draft.pattern}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    pattern: e.target.value as ThemeRecord["pattern"],
                  })
                }
              >
                {(["none", "dots", "grid", "diagonal"] as const).map((item) => (
                  <option key={item} value={item}>
                    {t(titleCase(item))}
                  </option>
                ))}
              </select>
            </Field>
            <details className="wide">
              <summary>{t("Theme colors")}</summary>
              <div className="theme-colors">
                {Object.entries(base.colors).map(([key, value]) => (
                  <Field
                    key={key}
                    label={t(titleCase(key.replaceAll("-", " ")))}
                  >
                    <input
                      type="color"
                      value={draft.colors[key] ?? value}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          colors: { ...draft.colors, [key]: e.target.value },
                        })
                      }
                    />
                  </Field>
                ))}
              </div>
            </details>
            <div className="theme-preview wide" ref={preview}>
              <div className="panel">
                <h2>{t("Theme preview")}</h2>
                <p className="muted">{t("Make time for what matters.")}</p>
                <Button variant="primary">{t("Start focus")}</Button>
              </div>
              <img src={artwork[base.art]} alt="" />
            </div>
            {!accessibleTheme(selected) && (
              <p className="warning wide">
                {t(
                  "Some color combinations fall below the recommended contrast.",
                )}
              </p>
            )}
            <FormActions close={() => setDraft(undefined)} />
          </form>
        </Modal>
      )}
    </Panel>
  );
}
