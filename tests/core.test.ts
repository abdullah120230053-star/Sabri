import { describe, expect, it } from 'vitest';
import { emptyState, scheduleSchema, stamp, taskSchema } from '../src/shared/schema';
import { computePrayers } from '../src/shared/prayer';
import { conflicts, freeWindows } from '../src/shared/time';
import { moveTimer, remaining } from '../src/shared/timer';
import { quickTask, taskTransition } from '../src/shared/tasks';
import { accessibleTheme, themes } from '../src/renderer/themes';

describe('themes', () => {
  it.each(themes)('$name meets key contrast thresholds', (theme) => { expect(accessibleTheme(theme)).toBe(true); });
});
describe('schedule', () => {
  const slot = (start: string,end: string) => scheduleSchema.parse({ ...stamp(),title:'Class',dayOfWeek:1,start,end });
  it('checks strict overlaps and free windows', () => {
    expect(conflicts(slot('09:00','10:00'),slot('09:45','11:00'))).toBe(true);
    expect(conflicts(slot('09:00','10:00'),slot('10:00','11:00'))).toBe(false);
    expect(freeWindows([slot('09:00','10:00'),slot('09:45','11:00')],'2026-11-16','08:00','12:00',60)).toEqual([{ start:'08:00',end:'09:00' },{ start:'11:00',end:'12:00' }]);
  });
});
describe('prayer times in Cairo', () => {
  it('calculates five ordered prayers and sunrise offline', () => {
    const times = computePrayers('2026-11-20',emptyState().settings);
    const ordered = [times.fajr,times.sunrise,times.dhuhr,times.asr,times.maghrib,times.isha];
    expect(ordered).toEqual(ordered.slice().sort());
    expect(times.dhuhr).toMatch(/^2026-11-20T09:/);
  });
  it('preserves the local date around Egyptian DST and applies offsets', () => {
    const settings = emptyState().settings;
    const key = '2026-04-24';
    const original = computePrayers(key,settings);
    settings.prayer.offsets.fajr = 12;
    expect(Date.parse(computePrayers(key,settings).fajr)-Date.parse(original.fajr)).toBe(12*60000);
    const format = new Intl.DateTimeFormat('en',{ timeZone:settings.location.timezone,timeZoneName:'shortOffset' });
    expect(format.format(new Date('2026-04-23T12:00Z'))).toContain('GMT+2');
    expect(format.format(new Date('2026-04-25T12:00Z'))).toContain('GMT+3');
  });
});
describe('focus state machine', () => {
  it('keeps elapsed time across minimization and tracks linked work', () => {
    const initial = emptyState();
    const task = taskSchema.parse({ ...stamp(),title:'Lab' });
    initial.tasks.push(task);
    const withTask = moveTimer(initial,{ type:'link',taskId:task.id },0);
    const running = moveTimer(withTask,{ type:'toggle' },0);
    const paused = moveTimer(running,{ type:'toggle' },600000);
    expect(remaining(paused.timer,800000)).toBe(900000);
    const resumed = moveTimer(paused,{ type:'toggle' },800000);
    const ended = moveTimer(resumed,{ type:'tick' },1800000);
    expect(ended.sessions[0]?.actualMinutes).toBe(25);
    expect(ended.tasks[0]?.pomodoros).toBe(1);
    expect(ended.timer.phase).toBe('short');
  });
});
describe('tasks', () => {
  it('parses shortcuts and schedules one next occurrence', () => {
    const state = emptyState();
    const parsed = quickTask('Finish lab !1 #school @tomorrow',state,'2026-11-20');
    expect(parsed).toMatchObject({ title:'Finish lab',priority:'urgent',dueDate:'2026-11-21',tags:['school'] });
    const task = taskSchema.parse({ ...stamp(),...parsed,recurring:'weekly' });
    const [done,next] = taskTransition(task,'done',state);
    expect(next?.dueDate).toBe('2026-11-28');
    expect(taskTransition(done!,'done',state)).toHaveLength(1);
  });
});
