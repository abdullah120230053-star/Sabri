import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { active, type RecordFor } from "../shared/schema";
import { fixedPlanBlocks } from "../shared/logic/planner";
import { minuteTime, minutesAt } from "../shared/time";
import { current, save, tell, useSabri } from "./store";

type Block = RecordFor<"planBlocks">;
type Drag = {
  edge: "move" | "start" | "end";
  x: number;
  width: number;
  start: number;
  end: number;
};

export function PlanTimeline({
  date,
  blocks,
  edit,
}: {
  date: string;
  blocks: Block[];
  edit: (item: Block) => void;
}) {
  const { t, i18n } = useTranslation(),
    settings = useSabri((state) => state.data.settings.planner);
  const from = minutesAt(settings.dayStart),
    to = minutesAt(settings.dayEnd);
  const fixed = fixedPlanBlocks(current(), date);
  const room = Math.max(1, to - from);
  return (
    <section className="plan-timeline" aria-label={t("Plan timeline")}>
      <div className="plan-axis">
        {Array.from({ length: 5 }, (_, index) => {
          const minute = from + Math.round((room * index) / 4);
          return <small key={index}>{minuteTime(minute)}</small>;
        })}
      </div>
      {fixed
        .filter((item) => item.start < to && item.end > from)
        .map((item, index) => (
          <div className="plan-track" key={index}>
            <span
              className="plan-tile plan-fixed"
              style={{
                insetInlineStart:
                  ((Math.max(item.start, from) - from) / room) * 100 + "%",
                width:
                  ((Math.min(item.end, to) - Math.max(item.start, from)) /
                    room) *
                    100 +
                  "%",
              }}
              title={t(item.title)}
            >
              {t(item.title)}
            </span>
          </div>
        ))}
      {blocks
        .filter(
          (item) => minutesAt(item.start) >= from && minutesAt(item.end) <= to,
        )
        .map((item) => (
          <TimelineRow
            key={item.id}
            block={item}
            from={from}
            to={to}
            rtl={i18n.dir() === "rtl"}
            edit={edit}
          />
        ))}
      {(fixed.length > 0 || blocks.length > 0) && (
        <small>
          {t("Drag a study block to move it. Drag either edge to resize.")}
        </small>
      )}
    </section>
  );
}

function TimelineRow({
  block,
  from,
  to,
  rtl,
  edit,
}: {
  block: Block;
  from: number;
  to: number;
  rtl: boolean;
  edit: (item: Block) => void;
}) {
  const { t } = useTranslation();
  const drag = useRef<Drag | null>(null),
    track = useRef<HTMLDivElement>(null);
  const [preview, setPreview] = useState<{ start: number; end: number }>();
  const originalStart = minutesAt(block.start),
    originalEnd = minutesAt(block.end),
    range = to - from;
  const calculate = (position: number, origin: Drag) => {
    const delta =
      Math.round(
        ((position - origin.x) * (rtl ? -1 : 1) * range) / origin.width / 5,
      ) * 5;
    if (origin.edge === "start")
      return {
        start: Math.max(from, Math.min(origin.end - 5, origin.start + delta)),
        end: origin.end,
      };
    if (origin.edge === "end")
      return {
        start: origin.start,
        end: Math.min(to, Math.max(origin.start + 5, origin.end + delta)),
      };
    const start = Math.max(
      from,
      Math.min(to - origin.end + origin.start, origin.start + delta),
    );
    return { start, end: start + origin.end - origin.start };
  };
  const selection = preview ?? { start: originalStart, end: originalEnd };
  return (
    <div ref={track} className="plan-track">
      <button
        type="button"
        className="plan-tile plan-editable"
        style={{
          insetInlineStart: ((selection.start - from) / range) * 100 + "%",
          width: ((selection.end - selection.start) / range) * 100 + "%",
        }}
        aria-label={
          t("Edit") +
          " " +
          (block.title ?? "") +
          " " +
          minuteTime(selection.start)
        }
        title={
          (block.title ?? "") +
          " · " +
          minuteTime(selection.start) +
          "–" +
          minuteTime(selection.end)
        }
        onPointerDown={(event) => {
          if (block.locked || block.status !== "planned" || event.button !== 0)
            return;
          const element = track.current?.getBoundingClientRect();
          if (!element || element.width < 1) return;
          const edge = (event.target as HTMLElement).dataset.resize;
          drag.current = {
            edge: edge === "start" ? "start" : edge === "end" ? "end" : "move",
            x: event.clientX,
            width: element.width,
            start: originalStart,
            end: originalEnd,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (drag.current) setPreview(calculate(event.clientX, drag.current));
        }}
        onPointerCancel={() => {
          drag.current = null;
          setPreview(undefined);
        }}
        onPointerUp={(event) => {
          const origin = drag.current;
          drag.current = null;
          setPreview(undefined);
          if (!origin) return;
          const next = calculate(event.clientX, origin);
          if (next.start === originalStart && next.end === originalEnd) return;
          const state = current();
          const occupied = [
            ...fixedPlanBlocks(state, block.date),
            ...active(state.planBlocks)
              .filter(
                (item) =>
                  item.id !== block.id &&
                  item.date === block.date &&
                  !["skipped", "moved", "buffer"].includes(item.status),
              )
              .map((item) => ({
                start: minutesAt(item.start),
                end: minutesAt(item.end),
              })),
          ];
          if (
            occupied.some(
              (item) => item.start < next.end && item.end > next.start,
            )
          ) {
            tell(t("That time overlaps another block."));
            return;
          }
          void save("planBlocks", {
            ...block,
            start: minuteTime(next.start),
            end: minuteTime(next.end),
          });
        }}
        onDoubleClick={() => edit(block)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            edit(block);
          }
        }}
      >
        {!block.locked && <span aria-hidden="true" data-resize="start" />}
        <span>{t(block.title ?? "Study block")}</span>
        {!block.locked && <span aria-hidden="true" data-resize="end" />}
      </button>
    </div>
  );
}
