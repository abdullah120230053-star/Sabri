import type { RecordFor, State } from './schema';
import { atTime, dayKey } from './time';

export const lastMushafPage = 604;
type Werd = RecordFor<'mushafWerds'>;

export function werdRange(werd: Pick<Werd, 'nextPage' | 'pagesPerDay'>) {
  return { start: werd.nextPage, end: Math.min(lastMushafPage, werd.nextPage + werd.pagesPerDay - 1) };
}

export function completeWerd(werd: Werd, today: string): Werd {
  if (werd.completedOn === today) return werd;
  const { end } = werdRange(werd);
  return { ...werd, completedOn: today, nextPage: end === lastMushafPage ? 1 : end + 1 };
}

export function dueMushafWerds(state: State, now: Date) {
  const { timezone } = state.settings.location;
  const today = dayKey(now, timezone);
  const sent = new Set(state.notices.filter((notice) => notice.kind === 'mushaf-werd').map((notice) => notice.reference));
  return state.mushafWerds.flatMap((werd) => {
    if (werd.deletedAt || !werd.reminderEnabled || werd.completedOn === today || +atTime(today, werd.reminderTime, timezone) > +now) return [];
    const reference = werd.id + ':' + today;
    return sent.has(reference) ? [] : [{ werd, reference }];
  });
}
