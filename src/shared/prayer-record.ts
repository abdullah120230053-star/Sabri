import { z } from "zod";
import {
  date,
  prayerDaySchema,
  prayers,
  prayerStatuses,
  stamp,
  type State,
} from "./schema";

export const prayerEditSchema = z.object({
  date,
  fields: z.object({
    status: z.partialRecord(z.enum(prayers), z.enum(prayerStatuses)).optional(),
    congregation: z.partialRecord(z.enum(prayers), z.boolean()).optional(),
    sunnah: z
      .partialRecord(
        z.enum(["duha", "witr", "tahajjud", "rawatib"]),
        z.boolean(),
      )
      .optional(),
    fasting: z.boolean().optional(),
    taraweeh: z.boolean().optional(),
  }),
});
export type PrayerEdit = z.infer<typeof prayerEditSchema>;
export function editPrayer(state: State, input: PrayerEdit, now = new Date()) {
  const existing = state.prayerDays.find(
    (day) => day.date === input.date && !day.deletedAt,
  );
  const at = now.toISOString(),
    fields = input.fields;
  const prior =
    existing ??
    prayerDaySchema.parse({
      ...stamp(
        "f050e1e5-b1cb-40ad-bef2-0000" + input.date.replaceAll("-", ""),
        at,
      ),
      date: input.date,
      status: {},
    });
  const updated = {
    ...prior,
    ...fields,
    status: { ...prior.status, ...fields.status },
    congregation: { ...prior.congregation, ...fields.congregation },
    sunnah: { ...prior.sunnah, ...fields.sunnah },
    updatedAt: at,
  };
  return {
    ...state,
    prayerDays: [
      ...state.prayerDays.filter((day) => day.id !== updated.id),
      updated,
    ],
  };
}
