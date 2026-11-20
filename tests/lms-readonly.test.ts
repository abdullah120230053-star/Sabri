import { afterEach, expect, it, vi } from "vitest";
import { readClassroom } from "../src/main/integrations/google-classroom";
import { readMoodleWebServices } from "../src/main/integrations/moodle-ws";

afterEach(() => vi.unstubAllGlobals());
const answer = (value: unknown) =>
  new Response(JSON.stringify(value), {
    headers: { "Content-Type": "application/json" },
  });

it("reads Moodle using only allowlisted Web Service calls", async () => {
  const functions: string[] = [];
  const fake = vi.fn((_address: string, init?: RequestInit) => {
    const body = init?.body as URLSearchParams;
    const name = body.get("wsfunction") ?? "";
    functions.push(name);
    if (name === "core_webservice_get_site_info")
      return answer({
        userid: 42,
        functions: [
          { name: "mod_assign_get_assignments" },
          { name: "mod_assign_get_submission_status" },
        ],
      });
    if (name === "mod_assign_get_assignments")
      return answer({
        courses: [
          {
            id: 11,
            fullname: "Signals <strong>and systems</strong>",
            assignments: [
              {
                id: 73,
                name: "Frequency response lab<script>Bad</script>",
                duedate: 1795518000,
              },
            ],
          },
        ],
      });
    if (name === "mod_assign_get_submission_status")
      return answer({
        lastattempt: {
          submission: { status: "submitted", timemodified: 1795300000 },
        },
      });
    throw new Error("Unexpected Web Service call");
  });
  vi.stubGlobal("fetch", fake);
  const result = await readMoodleWebServices({
    url: "https://moodle.example.invalid/moodle",
    token: "synthetic-read-token",
  });
  expect(result.items[0]).toMatchObject({
    id: "73",
    title: "Frequency response lab",
    course: { name: "Signals and systems" },
    kind: "lab",
  });
  expect(result.items[0]?.submittedAt).toBeTruthy();
  expect(functions).toEqual([
    "core_webservice_get_site_info",
    "mod_assign_get_assignments",
    "mod_assign_get_submission_status",
  ]);
});

it("rejects a Moodle token that exposes write capabilities", async () => {
  const fake = vi.fn(() =>
    answer({
      userid: 42,
      functions: [
        { name: "mod_assign_get_assignments" },
        { name: "mod_assign_save_submission" },
      ],
    }),
  );
  vi.stubGlobal("fetch", fake);
  await expect(
    readMoodleWebServices({
      url: "https://moodle.example.invalid",
      token: "synthetic-write-token",
    }),
  ).rejects.toThrow("access_denied");
  expect(fake).toHaveBeenCalledTimes(1);
});

it("uses Classroom GET endpoints and the student’s own submissions", async () => {
  const fake = vi.fn((address: string, init?: RequestInit) => {
    const url = new URL(address);
    if (url.hostname === "oauth2.googleapis.com") {
      expect(init?.method).toBe("POST");
      return answer({ access_token: "synthetic-access-token" });
    }
    expect(init?.method ?? "GET").toBe("GET");
    expect((init?.headers as Record<string, string>).Authorization).toBe(
      "Bearer synthetic-access-token",
    );
    if (url.pathname === "/v1/courses")
      return answer({ courses: [{ id: "class-1", name: "Mathematics" }] });
    if (url.pathname.endsWith("/studentSubmissions")) {
      expect(url.searchParams.get("userId")).toBe("me");
      return answer({
        studentSubmissions: [
          {
            courseWorkId: "work-1",
            state: "TURNED_IN",
            updateTime: "2026-11-20T09:00:00Z",
          },
        ],
      });
    }
    return answer({
      courseWork: [
        {
          id: "work-1",
          title: "Calculus worksheet",
          dueDate: { year: 2026, month: 11, day: 22 },
          dueTime: { hours: 19 },
          workType: "ASSIGNMENT",
        },
      ],
    });
  });
  vi.stubGlobal("fetch", fake);
  const result = await readClassroom({
    clientId: "test.apps.googleusercontent.com",
    clientSecret: "synthetic-client-secret",
    refreshToken: "synthetic-refresh-token",
  });
  expect(result.items).toMatchObject([
    {
      id: "class-1:work-1",
      title: "Calculus worksheet",
      dueAt: "2026-11-22T19:00:00.000Z",
      submittedAt: "2026-11-20T09:00:00.000Z",
    },
  ]);
  expect(result.complete).toBe(true);
});
