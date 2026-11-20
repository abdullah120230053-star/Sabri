import { z } from "zod";
import { computePrayers } from "../shared/prayer";
import { prayers, settingsSchema, time, type Settings } from "../shared/schema";
import { atTime } from "../shared/time";

const methods: Record<Settings["prayer"]["method"], number> = {
  Egyptian: 5,
  MuslimWorldLeague: 3,
  Karachi: 1,
  UmmAlQura: 4,
  Dubai: 16,
  Qatar: 10,
  Kuwait: 9,
  Turkey: 13,
  NorthAmerica: 2,
  MoonsightingCommittee: 15,
  Singapore: 11,
  Tehran: 7,
};
const adjustment: Record<Settings["prayer"]["highLatitude"], number> = {
  MiddleOfTheNight: 1,
  SeventhOfTheNight: 2,
  TwilightAngle: 3,
};
const aladhanData = z.object({
  data: z.object({ timings: z.record(z.string(), z.string()) }),
});

export async function prayerComparison(date: string, settings: Settings) {
  const offsets = settings.prayer.offsets;
  const coordinates = settings.location;
  const params = new URLSearchParams({
    latitude: String(coordinates.latitude),
    longitude: String(coordinates.longitude),
    timezonestring: coordinates.timezone,
    method: String(methods[settings.prayer.method]),
    school: settings.prayer.madhab === "hanafi" ? "1" : "0",
    latitudeAdjustmentMethod: String(adjustment[settings.prayer.highLatitude]),
    tune: [
      0,
      offsets.fajr,
      0,
      offsets.dhuhr,
      offsets.asr,
      offsets.maghrib,
      0,
      offsets.isha,
      0,
    ].join(","),
  });
  const response = await fetch(
    "https://api.aladhan.com/v1/timings/" +
      date.split("-").reverse().join("-") +
      "?" +
      params,
    { signal: AbortSignal.timeout(10000), redirect: "error" },
  );
  if (!response.ok) throw new Error("AlAdhan unavailable.");
  const {
    data: { timings },
  } = aladhanData.parse(await response.json());
  const offline = computePrayers(date, settings);
  return prayers.flatMap((name) => {
    const label = name.charAt(0).toUpperCase() + name.slice(1);
    const value = time.safeParse(timings[label]?.slice(0, 5));
    if (!value.success || !offline[name]) return [];
    const remote = atTime(date, value.data, coordinates.timezone).toISOString();
    return [
      {
        name,
        local: offline[name],
        remote,
        minutes: Math.round(
          (Date.parse(remote) - Date.parse(offline[name])) / 60000,
        ),
      },
    ];
  });
}
export async function approximateLocation(): Promise<Settings["location"]> {
  const response = await fetch("https://ipapi.co/json/", {
    signal: AbortSignal.timeout(8000),
    redirect: "error",
  });
  if (!response.ok) throw new Error("Location unavailable.");
  const result = z
    .object({
      city: z.string().min(1).max(200),
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
      timezone: z.string().max(100),
    })
    .parse(await response.json());
  return settingsSchema.shape.location.parse(result);
}
