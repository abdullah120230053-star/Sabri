import { Notification } from 'electron';
import { computePrayers } from '../shared/prayer';
import { active, prayers, stamp, type State } from '../shared/schema';
import { addDate, atTime, blocksOn, dayKey } from '../shared/time';
import { moveTimer,remaining } from '../shared/timer';
import { Storage } from './storage';

type Notice = Omit<State['notices'][number], keyof ReturnType<typeof stamp>>;
const strings = {
  en: { prayer: 'Prayer', upcoming: 'Coming up', focus: 'Focus session complete', break: 'Break complete', class: 'Class reminder', task: 'Task reminder', event: 'Calendar reminder', habit: 'Habit reminder', goal: 'Time for your study goal', pause: 'Take a short break', fajr: 'Fajr', dhuhr: 'Dhuhr', asr: 'Asr', maghrib: 'Maghrib', isha: 'Isha' },
  ar: { prayer: 'الصلاة', upcoming: 'قريبًا', focus: 'انتهت جلسة التركيز', break: 'انتهت الاستراحة', class: 'تذكير بالمحاضرة', task: 'تذكير بالمهمة', event: 'تذكير بالتقويم', habit: 'تذكير بالعادة', goal: 'حان وقت هدف الدراسة', pause: 'خذ استراحة قصيرة', fajr: 'الفجر', dhuhr: 'الظهر', asr: 'العصر', maghrib: 'المغرب', isha: 'العشاء' }
};
export function runScheduler(storage: Storage, show: () => void, refreshTray: () => void) {
  let lastTick = Date.now() - 1000;
  let busy = false;
  const interval = setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      const now = Date.now();
      const since = Math.max(lastTick, now - 90000);
      const previous = storage.state;
      const { settings } = previous;
      const translator = strings[settings.language];
      const zone = settings.location.timezone;
      const today = dayKey(new Date(now), zone);
      const candidates: Notice[] = [];
      const due = (timestamp: Date | string | number, lead: number, item: Notice) => {
        const time = +new Date(timestamp) - lead * 60000;
        if (since < time && now >= time) candidates.push(item);
      };
      const quiet = settings.notifications.examMode || (settings.focus.quiet && previous.timer.status === 'running' && previous.timer.phase === 'focus');
      let pause = false;
      const times = computePrayers(today, settings);
      for (const name of prayers) {
        const time = times[name];
        if (since < Date.parse(time) && Date.parse(time) <= now) pause ||= settings.prayer.pauseFocus;
        if (settings.notifications.prayerAt)
          due(time, 0, { title: translator.prayer, body: translator[name], kind: 'prayer', reference: today + name });
        if (settings.notifications.prayerLead > 0)
          due(time, settings.notifications.prayerLead, { title: translator.upcoming, body: translator[name], kind: 'prayer', reference: today + name + 'lead' });
      }
      for (const key of [today, addDate(today, 1)]) {
        for (const block of blocksOn(previous.schedule, key))
          due(atTime(key, block.start, zone), settings.notifications.classLead, { title: translator.class, body: block.title, kind: 'class', reference: block.id + key });
      }
      if (!quiet) {
        for (const task of active(previous.tasks)) if (task.status !== 'done' && task.dueDate)
          due(atTime(task.dueDate, task.dueTime ?? '23:59', zone), settings.notifications.taskLead, { title: translator.task, body: task.title, kind: 'task', reference: task.id });
        for (const habit of active(previous.habits)) if (!habit.archived && habit.remindAt && settings.notifications.habits)
          due(atTime(today, habit.remindAt, zone), 0, { title: translator.habit, body: habit.name, kind: 'habit', reference: habit.id + today });
        const focused = active(previous.sessions).filter((item) => item.type === 'focus' && dayKey(new Date(item.endedAt), zone) === today).reduce((sum, session) => sum + session.actualMinutes, 0);
        if (focused < settings.focus.dailyGoal)
          due(atTime(today, settings.notifications.daysGoal, zone), 0, { title: translator.goal, body: '', kind: 'goal', reference: today });
      }
      for (const event of active(previous.calendar))
        for (const lead of event.reminders)
          due(atTime(event.date, event.time ?? '09:00', zone), lead, { title: translator.event, body: event.title, kind: 'event', reference: event.id + lead });
      if (!quiet && settings.notifications.breakAfter>0 && previous.timer.phase==='focus' && previous.timer.status==='running') {
        const goal=settings.notifications.breakAfter*60000,elapsed=previous.timer.durationMs-remaining(previous.timer,now);
        if (elapsed>=goal && elapsed-(now-since)<goal) candidates.push({ title:translator.pause,body:'',kind:'break',reference:String(previous.timer.startedAt) });
      }
      const ended = previous.timer.status === 'running' && (previous.timer.endsAt ?? Infinity) <= now;
      if (ended) candidates.push({ title: previous.timer.phase === 'focus' ? translator.focus : translator.break, body: '', kind: 'focus', reference: String(previous.timer.endsAt) });
      const newNotices = candidates.filter((item) => !previous.notices.some((notice) => notice.kind === item.kind && notice.reference === item.reference));
      if (ended || pause || (newNotices.length && settings.notifications.enabled)) {
        await storage.update((state) => {
          let next = moveTimer(state, { type: 'tick' }, now);
          if (pause && next.timer.phase === 'focus') next = moveTimer(next, { type: 'pause' }, now);
          if (state.settings.notifications.enabled && newNotices.length)
            next = { ...next, notices: [...next.notices, ...newNotices.map((item) => ({ ...stamp(), ...item }))].slice(-250) };
          return next;
        });
        if (settings.notifications.enabled && Notification.isSupported()) for (const item of newNotices) {
          const notification = new Notification({ title: item.title, body: item.body, silent: item.kind === 'focus' });
          notification.once('click', show);
          notification.show();
        }
      }
      lastTick = now;
      refreshTray();
    } catch (error) {
      console.error('Sabri scheduler failed', error);
    } finally { busy = false; }
  }, 1000);
  return () => clearInterval(interval);
}
