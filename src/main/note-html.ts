import { load } from "cheerio";
const tags = new Set([
  "p",
  "h1",
  "h2",
  "h3",
  "ul",
  "ol",
  "li",
  "blockquote",
  "strong",
  "em",
  "s",
  "code",
  "pre",
  "br",
  "a",
  "hr",
]);
export function sanitizeNote(html: string) {
  const $ = load(html, {}, false);
  $("script,style,iframe,object,embed,form,svg,math,template").remove();
  for (const node of $("*").toArray().reverse()) {
    if (!("name" in node) || !("attribs" in node)) continue;
    const element = $(node);
    if (!tags.has(node.name)) {
      element.replaceWith(element.contents());
      continue;
    }
    for (const attribute of Object.keys(node.attribs)) {
      if (node.name === "a" && attribute === "href") {
        try {
          if (
            ["https:", "http:", "mailto:"].includes(
              new URL(node.attribs[attribute] ?? "").protocol,
            )
          )
            continue;
        } catch {
          /* Drop invalid URLs. */
        }
      }
      element.removeAttr(attribute);
    }
  }
  return $.root().html()?.slice(0, 100000) ?? "";
}
