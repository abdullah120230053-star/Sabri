import { useEffect, useState } from "react";
import {
  Bell,
  Download,
  Link2,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Trash2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { PairInfo, SyncInfo } from "../shared/phone";
import {
  Button,
  Empty,
  Field,
  IconButton,
  PageHead,
  Panel,
  useNow,
} from "./ui";
import { tell } from "./store";
import { timerLabel } from "../shared/timer";

export function PhoneSyncPage() {
  const { t } = useTranslation();
  const [info, setInfo] = useState<SyncInfo>({
    running: false,
    secure: false,
    devices: [],
  });
  const [port, setPort] = useState(51337),
    [pin, setPin] = useState(""),
    [pair, setPair] = useState<PairInfo>(),
    [busy, setBusy] = useState(false);
  const [secure, setSecure] = useState(false),
    [fingerprint, setFingerprint] = useState("");
  const now = useNow();
  const run = async (action: () => Promise<SyncInfo>) => {
    setBusy(true);
    try {
      setInfo(await action());
    } catch {
      tell(
        t("Phone sync could not start. Check the Wi-Fi connection and port."),
      );
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    const pull = () => {
      void window.sabri
        .syncInfo()
        .then(setInfo)
        .catch(() => undefined);
    };
    pull();
    const timer = setInterval(pull, 2500);
    return () => clearInterval(timer);
  }, []);
  const start = () =>
    run(() => window.sabri.syncStart({ port, pin: pin || undefined, secure }));
  const expired = pair && pair.expires <= +now;
  return (
    <>
      <PageHead
        title={t("Phone sync")}
        description={t(
          "Use Sabri on a phone connected to the same Wi-Fi network.",
        )}
        action={
          info.running && (
            <span className="pill active-pill">
              <Link2 size={15} />
              {t("Phone sync is on")}
            </span>
          )
        }
      />
      <div className="two-col">
        <Panel title={t("Connect phone")} icon={Smartphone}>
          {!info.running ? (
            <form
              className="form-grid"
              onSubmit={(event) => {
                event.preventDefault();
                void start();
              }}
            >
              <Field label={t("LAN port")}>
                <input
                  type="number"
                  required
                  min={1024}
                  max={65535}
                  value={port}
                  onChange={(e) => setPort(+e.target.value)}
                />
              </Field>
              <Field label={t("Optional pairing PIN")}>
                <input
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]{4,8}"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  autoComplete="off"
                />
              </Field>
              <label className="check-label wide">
                <input
                  type="checkbox"
                  checked={secure}
                  onChange={(event) => setSecure(event.target.checked)}
                />
                {t("Secure Wi-Fi for system alerts")}
              </label>
              <div className="form-actions">
                <Button
                  variant="primary"
                  type="submit"
                  icon={Link2}
                  disabled={busy}
                >
                  {t("Start phone sync")}
                </Button>
              </div>
            </form>
          ) : (
            <>
              <div className="toolbar">
                <code>{info.address}</code>
                <Button
                  variant="danger"
                  onClick={() => {
                    setPair(undefined);
                    void run(window.sabri.syncStop);
                  }}
                >
                  {t("Stop phone sync")}
                </Button>
              </div>
              {!pair || expired ? (
                <Button
                  variant="primary"
                  icon={RefreshCw}
                  onClick={() => {
                    void window.sabri
                      .syncPair()
                      .then(setPair)
                      .catch(() =>
                        tell(t("Could not generate a pairing code")),
                      );
                  }}
                >
                  {t("Generate pairing QR")}
                </Button>
              ) : (
                <div className="pair-panel">
                  <img
                    alt={t("Phone pairing QR code")}
                    src={pair.image}
                    width={240}
                    height={240}
                  />
                  <p>{t("Scan the code with your phone camera.")}</p>
                  <small>
                    {t("Expires in")}{" "}
                    <time dir="ltr">
                      {timerLabel(Math.max(0, pair.expires - +now))}
                    </time>
                  </small>
                  <input
                    type="text"
                    readOnly
                    aria-label={t("Pairing link")}
                    value={pair.url}
                    onFocus={(e) => e.target.select()}
                  />
                </div>
              )}
            </>
          )}
          {(secure || info.secure) && (
            <div className="secure-phone">
              <p className="muted">
                {t(
                  "Transfer and trust the exported certificate on your own phone before opening the HTTPS pairing link.",
                )}
              </p>
              <Button
                icon={Download}
                onClick={() => {
                  void window.sabri
                    .exportPhoneCertificate()
                    .then((result) => {
                      if (result) setFingerprint(result.fingerprint);
                    })
                    .catch(() =>
                      tell(t("Could not export the Wi-Fi certificate.")),
                    );
                }}
              >
                {t("Export phone certificate")}
              </Button>
              {fingerprint && (
                <small className="certificate-fingerprint">
                  SHA-256 {fingerprint}
                </small>
              )}
            </div>
          )}
        </Panel>
        <Panel
          title={t("Paired devices")}
          icon={ShieldCheck}
          tone="mint"
          action={
            info.running && (
              <Button
                icon={Bell}
                disabled={!info.devices.length}
                onClick={() => {
                  void window.sabri
                    .testPhoneAlert()
                    .then((sent) => {
                      if (sent) tell(t("Test alert added to the phone inbox."));
                    })
                    .catch(() => tell(t("Could not send the test alert.")));
                }}
              >
                {t("Send test alert")}
              </Button>
            )
          }
        >
          {info.devices.length ? (
            info.devices.map((device) => (
              <div className="data-row device-row" key={device.id}>
                <input
                  key={device.name}
                  className="grow"
                  aria-label={t("Device name")}
                  defaultValue={device.name}
                  maxLength={80}
                  onBlur={(e) => {
                    if (
                      e.target.value.trim() &&
                      e.target.value.trim() !== device.name
                    )
                      void run(() =>
                        window.sabri.syncDevice({
                          ...device,
                          name: e.target.value.trim(),
                        }),
                      );
                  }}
                />
                {device.pushEnabled && (
                  <span className="pill">{t("System alerts")}</span>
                )}
                <select
                  value={device.canEdit ? "edit" : "view"}
                  aria-label={t("Permission") + " " + device.name}
                  onChange={(e) => {
                    void run(() =>
                      window.sabri.syncDevice({
                        ...device,
                        canEdit: e.target.value === "edit",
                      }),
                    );
                  }}
                >
                  <option value="edit">{t("Can edit")}</option>
                  <option value="view">{t("View only")}</option>
                </select>
                <IconButton
                  icon={Trash2}
                  label={t("Revoke") + " " + device.name}
                  onClick={() => {
                    void run(() => window.sabri.syncRevoke(device.id));
                  }}
                />
              </div>
            ))
          ) : (
            <Empty
              compact
              icon={Smartphone}
              title={t("No phones paired")}
              detail={t("Pair a phone by scanning a QR code.")}
            />
          )}
          <p className="muted">
            {t(
              "The connection uses your local network. Sync stops when you quit Sabri.",
            )}
          </p>
        </Panel>
      </div>
    </>
  );
}
