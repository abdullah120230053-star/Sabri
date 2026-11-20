import { z } from 'zod';

export const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
export const date = z.iso.date();
const instant = z.iso.datetime();
const title = z.string().trim().min(1).max(200);
const id = z.uuid();
const base = { id, createdAt: instant, updatedAt: instant, deletedAt: instant.optional() };
export const weekdays = [0, 1, 2, 3, 4, 5, 6] as const;
const weekday = z.number().int().min(0).max(6);
const color = z.string().regex(/^#[0-9a-f]{6}$/i);
export const priorities = ['urgent', 'high', 'medium', 'low'] as const;
export const taskStatuses = ['todo', 'doing', 'done'] as const;
export const blockKinds = ['lecture', 'lab', 'tutorial', 'exam', 'study', 'other'] as const;
export const eventTypes = ['exam', 'assignment', 'deadline', 'quiz', 'presentation', 'event', 'holiday'] as const;
export const prayers = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'] as const;
export const prayerStatuses = ['pending', 'done', 'late', 'missed'] as const;
export const prayerMethods = ['Egyptian', 'MuslimWorldLeague', 'Karachi', 'UmmAlQura', 'Dubai', 'Qatar', 'Kuwait', 'Turkey', 'NorthAmerica', 'MoonsightingCommittee', 'Singapore', 'Tehran'] as const;
const zone = z.string().max(100).refine((value) => {
  try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; } catch { return false; }
});

