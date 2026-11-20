import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { addDays, addMonths, format } from 'date-fns';
import type { Settings, RecordFor } from './schema';

export const dayKey = (date = new Date(), zone = 'Africa/Cairo') => formatInTimeZone(date, zone, 'yyyy-MM-dd');
export const calendarDate = (key: string) => new Date(key + 'T12:00:00');
export const addDate = (key: string, days: number) => format(addDays(calendarDate(key), days), 'yyyy-MM-dd');
export const addMonth = (key: string, months: number) => format(addMonths(calendarDate(key), months), 'yyyy-MM-dd');
export const dayOf = (key: string) => calendarDate(key).getDay();
export const weekAt = (key: string, start: number) => addDate(key, -((dayOf(key) - start + 7) % 7));
export const minutesAt = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
export const minuteTime = (min: number) => String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0');
export const atTime = (key: string, time: string, zone: string) => fromZonedTime(key + 'T' + time + ':00', zone);
export const dateSpan = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86400000);
export const clock = (date: Date | string | number, settings: Settings) => new Intl.DateTimeFormat(settings.language, {
  hour: 'numeric', minute: '2-digit', hourCycle: settings.timeFormat === '24h' ? 'h23' : 'h12', timeZone: settings.location.timezone
}).format(new Date(date));
export const localClock = (time: string, settings: Settings) => clock(atTime('2026-01-01', time, settings.location.timezone), settings);
export const friendlyDate = (key: string, language: string, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat(language, { ...options, calendar: 'gregory' }).format(calendarDate(key));
export function blocksOn(blocks: RecordFor<'schedule'>[], key: string) {
  return blocks.filter((block) => {
    if (block.deletedAt) return false;
    if (block.recurrence === 'once') return block.onDate === key;
    if (block.dayOfWeek !== dayOf(key)) return false;
    const monday = weekAt(key, 1);
    const odd = (Math.floor(dateSpan('1970-01-05', monday) / 7) + 2) % 2 === 1;
    if (block.recurrence === 'biweekly' && block.onDate)
      return key >= block.onDate && dateSpan(block.onDate, key) % 14 === 0;
    if (block.recurrence === 'biweekly' && block.weeks === 'all') return odd;
    return block.weeks === 'all' || (block.weeks === 'odd' ? odd : !odd);
  }).sort((a, b) => a.start.localeCompare(b.start));
}

export function conflicts(a: RecordFor<'schedule'>, b: RecordFor<'schedule'>) {
  if (a.id === b.id || a.deletedAt || b.deletedAt || a.dayOfWeek !== b.dayOfWeek || a.start >= b.end || b.start >= a.end) return false;
  if (a.recurrence === 'once') return !!a.onDate && blocksOn([b], a.onDate).length > 0;
  if (b.recurrence === 'once') return !!b.onDate && blocksOn([a], b.onDate).length > 0;
  const anchor = [a.onDate, b.onDate].filter((key): key is string => !!key).sort().at(-1) ?? '2026-01-04';
  const first = addDate(anchor, (a.dayOfWeek - dayOf(anchor) + 7) % 7);
  return [first, addDate(first, 7)].some((key) => blocksOn([a, b], key).length === 2);
}

export function freeWindows(blocks: RecordFor<'schedule'>[], key: string, start: string, end: string, minimum: number) {
  const limit = minutesAt(end);
  let cursor = minutesAt(start);
  const gaps: { start: string; end: string }[] = [];
  for (const block of blocksOn(blocks, key)) {
    const next = Math.min(minutesAt(block.start), limit);
    if (next - cursor >= minimum) gaps.push({ start: minuteTime(cursor), end: minuteTime(next) });
    cursor = Math.max(cursor, minutesAt(block.end));
  }
  if (limit - cursor >= minimum) gaps.push({ start: minuteTime(cursor), end });
  return gaps;
}

