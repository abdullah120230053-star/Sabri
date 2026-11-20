import { type State } from "../shared/schema";
import {
  addDate,
  blocksOn,
  dayOf,
  friendlyDate,
  localClock,
  minutesAt,
  minuteTime,
} from "../shared/time";

export async function scheduleImage(state: State, first: string) {
  const { settings } = state;
  const dates = Array.from({ length: 7 }, (_, index) =>
    addDate(first, index),
  ).filter((key) => !settings.hideFriday || dayOf(key) !== 5);
  const start = minutesAt(settings.dayStart),
    end = minutesAt(settings.dayEnd);
  const scale = 1.8,
    left = 100,
    width = 174,
    columnHeight = Math.max(400, end - start) * 0.85;
  const canvas = document.createElement("canvas");
  const columns = dates.length;
  canvas.width = Math.ceil(scale * (left + width * columns + 24));
  canvas.height = Math.ceil(scale * (columnHeight + 115));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No canvas graphics context.");
  ctx.scale(scale, scale);
  const style = getComputedStyle(document.documentElement);
  const token = (name: string) => style.getPropertyValue("--" + name).trim();
  const font = token("font-ui") + ", sans-serif";
  ctx.direction = settings.language === "ar" ? "rtl" : "ltr";
  ctx.textAlign = settings.language === "ar" ? "right" : "left";
  const text = (value: string, x: number, y: number, max: number) =>
    ctx.fillText(value, x, y, max);
  const total = canvas.width / scale;
  ctx.fillStyle = token("background");
  ctx.fillRect(0, 0, total, canvas.height / scale);
  ctx.fillStyle = token("text");
  ctx.font = "700 24px " + font;
  text(
    "Sabri · صبري",
    settings.language === "ar" ? total - 20 : 20,
    37,
    total - 40,
  );
  ctx.font = "550 14px " + font;
  text(
    friendlyDate(first, settings.language, { dateStyle: "long" }),
    settings.language === "ar" ? total - 20 : 20,
    61,
    total - 40,
  );
  const range = Math.max(1, end - start);
  const xpos = (n: number) =>
    settings.language === "ar"
      ? total - left - width * (n + 1)
      : left + width * n;
  for (let m = start; m < end; m += 60) {
    const y = 97 + ((m - start) / range) * columnHeight;
    ctx.strokeStyle = token("border-strong");
    ctx.globalAlpha = 0.34;
    ctx.beginPath();
    ctx.moveTo(settings.language === "ar" ? 20 : left - 7, y);
    ctx.lineTo(settings.language === "ar" ? total - left + 7 : total - 20, y);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = token("text-secondary");
    ctx.font = "12px " + font;
    text(
      localClock(minuteTime(m), settings),
      settings.language === "ar" ? total - 18 : 18,
      y + 14,
      left - 24,
    );
  }
  for (const [index, date] of dates.entries()) {
    const x = xpos(index),
      align = settings.language === "ar" ? x + width - 11 : x + 10;
    ctx.fillStyle = token("text");
    ctx.font = "700 13px " + font;
    text(
      friendlyDate(date, settings.language, {
        weekday: "short",
        month: "short",
        day: "numeric",
      }),
      align,
      87,
      width - 15,
    );
    ctx.strokeStyle = token("border-strong");
    ctx.globalAlpha = 0.28;
    ctx.beginPath();
    ctx.moveTo(x, 74);
    ctx.lineTo(x, 97 + columnHeight);
    ctx.stroke();
    ctx.globalAlpha = 1;
    for (const [position, item] of blocksOn(state.schedule, date).entries()) {
      const first = Math.max(start, minutesAt(item.start)),
        last = Math.min(end, minutesAt(item.end));
      if (last <= first) continue;
      const top = 97 + ((first - start) / range) * columnHeight,
        h = ((last - first) / range) * columnHeight;
      const color =
        item.color ??
        state.courses.find((course) => course.id === item.courseId)?.color ??
        token("subject-" + (1 + (position % 6)));
      ctx.fillStyle = token("surface");
      ctx.fillRect(x + 3, top + 2, width - 6, Math.max(14, h - 3));
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.16;
      ctx.fillRect(x + 3, top + 2, width - 6, Math.max(14, h - 3));
      ctx.globalAlpha = 1;
      ctx.fillRect(
        settings.language === "ar" ? x + width - 6 : x + 3,
        top + 2,
        3,
        Math.max(14, h - 3),
      );
      ctx.fillStyle = token("text");
      ctx.font = "700 12px " + font;
      text(item.title, align, top + 14, width - 21);
      if (h > 29) {
        ctx.fillStyle = token("text-secondary");
        ctx.font = "11px " + font;
        text(
          item.start +
            "–" +
            item.end +
            (item.location ? " · " + item.location : ""),
          align,
          top + 27,
          width - 21,
        );
      }
    }
  }
  const png = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );
  if (!png) throw new Error("Could not create the schedule image.");
  return new Uint8Array(await png.arrayBuffer());
}
