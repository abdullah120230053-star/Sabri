import { _electron as electron } from "playwright";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const data = await mkdtemp(join(tmpdir(), "sabri-addon-"));
let app;
try {
  const executablePath = process.env.SABRI_TEST_EXECUTABLE || undefined;
  app = await electron.launch({
    executablePath,
    args: executablePath ? [] : [resolve(".")],
    env: { ...process.env, SABRI_TEST_DATA: data },
  });
  const page = await app.firstWindow();
  page.setDefaultTimeout(12000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.getByRole("button", { name: "Skip setup" }).click();
  const latest = await page.evaluate(async () => {
    const now = new Date(),
      timestamp = now.toISOString(),
      id = crypto.randomUUID();
    const date = new Date(Date.now() + 10 * 86400000)
      .toISOString()
      .slice(0, 10);
    const base = () => ({
      id: crypto.randomUUID(),
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    const exam = {
      ...base(),
      title: "Signals mock exam",
      type: "exam",
      date,
      courseId: id,
    };
    await window.sabri.apply({
      changes: [
        {
          collection: "courses",
          value: {
            ...base(),
            id,
            name: "Signals",
            code: "EE301",
            instructor: "",
            creditHours: 3,
            color: "#7755bb",
            semester: "Fall",
            gradeComponents: [],
            finalGrade: "",
            absenceLimit: 0,
            absences: 0,
          },
        },
        { collection: "calendar", value: exam },
        {
          collection: "tasks",
          value: {
            ...base(),
            title: "Solve response problems",
            priority: "high",
            estimated: 2,
          },
        },
      ],
    });
    return { id, date, examId: exam.id };
  });
  const launch = async (name, title = name) => {
    await page
      .getByRole("navigation", { name: "Workspace" })
      .getByRole("link", { name, exact: true })
      .click();
    await page
      .getByRole("heading", { name: title, level: 1, exact: true })
      .waitFor();
  };
  await launch("Today Plan");
  await page.getByRole("button", { name: "Generate", exact: true }).click();
  await page.getByRole("heading", { name: "Draft plan" }).waitFor();
  await page.getByRole("button", { name: "Accept all", exact: true }).click();
  await page.waitForFunction(async () =>
    (await window.sabri.load()).state.planBlocks.some(
      (item) => item.title === "Solve response problems",
    ),
  );

  await launch("Exam Prep");
  await page
    .getByRole("button", { name: "New exam plan", exact: true })
    .click();
  await page.getByLabel("Calendar exam").selectOption(latest.examId);
  await page
    .getByLabel("Paste syllabus")
    .fill("System response\nFourier transform");
  await page.getByRole("button", { name: "Add topics", exact: true }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("button", { name: "Generate", exact: true }).click();
  await page.getByRole("button", { name: "Accept all", exact: true }).click();
  await page.waitForFunction(async () =>
    (await window.sabri.load()).state.studySessions.some(
      (item) => item.kind === "review",
    ),
  );

  await launch("Assignments");
  await page
    .getByRole("button", { name: "New assignment", exact: true })
    .click();
  await page
    .getByLabel("Title", { exact: true })
    .fill("Frequency response lab");
  await page.getByLabel("Apply a template").selectOption("Lab report");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.waitForFunction(async () =>
    (await window.sabri.load()).state.assignments.some(
      (item) => item.checklist.length > 5,
    ),
  );

  await launch("Formula sheets");
  await page.getByRole("button", { name: "New formula", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("Fourier transform");
  await page
    .getByLabel("LaTeX", { exact: true })
    .fill("X(s)=\\int x(t)e^{-st}\\,dt");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page
    .getByRole("heading", { name: "Fourier transform", exact: true })
    .waitFor();
  await page.getByRole("button", { name: /^Quiz/ }).click();
  await page.getByRole("button", { name: "Reveal formula" }).click();
  await page.getByRole("button", { name: "Remembered" }).click();
  await page.waitForFunction(async () =>
    (await window.sabri.load()).state.formulas.some(
      (item) => item.leitnerBox === 2,
    ),
  );

  await page.getByRole("button", { name: "Sheet preview" }).click();
  await app.evaluate(
    ({ dialog }, file) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
    },
    join(data, "formula.pdf"),
  );
  const savePdf = await page.evaluate(() =>
    window.sabri.exportAddonPdf("formula"),
  );
  assert.equal(savePdf, true);
  const pdf = await readFile(join(data, "formula.pdf"));
  assert.ok(pdf.subarray(0, 4).equals(Buffer.from("%PDF")));
  assert.match(pdf.toString("latin1"), /\/Count 1\b/);
  await page.keyboard.press("Escape");

  await launch("Notes");
  await page
    .getByRole("button", { name: "New note", exact: true })
    .first()
    .click();
  await page.getByLabel("Title", { exact: true }).fill("Energy notes");
  await page
    .getByRole("textbox", { name: "Note content" })
    .pressSequentially("$E=mc^2$");
  await page.locator(".tiptap-mathematics-render").waitFor();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.waitForFunction(async () =>
    (await window.sabri.load()).state.notes.some((item) =>
      item.content.includes('data-latex="E=mc^2"'),
    ),
  );

  await launch("Parking lot", "Distraction Parking Lot");
  assert.equal(
    await app.evaluate(({ globalShortcut }) =>
      globalShortcut.isRegistered("CommandOrControl+Alt+P"),
    ),
    true,
  );
  const captureEvent = app.waitForEvent("window");
  await page.getByRole("button", { name: "Ctrl+Alt+P" }).click();
  const capture = await captureEvent;
  await capture.waitForURL("**/index.html#/parking-capture");
  await capture.getByLabel("Park a distraction").fill("Check Fourier table");
  await capture.getByRole("button", { name: "Park", exact: true }).click();
  await page.getByText("Check Fourier table", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Task", exact: true }).click();
  await page.waitForFunction(async () =>
    (await window.sabri.load()).state.tasks.some(
      (item) => item.title === "Check Fourier table",
    ),
  );
  await launch("Progress");
  await page.getByRole("heading", { name: "Achievements" }).waitFor();
  await launch("Quran Mushaf");
  await page.locator('.mushaf-sheet[lang="ar"] p').first().waitFor();
  await page.getByRole("button", { name: "New Mushaf Werd" }).click();
  await page.getByLabel("Title", { exact: true }).fill("Daily reading");
  await page.getByLabel("Next page").fill("22");
  await page.getByLabel("Pages per day").fill("2");
  await page.getByLabel("Daily reminder").check();
  await page.getByLabel("Reminder time").fill("19:10");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("button", { name: "Open today’s reading" }).click();
  await page.getByRole("button", { name: "Mark today complete" }).click();
  await page.waitForFunction(async () =>
    (await window.sabri.load()).state.mushafWerds.some(
      (item) =>
        item.title === "Daily reading" &&
        item.nextPage === 24 &&
        item.reminderTime === "19:10" &&
        item.reminderEnabled &&
        item.completedOn,
    ),
  );
  assert.deepEqual(errors, []);
  console.log("Add-on Electron flow passed");
} finally {
  await app?.close();
  await rm(data, { recursive: true, force: true });
}
