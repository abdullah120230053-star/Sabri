import { z } from "zod";
import { cleanText, getJson } from "./http";
import type { LmsItem } from "../../shared/logic/lms-mapping";

type ReadFunction =
  | "core_webservice_get_site_info"
  | "mod_assign_get_assignments"
  | "mod_assign_get_submission_status";
const moodleSite = z.object({
  userid: z.number(),
  functions: z.array(z.object({ name: z.string() })),
});
const assignments = z.object({
  courses: z.array(
    z.object({
      id: z.number(),
      fullname: z.string(),
      assignments: z.array(
        z.object({
          id: z.number(),
          name: z.string(),
          duedate: z.number().int().min(0).max(4102444800).default(0),
        }),
      ),
    }),
  ),
  warnings: z.array(z.unknown()).default([]),
});
const submission = z.object({
  lastattempt: z
    .object({
      submission: z
        .object({ status: z.string(), timemodified: z.number() })
        .optional(),
    })
    .optional(),
});

export function moodleBaseUrl(value: string) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error("unsupported");
  return url.href.replace(/\/$/, "");
}

export async function readMoodleWebServices(input: {
  url: string;
  token: string;
}) {
  const endpoint = moodleBaseUrl(input.url) + "/webservice/rest/server.php";
  const call = (name: ReadFunction, parameters: Record<string, string> = {}) =>
    getJson(endpoint, {
      method: "POST",
      body: new URLSearchParams({
        wstoken: input.token,
        wsfunction: name,
        moodlewsrestformat: "json",
        ...parameters,
      }),
    });
  const site = moodleSite.safeParse(
    await call("core_webservice_get_site_info"),
  );
  if (!site.success) throw new Error("access_denied");
  const names = new Set(site.data.functions.map((item) => item.name));
  if ([...names].some((name) => !/(?:^|_)(?:get|list)(?:_|$)/.test(name)))
    throw new Error("access_denied");
  if (!names.has("mod_assign_get_assignments")) throw new Error("unsupported");
  const data = assignments.parse(await call("mod_assign_get_assignments"));
  const items: LmsItem[] = [];
  for (const course of data.courses) {
    const name = cleanText(course.fullname);
    if (!name) continue;
    for (const assignment of course.assignments) {
      const title = cleanText(assignment.name);
      if (!title || items.length >= 1000) continue;
      items.push({
        id: String(assignment.id),
        course: { id: String(course.id), name },
        title,
        kind: /\blab\b/i.test(title) ? "lab" : "homework",
        dueAt:
          assignment.duedate > 0
            ? new Date(assignment.duedate * 1000).toISOString()
            : undefined,
      });
    }
  }
  if (names.has("mod_assign_get_submission_status")) {
    const inspect = items.slice(0, 40);
    for (let index = 0; index < inspect.length; index += 5)
      await Promise.all(
        inspect.slice(index, index + 5).map(async (item) => {
          try {
            const status = submission.safeParse(
              await call("mod_assign_get_submission_status", {
                assignid: item.id,
                userid: String(site.data.userid),
              }),
            );
            const row = status.success
              ? status.data.lastattempt?.submission
              : undefined;
            if (row?.status === "submitted" && row.timemodified > 0)
              item.submittedAt = new Date(
                row.timemodified * 1000,
              ).toISOString();
          } catch {
            /* Assignment data remains usable when submission access is unavailable. */
          }
        }),
      );
  }
  return { items, complete: data.warnings.length === 0 && items.length < 1000 };
}
