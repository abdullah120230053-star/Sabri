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
  "hr", "span", "div", "img",
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
      const mathType=node.attribs["data-type"];
      if ((node.name==="span"&&mathType==="inline-math"||node.name==="div"&&mathType==="block-math")&&
          (attribute==="data-type"||attribute==="data-latex"&&(node.attribs[attribute]?.length??0)<=8000)) continue;
      if(node.name==="img" && (attribute==="src"&&/^sabri-media:\/\/attachments\/[a-f0-9-]{36}\/[a-f0-9-]{36}\.(?:png|jpe?g|webp|gif)$/i.test(node.attribs[attribute]??'')||attribute==="alt"))continue;
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
