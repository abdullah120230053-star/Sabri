import { createRoot } from "react-dom/client";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import "@fontsource-variable/inter";
import "@fontsource-variable/manrope";
import "@fontsource-variable/noto-sans-arabic";
import {
  Bell,
  BookOpen,
  CalendarDays,
  Check,
  Link2,
  Moon,
  PencilLine,
  Timer,
} from "lucide-react";
import "../renderer/i18n";
import { applyTheme, makeTheme, themes } from "../renderer/themes";
import {
  Button,
  Field,
  Panel,
  Segments,
  titleCase,
  useNow,
} from "../renderer/ui";
import { addDate, dayOf } from "../shared/time";
import { prayers } from "../shared/schema";
import { remaining, timerLabel } from "../shared/timer";
import type {
  PhoneDevice,
  PhoneOperation,
  PhoneSnapshot,
} from "../shared/phone";
import { AlertsList } from "./alerts";
import { PhoneTasks } from "./phone-tasks";
import "./phone.css";

type Cache = {
  offset?: number;
  token?: string;
  device?: PhoneDevice;
  data?: PhoneSnapshot;
  operations: PhoneOperation[];
  readAlerts?: string[];
};
type ServerState = { device: PhoneDevice; data: PhoneSnapshot };
const empty: Cache = { operations: [] };
const pairToken = location.pathname === "/pair" ? location.hash.slice(1) : "";
if (pairToken) history.replaceState(null, "", "/pair");
const uuid = () => {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 15) | 64;
  bytes[8] = (bytes[8]! & 63) | 128;
  return Array.from(
    bytes,
    (byte, index) =>
      ([4, 6, 8, 10].includes(index) ? "-" : "") +
      byte.toString(16).padStart(2, "0"),
  ).join("");
};
const database = new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open("sabri-phone", 1);
  request.onupgradeneeded = () => request.result.createObjectStore("cache");
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});
async function getCache() {
  const db = await database;
  return new Promise<Cache>((resolve, reject) => {
    const query = db.transaction("cache").objectStore("cache").get("local");
    query.onsuccess = () => resolve(query.result ?? empty);
    query.onerror = () => reject(query.error);
  });
}
async function cache(value: Cache) {
  const db = await database;
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction("cache", "readwrite");
    tx.objectStore("cache").put(value, "local");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
const greeting = (date: string, language: string) =>
  new Intl.DateTimeFormat(language, {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(date + "T12:00:00Z"));

function Phone() {
  const { t, i18n } = useTranslation();
  const [state, setState] = useState<Cache>(empty),
    [ready, setReady] = useState(false),
    [online, setOnline] = useState(false),
    [message, setMessage] = useState("");
  const [deviceName, setDeviceName] = useState("My phone"),
    [pin, setPin] = useState(""),
    [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<
    "today" | "tasks" | "focus" | "agenda" | "note" | "alerts"
  >(() =>
    new URLSearchParams(location.search).get("open") === "alerts"
      ? "alerts"
      : "today",
  );
  const [pairLink, setPairLink] = useState("");
  const [banner, setBanner] = useState<PhoneSnapshot["notices"][number]>();
  const [refresh, setRefresh] = useState(0);
  const known = useRef<Set<string> | undefined>(undefined);
  const alerts = state.data?.notices ?? [];
  const unread = alerts.filter(
    (item) => !(state.readAlerts ?? []).includes(item.id),
  ).length;
  const [title, setTitle] = useState(""),
    [text, setText] = useState("");
  const now = useNow(1000);
  const commit = (change: (current: Cache) => Cache) =>
    setState((current) => change(current));
  useEffect(() => {
    void getCache()
      .then(setState)
      .catch(() => undefined)
      .finally(() => setReady(true));
    if (window.isSecureContext && "serviceWorker" in navigator)
      void navigator.serviceWorker
        .register("/worker.js")
        .catch(() => undefined);
  }, []);
  useEffect(() => {
    if (ready) void cache(state).catch(() => undefined);
  }, [state, ready]);
  useEffect(() => {
    if (!state.data) {
      known.current = undefined;
      return;
    }
    const upcoming = alerts.filter((item) => !known.current?.has(item.id));
    if (known.current && upcoming.length) setBanner(upcoming.at(-1));
    known.current = new Set(alerts.map((item) => item.id));
  }, [state.data]);
  useEffect(() => {
    if (!banner) return;
    const id = setTimeout(() => setBanner(undefined), 7500);
    return () => clearTimeout(id);
  }, [banner]);
  useEffect(() => {
    if (tab === "alerts" && unread)
      setState((current) => ({
        ...current,
        readAlerts: alerts.map((item) => item.id),
      }));
  }, [tab, unread]);
  useEffect(() => {
    if (!state.data) return;
    const data = state.data;
    void i18n.changeLanguage(data.language);
    document.documentElement.lang = data.language;
    document.documentElement.dir = data.language === "ar" ? "rtl" : "ltr";
    applyTheme(
      data.customTheme
        ? makeTheme(data.customTheme)
        : (themes.find((theme) => theme.id === data.theme) ?? themes[0]!),
    );
  }, [state.data, i18n]);
  useEffect(() => {
    const token = state.token;
    if (!token) return;
    let closed = false,
      inFlight = false;
    let socket: WebSocket | undefined;
    const pull = async () => {
      if (closed || inFlight) return;
      inFlight = true;
      try {
        const ops =
          state.device?.canEdit !== false ? state.operations.slice(0, 60) : [];
        const options = {
          headers: {
            Authorization: "Bearer " + token,
            "Content-Type": "application/json",
          },
          signal: AbortSignal.timeout(7000),
        };
        let sent = ops.length > 0;
        let response = await fetch(
          sent ? "/api/push" : "/api/pull",
          sent
            ? {
                ...options,
                method: "POST",
                body: JSON.stringify({ operations: ops }),
              }
            : options,
        );
        if (response.status === 403 && sent) {
          sent = false;
          response = await fetch("/api/pull", options);
        }
        if (response.status === 401) {
          setMessage(
            t("This device was disconnected. Pair it again from Sabri."),
          );
          commit(() => empty);
          setOnline(false);
          return;
        }
        if (!response.ok) throw new Error("Unavailable");
        const result = (await response.json()) as ServerState;
        if (closed) return;
        const completed = new Set(sent ? ops.map((op) => op.operationId) : []);
        commit((current) => ({
          ...current,
          ...result,
          offset: result.data.now - Date.now(),
          operations: result.device.canEdit
            ? current.operations.filter((op) => !completed.has(op.operationId))
            : [],
        }));
        setOnline(true);
      } catch {
        if (!closed) setOnline(false);
      } finally {
        inFlight = false;
      }
    };
    const connect = () => {
      if (
        closed ||
        socket?.readyState === WebSocket.OPEN ||
        socket?.readyState === WebSocket.CONNECTING
      )
        return;
      socket = new WebSocket(
        (location.protocol === "https:" ? "wss://" : "ws://") +
          location.host +
          "/ws",
        ["sabri", token],
      );
      socket.onmessage = () => {
        void pull();
      };
    };
    void pull();
    connect();
    let pulses = 0;
    const timer = setInterval(() => {
      if (
        socket?.readyState !== WebSocket.OPEN ||
        state.operations.length ||
        ++pulses % 8 === 0
      )
        void pull();
      connect();
    }, 4000);
    window.addEventListener("online", pull);
    return () => {
      closed = true;
      clearInterval(timer);
      socket?.close();
      window.removeEventListener("online", pull);
    };
  }, [state.token, state.operations.length, state.device?.canEdit, t, refresh]);
  const add = (operation: PhoneOperation) =>
    commit((current) => ({
      ...current,
      operations: [...current.operations, operation],
    }));
  const pair = async () => {
    setBusy(true);
    setMessage("");
    try {
      let token = pairToken;
      if (pairLink.trim()) {
        const input = new URL(pairLink.trim());
        if (input.origin !== location.origin || input.pathname !== "/pair")
          throw new Error("Pairing origin mismatch");
        token = input.hash.slice(1);
      }
      const response = await fetch("/api/pair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          name: deviceName,
          pin: pin || undefined,
        }),
        signal: AbortSignal.timeout(7000),
      });
      if (!response.ok) throw new Error("Pairing failed");
      const body = (await response.json()) as {
        token: string;
        device: PhoneDevice;
      };
      commit(() => ({ ...body, operations: [] }));
      history.replaceState(null, "", "/");
    } catch {
      setMessage(t("Pairing failed. Check the PIN or scan a fresh QR code."));
    } finally {
      setBusy(false);
    }
  };
  const brand = (
    <div className="phone-brand">
      <span className="brand-icon">
        <BookOpen size={22} />
      </span>
      <strong>
        Sabri <span lang="ar">صبري</span>
      </strong>
    </div>
  );
  if (!ready)
    return (
      <main>
        {brand}
        <p>{t("Loading Sabri…")}</p>
      </main>
    );
  if (!state.token)
    return (
      <main>
        {brand}
        <Panel title={t("Connect to Sabri")} icon={Link2}>
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              void pair();
            }}
          >
            {!pairToken && (
              <>
                <p>
                  {t(
                    "Scan the QR code, or paste a fresh pairing link from Sabri on your desktop.",
                  )}
                </p>
                <Field label={t("Pairing link")}>
                  <input
                    type="text"
                    autoComplete="off"
                    required
                    value={pairLink}
                    onChange={(event) => setPairLink(event.target.value)}
                  />
                </Field>
              </>
            )}
            <Field label={t("Device name")}>
              <input
                value={deviceName}
                required
                maxLength={80}
                onChange={(e) => setDeviceName(e.target.value)}
              />
            </Field>
            <Field label={t("PIN, if enabled")}>
              <input
                inputMode="numeric"
                maxLength={8}
                value={pin}
                onChange={(e) => setPin(e.target.value)}
              />
            </Field>
            <div className="actions">
              <Button variant="primary" disabled={busy} type="submit">
                {t("Pair device")}
              </Button>
              {pairToken && navigator.clipboard && (
                <Button
                  onClick={() => {
                    void navigator.clipboard
                      .writeText(location.origin + "/pair#" + pairToken)
                      .then(() => setMessage(t("Pairing link copied.")))
                      .catch(() => undefined);
                  }}
                >
                  {t("Copy pairing link")}
                </Button>
              )}
            </div>
          </form>
          {window.isSecureContext && (
            <p className="muted">
              {t(
                "On iPhone, add this page to your Home Screen for system alerts. You can paste the pairing link again after opening it.",
              )}
            </p>
          )}
          {message && (
            <p className="warning" role="alert">
              {message}
            </p>
          )}
        </Panel>
      </main>
    );
  const data = state.data;
  if (!data)
    return (
      <main>
        {brand}
        <p>{t("Connecting to your desktop…")}</p>
      </main>
    );
  const editing = state.device?.canEdit !== false;
  const tasksProps = {
    data,
    operations: state.operations,
    editing,
    add: (title: string) =>
      add({ operationId: uuid(), type: "task-add", title }),
    complete: (id: string, done: boolean) =>
      add({ operationId: uuid(), type: "task-status", id, done }),
  };
  const prayerStatus = (name: string) =>
    state.operations.findLast((op) => op.type === "prayer" && op.name === name);
  const stamp = (value: string) =>
    new Intl.DateTimeFormat(data.language, {
      hour: "numeric",
      minute: "2-digit",
      hourCycle: data.timeFormat === "24h" ? "h23" : "h12",
      timeZone: data.location.timezone,
    }).format(new Date(value));
  const left = remaining(data.timer, +now + (state.offset ?? 0));
  const upcoming = prayers.find(
    (prayer) => Date.parse(data.times[prayer]) > +now,
  );
  return (
    <main>
      {brand}
      <div className="phone-top">
        <div>
          <h1>{t("Today")}</h1>
          <p className="muted">{greeting(data.today, data.language)}</p>
        </div>
        <div className="actions">
          <div className="pill">
            {online ? t("Connected") : t("Offline")}
            {state.operations.length ? " · " + state.operations.length : ""}
          </div>
          <Button
            icon={Bell}
            aria-label={t("Notifications")}
            onClick={() => {
              setTab("alerts");
              setBanner(undefined);
            }}
          >
            {unread > 0 ? unread : null}
          </Button>
        </div>
      </div>
      {banner && tab !== "alerts" && (
        <button
          type="button"
          className="phone-alert-banner"
          role="status"
          onClick={() => {
            setTab("alerts");
            setBanner(undefined);
          }}
        >
          <Bell size={18} />
          <span>
            <strong>{banner.title}</strong>
            {banner.body && <small>{banner.body}</small>}
          </span>
        </button>
      )}
      {tab === "today" && (
        <>
          <Panel title={t("Today’s schedule")} icon={CalendarDays}>
            {data.schedule.length ? (
              data.schedule.map((item) => (
                <div className="data-row" key={item.id}>
                  <div className="grow">
                    <strong>{item.title}</strong>
                    <small>{item.location}</small>
                  </div>
                  <span>
                    {item.start}–{item.end}
                  </span>
                </div>
              ))
            ) : (
              <p className="muted">{t("No classes today")}</p>
            )}
          </Panel>
          <Panel title={t("Prayer checklist")} icon={Moon} tone="mint">
            {upcoming && (
              <p className="next-prayer">
                {t("Next prayer")} · {t(titleCase(upcoming))}{" "}
                {stamp(data.times[upcoming])}
              </p>
            )}
            {prayers.map((name) => {
              const op = prayerStatus(name),
                checked =
                  op?.type === "prayer"
                    ? op.done
                    : data.prayer[name] === "done" ||
                      data.prayer[name] === "late";
              return (
                <div className="prayer-row" key={name}>
                  <button
                    className="check-circle"
                    type="button"
                    aria-label={t(titleCase(name))}
                    aria-pressed={checked}
                    disabled={!editing}
                    onClick={() =>
                      add({
                        operationId: uuid(),
                        type: "prayer",
                        date: data.today,
                        name,
                        done: !checked,
                      })
                    }
                  >
                    {checked && <Check size={13} />}
                  </button>
                  <span className="grow">
                    {t(
                      name === "dhuhr" && dayOf(data.today) === 5
                        ? "Jumu’ah"
                        : titleCase(name),
                    )}
                  </span>
                  <time>
                    {data.times[name] ? stamp(data.times[name]) : "–"}
                  </time>
                </div>
              );
            })}
          </Panel>
          <PhoneTasks {...tasksProps} compact />
        </>
      )}
      {tab === "tasks" && <PhoneTasks {...tasksProps} />}
      {tab === "alerts" && (
        <AlertsList
          alerts={alerts}
          token={state.token}
          enabled={state.device?.pushEnabled ?? false}
          changed={() => setRefresh((value) => value + 1)}
        />
      )}

      {tab === "focus" && (
        <Panel title={t("Focus timer")} icon={Timer}>
          <div className="phone-timer">
            <time dir="ltr">{timerLabel(left)}</time>
            <p>
              {t(
                data.timer.phase === "focus"
                  ? "Focus"
                  : data.timer.phase === "short"
                    ? "Short break"
                    : "Long break",
              )}
            </p>
          </div>
          {editing && (
            <div className="actions">
              <Button
                variant="primary"
                disabled={state.operations.some((op) => op.type === "timer")}
                onClick={() =>
                  add({
                    operationId: uuid(),
                    type: "timer",
                    action: { type: "toggle" },
                  })
                }
              >
                {t(
                  data.timer.status === "running"
                    ? "Pause"
                    : data.timer.status === "paused"
                      ? "Resume"
                      : "Start focus",
                )}
              </Button>
              <Button
                onClick={() =>
                  add({
                    operationId: uuid(),
                    type: "timer",
                    action: { type: "reset" },
                  })
                }
              >
                {t("Reset")}
              </Button>
            </div>
          )}
        </Panel>
      )}
      {tab === "agenda" && (
        <Panel title={t("Calendar")} icon={CalendarDays}>
          {data.calendar.length ? (
            data.calendar.map((item) => (
              <div className="data-row" key={item.id}>
                <div className="grow">
                  <strong>{item.title}</strong>
                  <small>
                    {[t(titleCase(item.type ?? "event")), item.room]
                      .filter(Boolean)
                      .join(" · ")}
                  </small>
                </div>
                <small>
                  {item.date === addDate(data.today, 1)
                    ? t("Tomorrow")
                    : item.date}{" "}
                  {item.time}
                </small>
              </div>
            ))
          ) : (
            <p className="muted">{t("No events yet")}</p>
          )}
        </Panel>
      )}
      {tab === "note" && (
        <Panel title={t("New note")} icon={PencilLine}>
          {editing ? (
            <form
              className="stack"
              onSubmit={(e) => {
                e.preventDefault();
                if (title.trim()) {
                  add({
                    operationId: uuid(),
                    type: "note-add",
                    title: title.trim(),
                    text,
                  });
                  setTitle("");
                  setText("");
                  setTab("today");
                }
              }}
            >
              <Field label={t("Title")}>
                <input
                  required
                  value={title}
                  maxLength={200}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </Field>
              <Field label={t("Notes field")}>
                <textarea
                  rows={6}
                  value={text}
                  maxLength={20000}
                  onChange={(e) => setText(e.target.value)}
                />
              </Field>
              <Button variant="primary" type="submit">
                {t("Save")}
              </Button>
            </form>
          ) : (
            <p>{t("This device has view-only permission.")}</p>
          )}
        </Panel>
      )}
      <nav className="phone-nav">
        <Segments<typeof tab>
          label={t("Workspace")}
          value={tab}
          onChange={(value) => {
            setTab(value);
            setTitle("");
          }}
          options={[
            { value: "today", label: t("Today") },
            { value: "tasks", label: t("Tasks") },
            { value: "focus", label: t("Focus") },
            { value: "agenda", label: t("Agenda") },
            { value: "note", label: t("Note") },
          ]}
        />
      </nav>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Phone />);
