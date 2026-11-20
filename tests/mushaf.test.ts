import { describe, expect, it } from 'vitest';
import mushaf from '../src/renderer/data/mushaf.json';
import { emptyState, mushafWerdSchema, stamp } from '../src/shared/schema';
import { completeWerd, dueMushafWerds, werdRange } from '../src/shared/mushaf-werd';

const plan = () => mushafWerdSchema.parse({
  ...stamp(), title: 'After Maghrib', nextPage: 603, pagesPerDay: 4, reminderTime: '19:00', reminderEnabled: true,
});

describe('Mushaf', () => {
  it('contains all pages, surahs, juz boundaries, and ayahs in the source order', () => {
    const verses = mushaf.pages.flat();
    expect(mushaf.pages).toHaveLength(604);
    expect(mushaf.juzPages).toHaveLength(30);
    expect(mushaf.chapters).toHaveLength(114);
    expect(verses).toHaveLength(6236);
    expect(verses[0]?.slice(0, 2)).toEqual([1, 1]);
    expect(verses.at(-1)?.slice(0, 2)).toEqual([114, 6]);
  });

  it('advances once per day and wraps the reading plan after the final page', () => {
    const item = plan();
    expect(werdRange(item)).toEqual({ start: 603, end: 604 });
    const completed = completeWerd(item, '2026-11-20');
    expect(completed.nextPage).toBe(1);
    expect(completed.completedOn).toBe('2026-11-20');
    expect(completeWerd(completed, '2026-11-20')).toBe(completed);
  });

  it('uses Cairo time, catches up later that day, and prevents duplicate alerts', () => {
    const state = emptyState();
    state.mushafWerds = [plan()];
    expect(dueMushafWerds(state, new Date('2026-11-20T16:59:59Z'))).toHaveLength(0);
    const result = dueMushafWerds(state, new Date('2026-11-20T17:30:00Z'));
    expect(result).toHaveLength(1);
    state.notices = [{ ...stamp(), title: 'Mushaf Werd reminder', body: '', kind: 'mushaf-werd', reference: result[0]!.reference }];
    expect(dueMushafWerds(state, new Date('2026-11-20T18:00:00Z'))).toHaveLength(0);
    expect(dueMushafWerds(state, new Date('2026-11-21T17:00:00Z'))).toHaveLength(1);
    state.mushafWerds = [completeWerd(state.mushafWerds[0]!, '2026-11-21')];
    expect(dueMushafWerds(state, new Date('2026-11-21T17:00:00Z'))).toHaveLength(0);
  });
});
