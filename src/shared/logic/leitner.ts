import type { RecordFor } from "../schema";

const spacing = [1, 2, 4, 8, 16];
export function reviewFormula(
  formula: RecordFor<"formulas">,
  remembered: boolean,
  now: Date,
) {
  const box = remembered ? Math.min(5, formula.leitnerBox + 1) : 1;
  const nextReviewAt = new Date(
    +now + spacing[box - 1]! * 86_400_000,
  ).toISOString();
  return {
    ...formula,
    leitnerBox: box as typeof formula.leitnerBox,
    nextReviewAt,
  };
}
