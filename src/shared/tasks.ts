import { type State, type RecordFor, stamp, priorities } from './schema';
import { addDate, addMonth, dayOf, dayKey } from './time';

const shorthand = ['sun','mon','tue','wed','thu','fri','sat'];
export function quickTask(text: string, state: State, today = dayKey(new Date(), state.settings.location.timezone)) {
  let priority: RecordFor<'tasks'>['priority'] = 'medium';
  let dueDate: string | undefined;
  let courseId: string | undefined;
  const tags: string[] = [];
  const title = text.split(/\s+/).filter((word) => {
    const lower = word.toLowerCase();
    if (lower.startsWith('!')) {
      const key = lower.slice(1);
      const matched = priorities.find((value, index) => key === value || key === String(index + 1));
      if (matched) { priority = matched; return false; }
    }
    if (lower.startsWith('@')) {
      const value = lower.slice(1), day = shorthand.indexOf(value);
      if (value === 'today') { dueDate = today; return false; }
      if (value === 'tomorrow') { dueDate = addDate(today, 1); return false; }
      if (day >= 0) { dueDate = addDate(today, (day - dayOf(today) + 7) % 7 || 7); return false; }
    }
    if (lower.startsWith('#') && word.length > 1) {
      const tag = word.slice(1, 81);
      const course = state.courses.find((item) => !item.deletedAt && item.code.toLowerCase() === tag.toLowerCase());
      if (course) courseId = course.id; else if (tags.length < 40) tags.push(tag);
      return false;
    }
    return !!word;
  }).join(' ').slice(0, 200);
  return { title, priority, dueDate, courseId, tags };
}
export function taskTransition(task: RecordFor<'tasks'>, status: RecordFor<'tasks'>['status'], state: State, now = new Date()) {
  const updated = { ...task, status, completedAt: status === 'done' ? task.completedAt ?? now.toISOString() : undefined };
  const next = status === 'done' && task.status !== 'done' && task.recurring && !task.nextOccurrenceId;
  if (!next) return [updated];
  const base = task.dueDate ?? dayKey(now, state.settings.location.timezone);
  const dueDate = task.recurring === 'monthly' ? addMonth(base, 1) : addDate(base, task.recurring === 'weekly' ? 7 : 1);
  const repeat = { ...task, ...stamp(), dueDate, status: 'todo' as const, completedAt: undefined, pomodoros: 0, subtasks: task.subtasks.map((subtask) => ({ ...subtask, completed: false })) };
  return [{ ...updated, nextOccurrenceId: repeat.id }, repeat];
}

