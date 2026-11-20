import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { shell } from "electron";
import { z } from "zod";
import type { LmsItem } from "../../shared/logic/lms-mapping";
import { cleanText, getJson } from "./http";

const scopes = [
  "classroom.courses.readonly",
  "classroom.coursework.me.readonly",
  "classroom.student-submissions.me.readonly",
].map((scope) => "https://www.googleapis.com/auth/" + scope);
const tokenEndpoint = "https://oauth2.googleapis.com/token";
const api = "https://classroom.googleapis.com/v1/";
const tokenReply = z.object({
  access_token: z.string(),
  refresh_token: z.string().optional(),
  scope: z.string().optional(),
});
const cursor = z.object({ nextPageToken: z.string().optional() });
const courses = cursor.extend({
  courses: z.array(z.object({ id: z.string(), name: z.string() })).default([]),
});
const coursework = cursor.extend({
  courseWork: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        dueDate: z
          .object({ year: z.number(), month: z.number(), day: z.number() })
          .optional(),
        dueTime: z
          .object({
            hours: z.number().default(0),
            minutes: z.number().default(0),
            seconds: z.number().default(0),
          })
          .optional(),
        maxPoints: z.number().positive().optional(),
        workType: z.string().optional(),
      }),
    )
    .default([]),
});
const submissions = cursor.extend({
  studentSubmissions: z
    .array(
      z.object({
        courseWorkId: z.string(),
        state: z.string(),
        updateTime: z.iso.datetime({ offset: true }).optional(),
        assignedGrade: z.number().nonnegative().optional(),
      }),
    )
    .default([]),
});

async function token(parameters: Record<string, string>) {
  const reply = tokenReply.parse(
    await getJson(tokenEndpoint, {
      method: "POST",
      body: new URLSearchParams(parameters),
    }),
  );
  if (
    reply.scope &&
    reply.scope.split(" ").some((scope) => scope && !scopes.includes(scope))
  )
    throw new Error("access_denied");
  return reply;
}

export async function authorizeClassroom(
  clientId: string,
  clientSecret: string,
) {
  const verifier = randomBytes(48).toString("base64url");
  const state = randomBytes(32).toString("hex");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  let resolveCode: (value: string) => void = () => {};
  let rejectCode: (error: Error) => void = () => {};
  const codePromise = new Promise<string>((resolve, reject) => {
    resolveCode = resolve;
    rejectCode = reject;
  });
  void codePromise.catch(() => undefined);
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const received = Buffer.from(url.searchParams.get("state") ?? "", "utf8");
    const expected = Buffer.from(state, "utf8");
    if (
      req.method !== "GET" ||
      url.pathname !== "/oauth/callback" ||
      received.length !== expected.length ||
      !timingSafeEqual(received, expected)
    ) {
      res.writeHead(404).end();
      return;
    }
    const code = url.searchParams.get("code");
    res.writeHead(200, {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    });
    res.end(
      code
        ? "Connection authorized. You can close this tab and return to Sabri."
        : "Authorization was cancelled. Return to Sabri.",
    );
    if (code) resolveCode(code);
    else rejectCode(new Error("access_denied"));
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("unsupported");
  }
  const redirect = "http://127.0.0.1:" + address.port + "/oauth/callback";
  const timeout = setTimeout(
    () => rejectCode(new Error("access_denied")),
    180000,
  );
  try {
    const auth = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    auth.search = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirect,
      response_type: "code",
      scope: scopes.join(" "),
      access_type: "offline",
      prompt: "consent",
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
    }).toString();
    await shell.openExternal(auth.href);
    const reply = await token({
      client_id: clientId,
      client_secret: clientSecret,
      code: await codePromise,
      code_verifier: verifier,
      redirect_uri: redirect,
      grant_type: "authorization_code",
    });
    if (!reply.refresh_token) throw new Error("needs_reconnect");
    return reply.refresh_token;
  } finally {
    clearTimeout(timeout);
    server.close();
    server.closeAllConnections();
  }
}

async function all<T extends z.ZodType<{ nextPageToken?: string }>>(
  path: string,
  schema: T,
  access: string,
) {
  const result: z.output<T>[] = [];
  let next: string | undefined;
  do {
    const url = new URL(path, api);
    url.searchParams.set("pageSize", "100");
    if (next) url.searchParams.set("pageToken", next);
    const value = schema.parse(
      await getJson(url.href, {
        headers: { Authorization: "Bearer " + access },
      }),
    ) as z.output<T>;
    result.push(value);
    next = value.nextPageToken;
  } while (next && result.length < 15);
  return { result, complete: !next };
}
export async function readClassroom(credential: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}) {
  const reply = await token({
    client_id: credential.clientId,
    client_secret: credential.clientSecret,
    refresh_token: credential.refreshToken,
    grant_type: "refresh_token",
  });
  const root = await all(
    "courses?courseStates=ACTIVE&studentId=me",
    courses,
    reply.access_token,
  );
  const items: LmsItem[] = [];
  let complete = root.complete;
  const available = root.result.flatMap((page) => page.courses);
  for (const course of available.slice(0, 100)) {
    const path = "courses/" + encodeURIComponent(course.id) + "/courseWork";
    const courseName = cleanText(course.name);
    if (!courseName) continue;
    const work = await all(
      path + "?courseWorkStates=PUBLISHED",
      coursework,
      reply.access_token,
    );
    complete &&= work.complete;
    const records = await all(
      path + "/-/studentSubmissions?userId=me",
      submissions,
      reply.access_token,
    ).catch(() => undefined);
    const byWork = new Map(
      records?.result
        .flatMap((page) => page.studentSubmissions)
        .map((value) => [value.courseWorkId, value]),
    );
    for (const item of work.result.flatMap((page) => page.courseWork)) {
      const title = cleanText(item.title),
        date = item.dueDate,
        time = item.dueTime;
      if (!title || items.length >= 1000) continue;
      const due = date
        ? new Date(
            Date.UTC(
              date.year,
              date.month - 1,
              date.day,
              time?.hours ?? 23,
              time?.minutes ?? 59,
              time?.seconds ?? 0,
            ),
          )
        : undefined;
      const submitted = byWork.get(item.id);
      items.push({
        id: course.id + ":" + item.id,
        title,
        course: { id: course.id, name: courseName },
        kind: item.workType === "ASSIGNMENT" ? "homework" : "quiz",
        dueAt: due?.toISOString(),
        submittedAt:
          submitted?.updateTime &&
          ["TURNED_IN", "RETURNED"].includes(submitted.state)
            ? new Date(submitted.updateTime).toISOString()
            : undefined,
        score: submitted?.assignedGrade,
        maxScore: item.maxPoints,
      });
    }
  }
  return {
    items,
    complete: complete && available.length <= 100 && items.length < 1000,
  };
}
