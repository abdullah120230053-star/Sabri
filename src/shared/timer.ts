import { type State, type Timer, type TimerAction, type Settings, type RecordFor, stamp } from './schema';

const duration = (phase: Timer['phase'], settings: Settings) => {
  const key = phase === 'focus' ? 'work' : phase;
  return settings.focus[key] * 60000;
};
export function remaining(timer: Timer, now: number) {
  return timer.status === 'running' && timer.endsAt !== undefined ? Math.max(0, timer.endsAt - now) : timer.remainingMs;
}
function prepared(timer: Timer, phase: Timer['phase'], settings: Settings): Timer {
  const ms = duration(phase, settings);
  return { ...timer, phase, status: 'idle', remainingMs: ms, durationMs: ms, endsAt: undefined, startedAt: undefined };
}
function start(timer: Timer, now: number): Timer {
  return { ...timer, status: 'running', endsAt: now + timer.remainingMs, startedAt: timer.startedAt ?? now };
}
function finish(state: State, now: number, completed: boolean, started: boolean) {
  const { timer, settings } = state;
  const round = timer.round + Number(timer.phase === 'focus' && completed);
  const phase = timer.phase === 'focus' ? round > 0 && round % settings.focus.rounds === 0 ? 'long' : 'short' : 'focus';
  let nextTimer = prepared({ ...timer, round }, phase, settings);
  if (completed && (phase === 'focus' ? settings.focus.autoWork : settings.focus.autoBreak))
    nextTimer = start(nextTimer, now);
  if (!started || timer.startedAt === undefined) return { ...state, timer: nextTimer };
  const ended = new Date(now).toISOString();
  const session: RecordFor<'sessions'> = { ...stamp(undefined, ended), startedAt: new Date(timer.startedAt).toISOString(), endedAt: ended, type: timer.phase,
    plannedMinutes: timer.durationMs / 60000, actualMinutes: (timer.durationMs - remaining(timer, now)) / 60000, completed, taskId: timer.taskId, courseId: timer.courseId };
  return { ...state, timer: nextTimer, sessions: [...state.sessions, session],
    tasks: completed && timer.phase === 'focus' ? state.tasks.map((item) => item.id === timer.taskId ? { ...item, updatedAt: ended, pomodoros: item.pomodoros + 1 } : item) : state.tasks };
}
export function moveTimer(initial: State, action: TimerAction, now = Date.now()): State {
  let state = initial;
  if (state.timer.status === 'running' && state.timer.endsAt !== undefined && state.timer.endsAt <= now)
    state = finish(state, state.timer.endsAt, true, true);
  const { timer, settings } = state;
  if (action.type === 'tick') return state;
  if (action.type === 'link') return { ...state, timer: { ...timer, taskId: action.taskId, courseId: action.courseId } };
  if (action.type === 'select') {
    if (timer.status !== 'idle') return state;
    return { ...state, timer: prepared(timer, action.phase, settings) };
  }
  if (action.type === 'skip' || action.type === 'reset') {
    if (settings.focus.strict && timer.phase === 'focus' && timer.status !== 'idle') return state;
    if (action.type === 'skip') return finish(state, now, false, timer.status !== 'idle');
    const reset = timer.status === 'idle' ? state : finish(state, now, false, true);
    return { ...reset, timer: prepared(timer, timer.phase, settings) };
  }
  if (action.type === 'extend') {
    if (timer.durationMs > 86100000) return state;
    return { ...state, timer: { ...timer, durationMs: timer.durationMs + 300000, remainingMs: timer.remainingMs + 300000, endsAt: timer.endsAt === undefined ? undefined : timer.endsAt + 300000 } };
  }
  if (timer.status === 'running') return { ...state, timer: { ...timer, status: 'paused', remainingMs: remaining(timer, now), endsAt: undefined } };
  if (action.type === 'pause') return state;
  return { ...state, timer: start(timer, now) };
}
export function timerLabel(milliseconds: number) {
  const seconds = Math.ceil(milliseconds / 1000);
  return [Math.floor(seconds / 60), seconds % 60].map((value) => String(value).padStart(2, '0')).join(':');
}

