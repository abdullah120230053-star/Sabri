import { load } from "cheerio";

export async function limitedText(response: Response) {
  if (!response.ok || !response.body)
    throw new Error(
      response.status === 429
        ? "rate_limited"
        : response.status === 401 || response.status === 403
          ? "access_denied"
          : "unreachable",
    );
  const reader = response.body.getReader();
  const text = new TextDecoder();
  let total = 0,
    output = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > 6_000_000) throw new Error("invalid_response");
      output += text.decode(value, { stream: true });
    }
    return output + text.decode();
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}
export async function getJson(
  url: string,
  init: RequestInit = {},
): Promise<unknown> {
  const response = await fetch(url, {
    ...init,
    redirect: "error",
    signal: AbortSignal.timeout(18000),
  });
  return JSON.parse(await limitedText(response)) as unknown;
}
export const cleanText = (input: string, max = 200) => {
  const $ = load(input, {}, false);
  $("script,style,template").remove();
  return $.root().text().replace(/\s+/g, " ").trim().slice(0, max);
};
