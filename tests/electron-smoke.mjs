import { _electron as electron, chromium } from "playwright";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import assert from "node:assert/strict";

const data = await mkdtemp(join(tmpdir(), "sabri-smoke-"));
let app, browser;
const phoneEnabled = process.argv.includes("--phone");
const args = process.env.SABRI_TEST_EXECUTABLE ? [] : [resolve(".")];
try {
  const launch = () =>
    electron.launch({
      executablePath: process.env.SABRI_TEST_EXECUTABLE || undefined,
      args,
      env: { ...process.env, SABRI_TEST_DATA: data },
    });
  app = await launch();
  const page = await app.firstWindow();
  page.setDefaultTimeout(15000);
  page.on("pageerror", (error) => console.error(error));
  page.on("console", (entry) => {
    if (entry.type() === "error") console.error(entry.text().slice(0, 300));
  });
  const link = (name) => page.getByRole("link", { name, exact: true });
  const button = (name) => page.getByRole("button", { name, exact: true });
  await button("Skip setup").click();
  await page
    .getByRole("heading", { name: "Make time for what matters." })
    .waitFor();
  for (const theme of [
    "light",
    "dark",
    "f1",
    "cyberpunk",
    "nature",
    "football",
    "anime",
    "islamic",
  ]) {
    await page
      .getByRole("combobox", { name: "Theme", exact: true })
      .selectOption(theme);
    await page
      .locator('.theme-scene[data-art="' + theme + '"] img')
      .evaluate((img) => img.decode());
  }
  await page
    .getByRole("combobox", { name: "Theme", exact: true })
    .selectOption("light");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.waitForFunction(() => {
    const light = document.querySelector(".scene-light");
    const picture = document.querySelector(".scene-picture");
    return !!light && !!picture && getComputedStyle(light).animationName === "none" && getComputedStyle(picture).transform === "none";
  });
  await link("Tasks").click();
  await page
    .getByRole("textbox", { name: "Add a task" })
    .fill("Review circuits !high");
  await button("Add").click();
  await button("Complete task Review circuits").click();
  await button("Reopen task Review circuits").waitFor();
  await link("Schedule").click();
  await button("Add class").click();
  await page.getByRole("textbox", { name: "Title" }).fill("Circuits lecture");
  await button("Save").click();
  await button("List").click();
  await page.getByRole("button", { name: /Circuits lecture/ }).waitFor();
  await link("University data").click();
  await button("Paste timetable").click();
  await page
    .getByRole("textbox", { name: "Paste timetable", exact: true })
    .fill("Circuits Lab | Monday | 10:10–11:30 | Room C04");
  await button("Preview rows").click();
  await page
    .getByRole("textbox", { name: "Title 1" })
    .fill("Circuits Lab · Group A");
  await button("Save selected rows").click();
  await button("List").click();
  await page.getByRole("button", { name: /Circuits Lab · Group A/ }).waitFor();
  await link("Settings").click();
  await page
    .getByRole("checkbox", { name: "Show timer and next prayer in HM-Bar" })
    .check();
  await link("Focus timer").click();
  await button("Start focus").click();
  await button("Pause").waitFor();
  await page.waitForFunction(
    async () => (await window.sabri.load()).state.timer.status === "running",
  );
  const snapshot = await readFile(join(data, "hm-bar.json"), "utf8").then(
    JSON.parse,
  );
  assert.equal(snapshot.version, 1);
  assert.equal(snapshot.timer.status, "running");
  assert(snapshot.nextPrayer.display.length > 0);
  await button("Pause").click();
  await page
    .getByRole("combobox", { name: "Theme", exact: true })
    .selectOption("nature");
  await page.waitForFunction(
    () => document.documentElement.dataset.theme === "nature",
  );
  await link("Prayer times").click();
  await button("Fajr · Complete").click();
  await page.waitForFunction(
    () =>
      document
        .querySelector('button[aria-label="Fajr · Pending"]')
        ?.getAttribute("aria-pressed") === "true",
  );
  await link("Notes").click();
  await button("New note").first().click();
  await page
    .getByRole("textbox", { name: "Title", exact: true })
    .fill("Lab notes");
  await page
    .getByRole("textbox", { name: "Note content" })
    .fill("Voltage and current");
  await button("Save").click();
  await page.getByRole("button", { name: /Lab notes/ }).waitFor();
  await link("Settings").click();
  await button("Create theme").click();
  await page
    .getByRole("textbox", { name: "Name", exact: true })
    .fill("Indigo Study");
  await button("Save").click();
  await page
    .getByRole("combobox", { name: "Theme", exact: true })
    .locator("option", { hasText: "Indigo Study" })
    .waitFor({ state: "attached" });
  await page
    .getByRole("combobox", { name: "Theme", exact: true })
    .selectOption("light");
  await link("Overview").click();
  await button("Edit dashboard").click();
  await page
    .getByRole("combobox", { name: "Layout preset" })
    .selectOption("minimal");
  await page
    .getByRole("textbox", { name: "Layout name" })
    .fill("My Study Grid");
  await button("Save layout").click();
  await page.getByRole("heading", { name: "Clock", exact: true }).waitFor();

  if (phoneEnabled) {
    await page.evaluate(async () => {
      const { state } = await window.sabri.load();
      const opts = {
        timeZone: state.settings.location.timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      };
      const format = new Intl.DateTimeFormat("en-CA", opts);
      const stamp = () => ({
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      await window.sabri.apply({
        changes: [
          {
            collection: "tasks",
            value: {
              ...stamp(),
              title: "Prepare for today",
              dueDate: format.format(new Date()),
            },
          },
          {
            collection: "tasks",
            value: {
              ...stamp(),
              title: "Submit next week",
              dueDate: format.format(new Date(Date.now() + 7 * 86400000)),
            },
          },
        ],
      });
    });
    await link("Phone sync").click();
    await button("Start phone sync").click();
    await button("Generate pairing QR").click();
    const qr = await page
      .getByRole("textbox", { name: "Pairing link" })
      .inputValue();
    browser = await chromium.launch({ channel: "chrome", headless: false });
    const phone = await browser.newContext({
      viewport: { width: 400, height: 820 },
      isMobile: true,
      hasTouch: true,
    });
    const tab = await phone.newPage();
    await tab.goto(qr);
    await tab.getByRole("button", { name: "Pair device" }).click();
    await tab.getByText("Connected", { exact: true }).waitFor();
    await tab.getByText("Prepare for today", { exact: true }).waitFor();
    assert.equal(
      await tab.getByText("Submit next week", { exact: true }).count(),
      0,
    );
    await button("Send test alert").click();
    await tab.getByText("Sabri test alert", { exact: true }).waitFor();
    await tab
      .getByRole("button", { name: "Notifications", exact: true })
      .click();
    await tab
      .getByRole("heading", { name: "Notifications", exact: true })
      .waitFor();
    await tab.getByText("Sabri test alert", { exact: true }).waitFor();
    await tab.getByRole("button", { name: "Today", exact: true }).click();
    await phone.setOffline(true);
    await tab.getByRole("button", { name: "Asr", exact: true }).click();
    assert.equal(
      await tab
        .getByRole("button", { name: "Asr", exact: true })
        .getAttribute("aria-pressed"),
      "true",
    );
    await phone.setOffline(false);
    await page.waitForFunction(async () => {
      const state = (await window.sabri.load()).state;
      return state.prayerDays.some((day) => day.status.asr === "done");
    });
    await button("Revoke My phone").click();
    await tab
      .getByText("This device was disconnected. Pair it again from Sabri.")
      .waitFor({ timeout: 15000 });
    await button("Stop phone sync").click();
    await button("Start phone sync").waitFor();
    await browser.close();
    browser = undefined;
    await page
      .getByRole("checkbox", { name: "Secure Wi-Fi for system alerts" })
      .check();
    await button("Start phone sync").click();
    await button("Generate pairing QR").click();
    const secureLink = await page
      .getByRole("textbox", { name: "Pairing link" })
      .inputValue();
    assert(secureLink.startsWith("https://"));
    browser = await chromium.launch({
      channel: "chrome",
      headless: false,
      args: ["--ignore-certificate-errors"],
    });
    const secureContext = await browser.newContext({
      viewport: { width: 400, height: 820 },
      isMobile: true,
      hasTouch: true,
    });
    const securePage = await secureContext.newPage();
    await securePage.goto(secureLink);
    await securePage.getByRole("button", { name: "Pair device" }).click();
    await securePage.getByText("Connected", { exact: true }).waitFor();
    await securePage
      .getByRole("button", { name: "Notifications", exact: true })
      .click();
    const enable = securePage.getByRole("button", {
      name: "Enable system alerts",
      exact: true,
    });
    await enable.waitFor();
    await securePage.waitForFunction(async () => {
      const worker = await navigator.serviceWorker.getRegistration();
      return window.isSecureContext && worker?.active;
    });
    assert.equal(await enable.isEnabled(), true);
    await button("Send test alert").click();
    await securePage
      .getByText("Sabri test alert", { exact: true })
      .first()
      .waitFor();
    await button("Stop phone sync").click();
    await browser.close();
    browser = undefined;
  }
  await link("Settings").click();
  await page
    .getByRole("combobox", { name: "Language", exact: true })
    .selectOption("ar");
  await page.waitForFunction(() => document.documentElement.dir === "rtl");
  await page
    .getByRole("combobox", { name: "اللغة", exact: true })
    .selectOption("en");
  await page.waitForFunction(() => document.documentElement.dir === "ltr");
  await app.close();
  app = await launch();
  const restored = await app.firstWindow();
  const state = await restored.evaluate(
    async () => (await window.sabri.load()).state,
  );
  assert.equal(state.settings.theme, "light");
  assert(
    state.tasks.some(
      (task) => task.title === "Review circuits" && task.status === "done",
    ),
  );
  assert.equal(
    state.layouts.find((layout) => layout.id === state.settings.layout)?.name,
    "My Study Grid",
  );
  assert.equal(state.notes[0]?.title, "Lab notes");
  await restored
    .getByRole("button", { name: "Edit dashboard", exact: true })
    .click();
  await restored
    .getByRole("combobox", { name: "Layout preset" })
    .selectOption("overview");
  await restored
    .getByRole("button", { name: "Apply preset", exact: true })
    .click();
  await restored.locator(".theme-scene img").evaluate((img) => img.decode());
  await restored.screenshot({
    path: resolve("release/dashboard-smoke.png"),
    fullPage: true,
  });
  console.log(
    "Electron smoke passed" +
      (phoneEnabled
        ? ", including phone browser pairing and offline edits."
        : "."),
  );
} finally {
  await browser?.close();
  await app?.close();
  await rm(data, { recursive: true, force: true });
}
