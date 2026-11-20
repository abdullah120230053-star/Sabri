import { active, prayers, type State, type RecordFor } from './schema';
import { addDate, dayKey, dayOf, weekAt } from './time';
type Grade = RecordFor<'courses'>['gradeComponents'][number];

export function gpa(courses: RecordFor<'courses'>[], map: Record<string,number>) {
  let credits=0, points=0;
  for (const course of active(courses)) {
    const grade = map[course.finalGrade];
    if (!Object.hasOwn(map,course.finalGrade) || grade === undefined) continue;
    credits += course.creditHours;points += grade * course.creditHours;
  }
  return { credits,value:credits ? points/credits : null };
}
export function weightedGrade(parts: Grade[], hypothetical?: { id:string; percent:number }) {
  return parts.reduce((value,part) => {
    const rate = hypothetical?.id === part.id ? hypothetical.percent / 100 : (part.earnedScore ?? 0) / part.maxScore;
    return value + Math.min(1, Math.max(0,rate)) * part.weight;
  },0);
}
export function requiredGrade(parts: Grade[],id: string,target: number) {
  const component = parts.find((item) => item.id === id);
  if (!component?.weight) return null;
  return Math.max(0,100 * (target-weightedGrade(parts,{ id,percent:0 }))/component.weight);
}
export function gpaRequirement(courses: RecordFor<'courses'>[],map: Record<string,number>,target: number) {
  const graded = gpa(courses,map);
  const pending = active(courses).filter((course) => !Object.hasOwn(map,course.finalGrade)).reduce((sum,course) => sum+course.creditHours,0);
  if (!pending) return null;
  return Math.max(0, (target*(graded.credits+pending)-(graded.value ?? 0)*graded.credits) / pending);
}
export function habitApplies(habit: RecordFor<'habits'>, date: string,weekStart: number) {
  if (habit.frequency === 'daily') return true;
  if (habit.frequency === 'weekly') return dayOf(date) === (habit.targetDays[0] ?? weekStart);
  return habit.targetDays.includes(dayOf(date));
}
export function habitStreak(habit: RecordFor<'habits'>,logs: RecordFor<'habitLogs'>[],key: string,weekStart: number) {
  const first = habit.createdAt.slice(0,10);
  const completed = new Set(active(logs).filter((log) => log.habitId===habit.id && log.value >= habit.targetCount).map((log) => log.date));
  let streak=0;
  if (!habit.targetDays.length && habit.frequency==='specific_days') return 0;
  for (let cursor=key;cursor>=first;cursor=addDate(cursor,-1)) {
    if (!habitApplies(habit,cursor,weekStart)) continue;
    if (!completed.has(cursor)) { if (cursor===key) continue;break; }
    streak++;
  }
  return streak;
}
export function studyStats(state: State,today: string,days: number | null) {
  const since = days ? addDate(today,1-days) : '0000-01-01';
  const { timezone } = state.settings.location;
  const onDate = (instant: string) => dayKey(new Date(instant),timezone);
  const inside = (date: string) => date >= since && date <= today;
  const sessions = active(state.sessions).filter((session) => session.type==='focus' && inside(onDate(session.endedAt)));
  const daily = new Map<string,number>(),byCourse = new Map<string,number>(),byHour = new Map<string,number>();
  const hours = new Intl.DateTimeFormat('en-GB',{ timeZone:timezone,hour:'2-digit',hourCycle:'h23' });
  for (const session of sessions) {
    const key = onDate(session.endedAt),course = session.courseId ?? '',hour = dayOf(onDate(session.startedAt))+'-'+hours.format(new Date(session.startedAt));
    const total = session.actualMinutes;
    daily.set(key,(daily.get(key) ?? 0)+total);
    byCourse.set(course,(byCourse.get(course) ?? 0)+total);
    byHour.set(hour,(byHour.get(hour) ?? 0)+total);
  }
  const completed = active(state.tasks).filter((task) => task.status==='done' && task.completedAt && inside(onDate(task.completedAt)));
  const withDue = completed.filter((task) => task.dueDate);
  const onTime = withDue.filter((task) => onDate(task.completedAt!) < task.dueDate! || (onDate(task.completedAt!) === task.dueDate && (!task.dueTime || new Intl.DateTimeFormat('en-GB',{ timeZone:timezone,hour:'2-digit',minute:'2-digit',hourCycle:'h23' }).format(new Date(task.completedAt!)) <= task.dueTime)));
  const prayerDays = active(state.prayerDays).filter((day) => inside(day.date));
  const completedPrayers = prayerDays.reduce((sum,day) => sum + prayers.filter((prayer) => day.status[prayer] === 'done' || day.status[prayer] === 'late').length,0);
  const totalMinutes = sessions.reduce((total,session) => total + session.actualMinutes,0);
  const prayerPct = prayerDays.length ? Math.round(100 * completedPrayers/(5*prayerDays.length)):0;
  const week = weekAt(today,state.settings.weekStart);
  const weekMinutes = (from: string,end: string) => active(state.sessions).filter((session) => session.type === 'focus' && onDate(session.endedAt)>=from && onDate(session.endedAt)<=end).reduce((sum,session) => sum+session.actualMinutes,0);
  return { daily,byCourse,byHour,completed:completed.length,onTime:withDue.length ? Math.round(100*onTime.length/withDue.length):null,prayerPct,totalMinutes,sessions:sessions.filter((item) => item.completed).length,
    average:sessions.length ? Math.round(totalMinutes/sessions.length):0,best:[...daily].sort((a,b) => b[1]-a[1])[0]?.[0],thisWeek:weekMinutes(week,today),lastWeek:weekMinutes(addDate(week,-7),addDate(week,-1)) };
}