export const settingsSchema = z.object({
  theme: z.string().max(80).default('light'),
  language: z.enum(['en', 'ar']).default('en'),
  onboarded: z.boolean().default(false),
  weekStart: weekday.default(6),
  hideFriday: z.boolean().default(true),
  dayStart: time.default('07:00'),
  dayEnd: time.default('22:00'),
  snap: z.union([z.literal(5), z.literal(15), z.literal(30)]).default(15),
  timeFormat: z.enum(['12h', '24h']).default('12h'),
  location: z.object({ city: title, latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180), timezone: zone }).default({ city: 'Cairo', latitude: 30.0444, longitude: 31.2357, timezone: 'Africa/Cairo' }),
  prayer: z.object({
    method: z.enum(prayerMethods).default('Egyptian'),
    madhab: z.enum(['shafi', 'hanafi']).default('shafi'),
    highLatitude: z.enum(['MiddleOfTheNight', 'SeventhOfTheNight', 'TwilightAngle']).default('MiddleOfTheNight'),
    offsets: z.record(z.enum(prayers), z.number().int().min(-120).max(120)).default({ fajr: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 }),
    pauseFocus: z.boolean().default(true),
    ramadan: z.boolean().default(false),
    qada: z.number().int().min(0).default(0)
  }).prefault({}),
  focus: z.object({
    work: z.number().int().min(1).max(120).default(25),
    short: z.number().int().min(1).max(30).default(5),
    long: z.number().int().min(5).max(60).default(15),
    rounds: z.number().int().min(1).max(10).default(4),
    autoBreak: z.boolean().default(false),
    autoWork: z.boolean().default(false),
    strict: z.boolean().default(false),
    quiet: z.boolean().default(false),
    sound: z.enum(['bell', 'soft', 'off']).default('bell'),
    volume: z.number().min(0).max(1).default(0.7),
    dailyGoal: z.number().int().min(1).max(1440).default(240),
    weeklyGoal: z.number().int().min(1).max(10080).default(1200)
  }).prefault({}),
  notifications: z.object({
    enabled: z.boolean().default(true),
    prayerAt: z.boolean().default(true),
    prayerLead: z.number().int().min(0).max(120).default(10),
    classLead: z.number().int().min(0).max(1440).default(15),
    taskLead: z.number().int().min(0).max(1440).default(60),
    habits: z.boolean().default(true),
    daysGoal: time.default('20:00'),
    breakAfter: z.number().int().min(0).max(720).default(120),
    examMode: z.boolean().default(false)
  }).prefault({}),
  gradeMap: z.record(z.string().min(1).max(20), z.number().min(0).max(100)).default({ 'A+': 4, A: 4, 'A-': 3.7, 'B+': 3.3, B: 3, 'B-': 2.7, 'C+': 2.3, C: 2, 'C-': 1.7, D: 1, F: 0 }),
  gpaGoal: z.number().min(0).max(100).default(3.5),
  minimizeToTray: z.boolean().default(true),
  startAtLogin: z.boolean().default(false),
  sidebarCollapsed: z.boolean().default(false),
  hmBar: z.boolean().default(false),
  themeMotion: z.boolean().default(true),
  musicPauseAtPrayer: z.boolean().default(true),
  soundVolumes: z.record(z.string().max(40),z.number().min(0).max(1)).default({}),
  musicLinkFocus: z.boolean().default(false),
  layout: z.string().max(80).default('overview'),
  layoutPerTheme: z.boolean().default(false),
  themeLayouts: z.record(z.string().max(80),z.string().max(80)).default({}),
});
export const gradeComponentSchema = z.object({ id, name: title, weight: z.number().min(0).max(100), maxScore: z.number().positive().max(100000), earnedScore: z.number().min(0).max(100000).optional(), dueDate: date.optional() });
export const courseSchema = z.object({ ...base, name: title, code: z.string().max(30), instructor: z.string().max(120), creditHours: z.number().min(0).max(100), color, semester: z.string().max(80), gradeComponents: z.array(gradeComponentSchema).max(100), finalGrade: z.string().max(20), targetGrade: z.number().min(0).max(100).default(85), absenceLimit: z.number().int().min(0).max(100), absences: z.number().int().min(0).max(1000), order: z.number().default(0) });
export const scheduleFields = z.object({ title, courseId: id.optional(), courseCode: z.string().max(30).default(''), instructor: z.string().max(120).default(''), location: z.string().max(160).default(''), kind: z.enum(blockKinds).default('lecture'), dayOfWeek: weekday, start: time, end: time, recurrence: z.enum(['weekly', 'biweekly', 'once']).default('weekly'), weeks: z.enum(['all', 'odd', 'even']).default('all'), onDate: date.optional(), untilDate:date.optional(), exceptionDates:z.array(date).max(450).default([]), color: color.optional(), notes: z.string().max(3000).default(''), source: z.enum(['manual', 'pdf', 'text', 'html', 'ics', 'csv']).default('manual'), externalUid: z.string().max(1500).optional(), importConfidence: z.number().min(0).max(1).optional() });
export const scheduleSchema = scheduleFields.extend(base).refine((block) => block.start < block.end && (block.recurrence !== 'once' || !!block.onDate), { error: 'Check the date and time range.' });

