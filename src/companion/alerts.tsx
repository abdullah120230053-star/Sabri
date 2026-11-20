import { useEffect, useState } from "react";
import {
  Bell,
  BellOff,
  CalendarDays,
  ClipboardList,
  Moon,
  Timer,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { PhoneSnapshot } from "../shared/phone";
import { Button, Panel } from "../renderer/ui";

type Notice = PhoneSnapshot["notices"][number];
export function AlertsList({
  alerts,
  token,
  enabled,
  changed,
}: {
  alerts: Notice[];
  token: string;
  enabled: boolean;
  changed(): void;
}) {
  const { t, i18n } = useTranslation();
  const [registration, setRegistration] = useState<ServiceWorkerRegistration>();
  const [key, setKey] = useState<string>();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const supported =
    window.isSecureContext &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window;
  useEffect(() => {
    if (!supported) return;
    let active = true;
    void navigator.serviceWorker.ready
      .then((worker) => {
        if (active) setRegistration(worker);
      })
      .catch(() => undefined);
    void fetch("/api/notifications/key", {
      headers: { Authorization: "Bearer " + token },
    })
      .then(async (response) => {
        if (response.ok && active) {
          const result = (await response.json()) as { publicKey: string };
          setKey(result.publicKey);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [supported, token]);
  async function subscription() {
    if (!registration || !key) return;
    setBusy(true);
    setMessage("");
    const permissionRequest = enabled
      ? undefined
      : Notification.requestPermission();
    try {
      let current = await registration.pushManager.getSubscription();
      if (enabled) {
        const response = await fetch("/api/notifications/subscription", {
          method: "PUT",
          headers: {
            Authorization: "Bearer " + token,
            "Content-Type": "application/json",
          },
          body: "null",
        });
        if (!response.ok) throw new Error("Unable to disable");
        await current?.unsubscribe();
      } else {
        const permission = await permissionRequest;
        if (permission !== "granted") {
          setMessage(
            t(
              "Allow notifications in your phone settings to receive system alerts.",
            ),
          );
          return;
        }
        const encoded =
          key.replaceAll("-", "+").replaceAll("_", "/") +
          "=".repeat((4 - (key.length % 4)) % 4);
        current ??= await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: Uint8Array.from(atob(encoded), (value) =>
            value.charCodeAt(0),
          ),
        });
        const response = await fetch("/api/notifications/subscription", {
          method: "PUT",
          headers: {
            Authorization: "Bearer " + token,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(current.toJSON()),
        });
        if (!response.ok) throw new Error("Unable to subscribe");
      }
      changed();
      setMessage(
        t(enabled ? "System alerts disabled." : "System alerts enabled."),
      );
    } catch {
      setMessage(t("System alerts could not be configured on this device."));
    } finally {
      setBusy(false);
    }
  }
  const icons: Record<string, typeof Bell> = {
    prayer: Moon,
    class: CalendarDays,
    task: ClipboardList,
    event: CalendarDays,
    focus: Timer,
  };
  return (
    <Panel title={t("Notifications")} icon={Bell}>
      <div className="phone-alert-settings">
        {supported ? (
          <Button
            icon={enabled ? BellOff : Bell}
            disabled={busy || !registration || !key}
            onClick={() => {
              void subscription();
            }}
          >
            {t(enabled ? "Turn off system alerts" : "Enable system alerts")}
          </Button>
        ) : (
          <p className="muted">
            {t(
              "Reminders appear here over Wi-Fi. For system alerts, use Secure Wi-Fi and add Sabri to your Home Screen on iPhone.",
            )}
          </p>
        )}
        {message && (
          <p role="status" className="muted">
            {message}
          </p>
        )}
      </div>
      {alerts.length ? (
        alerts
          .slice()
          .reverse()
          .map((alert) => {
            const Icon = icons[alert.kind] ?? Bell;
            return (
              <div className="data-row phone-alert-row" key={alert.id}>
                <span className="tile tile-lilac">
                  <Icon size={17} />
                </span>
                <div className="grow">
                  <strong>{alert.title}</strong>
                  {alert.body && <p>{alert.body}</p>}
                  <small>
                    {new Date(alert.createdAt).toLocaleString(i18n.language, {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </small>
                </div>
              </div>
            );
          })
      ) : (
        <p className="muted">{t("No notifications yet")}</p>
      )}
    </Panel>
  );
}
