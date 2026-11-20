import { expect, it } from 'vitest';
import { addonCollections, assignmentSchema, energyProfileSchema, planBlockSchema } from '../src/shared/addon-schema';
import { applyPatch, emptyState, patchSchema, stamp, stateSchema } from '../src/shared/schema';

it('adds defaults and empty collections when loading an existing snapshot', () => {
  const state = stateSchema.parse({ schemaVersion: 1, revision: 3, settings: { language: 'ar', theme: 'nature' } });
  expect(state.settings).toMatchObject({
    language: 'ar', theme: 'nature',
    planner: { bufferPercent: 15, maxFocusHoursPerDay: 6 },
    examPrep: { reviewSpacingDays: [2, 5], sessionMinutes: 50 },
    integrations: { moodle: { mode: 'ics' }, classroom: { enabled: false } },
    progress: { rewardMode: 'all-unlocked', includeWorship: false },
  });
  for (const collection of Object.keys(addonCollections)) expect(state).toHaveProperty(collection, []);
});

it('applies add-on patches through storage validation and excludes unknown credentials', () => {
  const input = { ...stamp(), type: 'moodle_ics', label: 'My course calendar', enabled: true,
    baseUrl: 'https://example.invalid/moodle', courseMap: [],
    token: 'transient-only', privateCalendarUrl: 'https://example.invalid/calendar?token=private' };
  const patch = patchSchema.parse({ changes: [{ collection: 'lmsConnections', value: input }] });
  const state = applyPatch(emptyState(), patch);
  expect(state.lmsConnections).toHaveLength(1);
  expect(state.lmsConnections[0]).not.toHaveProperty('token');
  expect(state.lmsConnections[0]).not.toHaveProperty('privateCalendarUrl');
  expect(addonCollections.lmsConnections.safeParse({ ...input, baseUrl: input.privateCalendarUrl }).success).toBe(false);
});

it('rejects inverted plan blocks, malformed energy grids, and assignments without an upstream identity', () => {
  expect(planBlockSchema.safeParse({ ...stamp(), date: '2026-11-20', start: '12:00', end: '11:00',
    kind: 'task', locked: false, status: 'planned' }).success).toBe(false);
  expect(energyProfileSchema.safeParse({ ...stamp(), hours: [[0.5]], source: 'preset', sampleCount: 0 }).success).toBe(false);
  expect(assignmentSchema.safeParse({ ...stamp(), courseId: stamp().id, title: 'Report', kind: 'lab',
    status: 'not_started', checklist: [], attachments: [], timeSpentMinutes: 0, source: 'moodle' }).success).toBe(false);
});
