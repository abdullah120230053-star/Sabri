import { useState } from "react";
import { useTranslation } from "react-i18next";
import { tell } from "./store";
import { Button } from "./ui";
export function Updates() {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false),
    [version, setVersion] = useState<string>(),
    [ready, setReady] = useState(false);
  return (
    <div className="actions">
      {!version && (
        <Button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const result = await window.sabri.checkUpdates();
              if (result.state === "available") setVersion(result.version);
              else
                tell(
                  t(
                    result.state === "current"
                      ? "Sabri is up to date."
                      : "This build has no configured update feed.",
                  ),
                );
            } catch {
              tell(t("Could not check for updates."));
            } finally {
              setBusy(false);
            }
          }}
        >
          {t("Check for updates")}
        </Button>
      )}
      {version && !ready && (
        <Button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              setReady(await window.sabri.downloadUpdate());
            } catch {
              tell(t("Could not download the update."));
            } finally {
              setBusy(false);
            }
          }}
        >
          {t("Download Sabri {{version}}", { version })}
        </Button>
      )}
      {ready && (
        <Button
          variant="primary"
          onClick={() => {
            void window.sabri.installUpdate();
          }}
        >
          {t("Restart and install")}
        </Button>
      )}
    </div>
  );
}