export const taskSchema = z.object({
  ...base, title, description: z.string().max(6000).default(''), status: z.enum(taskStatuses).default('todo'), completedAt: instant.optional(), priority: z.enum(priorities).default('medium'),
  category: z.string().max(80).default(''), tags: z.array(z.string().max(80)).max(40).default([]), courseId: id.optional(), dueDate: date.optional(), dueTime: time.optional(),
  subtasks: z.array(z.object({ id, title, completed: z.boolean() })).max(100).default([]),
  recurring: z.enum(['daily', 'weekly', 'monthly']).optional(), nextOccurrenceId: id.optional(), order: z.number().default(0), estimated: z.number().int().min(0).max(1000).default(0), pomodoros: z.number().int().min(0).default(0)
});
export const prayerDaySchema = z.object({ ...base, date, status: z.partialRecord(z.enum(prayers), z.enum(prayerStatuses)), congregation: z.partialRecord(z.enum(prayers), z.boolean()).default({}), sunnah: z.partialRecord(z.enum(['duha', 'witr', 'tahajjud', 'rawatib']), z.boolean()).default({}), fasting: z.boolean().default(false), taraweeh: z.boolean().default(false) });
export const phaseSchema = z.enum(['focus', 'short', 'long']);
export const timerSchema = z.object({
  phase: phaseSchema.default('focus'), status: z.enum(['idle', 'running', 'paused']).default('idle'), remainingMs: z.number().min(0).max(86400000).default(1500000), durationMs: z.number().positive().max(86400000).default(1500000),
  round: z.number().int().min(0).default(0), endsAt: z.number().optional(), startedAt: z.number().optional(), taskId: id.optional(), courseId: id.optional()
});
export const timerActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.enum(['toggle', 'reset', 'skip', 'extend', 'tick', 'pause']) }),
  z.object({ type: z.literal('select'), phase: phaseSchema }),
  z.object({ type: z.literal('link'), taskId: id.optional(), courseId: id.optional() })
]);
export const sessionSchema = z.object({ ...base, startedAt: instant, endedAt: instant, type: phaseSchema, plannedMinutes: z.number().nonnegative(), actualMinutes: z.number().nonnegative(), completed: z.boolean(), taskId: id.optional(), courseId: id.optional() });
export const eventFields = z.object({ title, description: z.string().max(8000).default(''), type: z.enum(eventTypes).default('event'), courseId: id.optional(), date, time: time.optional(), endTime: time.optional(), location: z.string().max(160).default(''), reminders: z.array(z.number().int().min(0).max(525600)).max(30).default([]), priority: z.enum(['high', 'medium', 'low']).default('medium'), color: color.optional(), externalUid: z.string().max(1500).optional(), source: z.enum(['manual', 'ics']).default('manual') });
export const eventSchema = eventFields.extend(base);
export const habitSchema = z.object({ ...base, name: title, icon: z.string().max(12), color, category: z.string().max(80), frequency: z.enum(['daily', 'weekly', 'specific_days']), targetDays: z.array(weekday).max(7), targetCount: z.number().min(1).max(100000), unit: z.string().max(30), remindAt: time.optional(), archived: z.boolean(), order: z.number().default(0) });
export const habitLogSchema = z.object({ ...base, habitId: id, date, value: z.number().min(0).max(100000) });
export const noteSchema = z.object({ ...base, title, content: z.string().max(100000), courseId: id.optional(), tags: z.array(z.string().max(80)).max(40), pinned: z.boolean(), color });
export const feedSchema = z.object({ ...base, name: title, provider: z.enum(['moodle', 'classroom', 'ejust', 'zewail', 'other']), host: z.string().max(300), refreshHours: z.number().int().min(0).max(168), updatedFromSourceAt: instant.optional(), destination: z.enum(['calendar', 'schedule']).default('calendar') });
export const quoteSchema = z.object({ ...base, text: z.string().trim().min(1).max(2000), author: z.string().max(200) });
export const soundSchema = z.object({ ...base, name: title, file: z.string().regex(/^[a-f0-9-]{36}\.(mp3|wav|ogg|m4a|flac)$/i), volume: z.number().min(0).max(1) });
export const widgetIds = ['schedule', 'focus', 'prayers', 'tasks', 'quote', 'upcoming', 'stats', 'calendar', 'music', 'habits', 'goal', 'notes', 'clock'] as const;
export const layoutSchema = z.object({ ...base, name: title, widgets: z.array(z.object({ i: z.enum(widgetIds), x: z.number().int().min(0).max(12), y: z.number().int().min(0).max(200), w: z.number().int().min(1).max(4), h: z.number().int().min(1).max(12) })).max(20) });
export const themeSchema = z.object({ ...base, name: title, parent: z.string().max(80), colors: z.record(z.string().regex(/^[a-z][a-z0-9-]*$/), color), radius: z.number().int().min(0).max(32), font: z.enum(['inter', 'manrope', 'arabic']), shadow: z.enum(['none', 'soft', 'strong']), pattern: z.enum(['none', 'dots', 'grid', 'diagonal']) });
export const noticeSchema = z.object({ ...base, title, body: z.string().max(500), kind: z.string().max(40), reference: z.string().max(500) });
export const collections = {
  schedule: scheduleSchema, courses: courseSchema, tasks: taskSchema, prayerDays: prayerDaySchema, sessions: sessionSchema,
  calendar: eventSchema, habits: habitSchema, habitLogs: habitLogSchema, notes: noteSchema, feeds: feedSchema,
  quotes: quoteSchema, sounds: soundSchema, layouts: layoutSchema, themes: themeSchema, notices: noticeSchema
};
export const stateSchema = z.object({
  schemaVersion: z.literal(1).default(1), revision: z.number().int().nonnegative().default(0),
  phoneReceipts: z.array(id).max(2500).default([]),
  settings: settingsSchema.prefault({}), timer: timerSchema.prefault({}), favorites: z.array(z.string().max(200)).max(5000).default([]),
  schedule: z.array(scheduleSchema).default([]), courses: z.array(courseSchema).default([]), tasks: z.array(taskSchema).default([]),
  prayerDays: z.array(prayerDaySchema).default([]), sessions: z.array(sessionSchema).default([]), calendar: z.array(eventSchema).default([]),
  habits: z.array(habitSchema).default([]), habitLogs: z.array(habitLogSchema).default([]), notes: z.array(noteSchema).default([]),
  feeds: z.array(feedSchema).default([]), quotes: z.array(quoteSchema).default([]), sounds: z.array(soundSchema).default([]),
  layouts: z.array(layoutSchema).default([]), themes: z.array(themeSchema).default([]), notices: z.array(noticeSchema).default([])
});
export const patchSchema = z.object({
  changes: z.array(z.object({ collection: z.enum(Object.keys(collections) as [Collection, ...Collection[]]), value: z.unknown() })).max(2000).default([]),
  settings: settingsSchema.optional(), favorites: stateSchema.shape.favorites.optional()
}).superRefine((patch, context) => {
  patch.changes.forEach((change, index) => {
    if (!collections[change.collection].safeParse(change.value).success)
      context.addIssue({ code: 'custom', path: ['changes', index, 'value'], message: 'Invalid record' });
  });
});
export type State = z.infer<typeof stateSchema>;
export type Settings = z.infer<typeof settingsSchema>;
export type Collection = keyof typeof collections;
export type RecordFor<K extends Collection> = State[K][number];
export type Patch = z.infer<typeof patchSchema>;
export type Timer = z.infer<typeof timerSchema>;
export type TimerAction = z.infer<typeof timerActionSchema>;
export type Prayer = typeof prayers[number];
export type PrayerStatus = typeof prayerStatuses[number];
export type Base = z.infer<z.ZodObject<typeof base>>;

export const emptyState = (): State => stateSchema.parse({});
export const stamp = (id: string = crypto.randomUUID(), now = new Date().toISOString()): Base => ({ id, createdAt: now, updatedAt: now });
export const active = <T extends Base>(records: T[]) => records.filter((record) => !record.deletedAt);

export function applyPatch(state: State, patch: Patch, at?: string): State {
  const next = { ...state, settings: patch.settings ?? state.settings, favorites: patch.favorites ?? state.favorites };
  const grouped = Map.groupBy(patch.changes, (change) => change.collection);
  for (const [collection, changes] of grouped) {
    const records = new Map<string, Base>(state[collection].map((item) => [item.id, item]));
    for (const change of changes) {
      const record = collections[collection].parse(change.value);
      const existing = records.get(record.id);
      records.set(record.id, { ...record, createdAt: existing?.createdAt ?? (at ?? record.createdAt), updatedAt: at ?? record.updatedAt, deletedAt: record.deletedAt ? (at ?? record.deletedAt) : undefined });
    }
    Object.assign(next, { [collection]: Array.from(records.values()) });
  }
  return next;
}
