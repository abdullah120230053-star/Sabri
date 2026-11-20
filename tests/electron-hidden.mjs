import { _electron as electron } from "playwright";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import assert from "node:assert/strict";

const data = await mkdtemp(join(tmpdir(), "sabri-notices-"));
let app;
try {
  const executablePath = process.env.SABRI_TEST_EXECUTABLE || undefined;
  app = await electron.launch({
    executablePath,
    args: executablePath ? [] : [resolve(".")],
    env: { ...process.env, SABRI_TEST_DATA: data },
  });
  const page = await app.firstWindow();
  await page.getByRole("button", { name: "Skip setup" }).click();
  await app.evaluate(async ({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    if (window && !window.isVisible()) await new Promise((resolve) => window.once("show", resolve));
  });
  await page.evaluate(async () => {
    const { state } = await window.sabri.load();
    await window.sabri.apply({
      changes: [],
      settings: {
        ...state.settings,
        onboarded: true,
        focus: { ...state.settings.focus, work: 1 },
        notifications: { ...state.settings.notifications, enabled: true },
      },
    });
    await window.sabri.timer({ type: "select", phase: "focus" });
    await window.sabri.timer({ type: "toggle" });
  });
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().forEach((window) => window.hide()),
  );
  await page.waitForFunction(
    async () => {
      const { state } = await window.sabri.load();
      return (
        state.notices.some((notice) => notice.kind === "focus") &&
        state.sessions.some(
          (session) => session.completed && session.actualMinutes === 1,
        )
      );
    },
    undefined,
    { timeout: 70000, polling: 1000 },
  );
  const visible = await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().some((window) => window.isVisible()),
  );
  assert.equal(visible, false);
  console.log(
    "The main-process focus scheduler persisted a completed session and notification while the window was hidden.",
  );
} finally {
  await app?.close();
  await rm(data, { recursive: true, force: true });
}
