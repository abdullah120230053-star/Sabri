import { useState } from 'react';
import { CalendarDays, ChevronRight, ClipboardList, Clock3, Download, GraduationCap, Moon, Plus, Upload } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { active, eventSchema,eventTypes, prayers,type RecordFor } from '../shared/schema';
import { addDate,addMonth,blocksOn,clock,dateSpan,dayKey,friendlyDate,localClock,weekAt } from '../shared/time';
import { computePrayers } from '../shared/prayer';
import { fresh,remove,save,tell,useSabri } from './store';
import { Button,daysOfWeek,Empty,Field,FormActions,Modal,PageHead,Pager,Panel,Segments,titleCase,useNow } from './ui';

type Event = RecordFor<'calendar'>;
const eventTone = { exam:'rose',assignment:'orange',deadline:'orange',quiz:'lilac',presentation:'blue',event:'blue',holiday:'mint' };
function EventEditor({ initial,close }: { initial: Event;close():void }) {
  const { t } = useTranslation();
  const [event,set] = useState(initial);
  const [reminders,setReminders] = useState(initial.reminders.join(', '));
  const courses = useSabri((s) => s.data.courses);
  const edit = (fields: Partial<Event>) => set({ ...event,...fields });
  return <Modal title={t(initial.title ? 'Edit event':'New event')} close={close}>
    <form className="form-grid" onSubmit={async (e) => {
      e.preventDefault();
      const values = reminders.trim() ? reminders.split(',').map((item) => Number(item.trim())):[];
      if (event.time && event.endTime && event.time>=event.endTime) { tell(t('Check the event time range.'));return; }
      if (await save('calendar',{ ...event,reminders:[...new Set(values)] })) close();
    }}>
      <Field label={t('Title')} wide><input required autoFocus maxLength={200} value={event.title} onChange={(e) => edit({ title:e.target.value })}/></Field>
      <Field label={t('Type')}><select value={event.type} onChange={(e) => { const type=e.target.value as Event['type'];edit({ type });if (type==='exam' && !reminders) setReminders('10080, 1440'); }}>{eventTypes.map((kind) => <option key={kind} value={kind}>{t(titleCase(kind))}</option>)}</select></Field>
      <Field label={t('Date')}><input required type="date" value={event.date} onChange={(e) => edit({ date:e.target.value })}/></Field>
      <Field label={t('Start time')}><input type="time" value={event.time ?? ''} onChange={(e) => edit({ time:e.target.value || undefined })}/></Field>
      <Field label={t('End time')}><input type="time" value={event.endTime ?? ''} onChange={(e) => edit({ endTime:e.target.value || undefined })}/></Field>
      <Field label={t('Course')}><select value={event.courseId ?? ''} onChange={(e) => edit({ courseId:e.target.value||undefined })}><option value="">{t('No course')}</option>{active(courses).map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}</select></Field>
      <Field label={t('Room')}><input maxLength={160} value={event.location} onChange={(e) => edit({ location:e.target.value })}/></Field>
      <Field label={t('Reminder minutes before event')} wide><input value={reminders} placeholder="10080, 1440" pattern="[0-9, ]*" onChange={(e) => setReminders(e.target.value)}/></Field>
      <Field label={t('Description')} wide><textarea maxLength={8000} rows={3} value={event.description} onChange={(e) => edit({ description:e.target.value })}/></Field>
      <FormActions close={close}/>
    </form>
    {initial.title && <div className="modal-secondary"><Button variant="danger" onClick={() => { void remove('calendar',initial);close(); }}>{t('Delete')}</Button></div>}
  </Modal>;
}
export function UpcomingEvents() {
  const { t } = useTranslation(),nav = useNavigate(),state = useSabri((s) => s.data);
  const today = dayKey(useNow(60000),state.settings.location.timezone);
  const events = active(state.calendar).filter((item) => item.date>=today).sort((a,b) => (a.date+a.time).localeCompare(b.date+b.time));
  const exam = events.find((item) => item.type==='exam');
  return <Panel title={t('Upcoming events')} icon={CalendarDays} tone="blue" action={<Button variant="ghost" onClick={() => nav('/calendar')}>{t('View calendar')} <ChevronRight size={15} className="dir-arrow"/></Button>}>
    {exam && <div className="next-prayer"><strong>{exam.title}</strong><span>{t('{{count}} days until exam',{ count:dateSpan(today,exam.date) })}</span></div>}
    {events.length ? events.slice(0,5).map((item) => <div key={item.id} className="data-row"><span className={'tile tile-'+eventTone[item.type]}><CalendarDays size={17}/></span><span className="grow"><strong>{item.title}</strong><small>{friendlyDate(item.date,state.settings.language,{ month:'short',day:'numeric' })}{item.time && ' · '+localClock(item.time,state.settings)}</small></span><span className="pill">{t(titleCase(item.type))}</span></div>) : <Empty compact icon={CalendarDays} title={t('No events yet')}/>}
  </Panel>;
}
export function CalendarPage() {
  const { t } = useTranslation(),nav = useNavigate(),state = useSabri((s) => s.data);
  const { settings } = state;
  const today = dayKey(useNow(60000),settings.location.timezone);
  const [key,setKey] = useState(today);
  const [view,setView] = useState<'month'|'week'|'day'|'agenda'>('month');
  const [event,setEvent] = useState<Event>();
  const [classes,setClasses] = useState(true),[tasks,setTasks] = useState(true),[prayer,setPrayer] = useState(false);
  const events = active(state.calendar).sort((a,b) => (a.date+(a.time ?? '')).localeCompare(b.date+(b.time ?? '')));
  const newEvent = (date: string) => setEvent({ ...eventSchema.parse({ ...fresh(),title:'Event',date,reminders:[] }),title:'' });
  const monthStart = key.slice(0,7)+'-01',from = view==='month' ? weekAt(monthStart,settings.weekStart) : view==='week' ? weekAt(key,settings.weekStart) : key;
  const days = Array.from({ length:view==='month' ? 42 : view==='week' ? 7 : view==='agenda' ? 45 : 1 },(_,index) => addDate(from,index));
  const move = (direction: number) => setKey(view === 'month' ? addMonth(key,direction):addDate(key,direction*(view==='week' ? 7 : view==='agenda' ? 45 : 1)));
  const grouped = (date: string) => {
    const items = events.filter((item) => item.date===date).map((item) => ({ id:item.id,title:item.title,time:item.time ? localClock(item.time,settings):'',tone:eventTone[item.type],icon:GraduationCap,open:() => setEvent(item) }));
    if (classes) for (const item of blocksOn(state.schedule,date)) items.push({ id:item.id,title:item.title,time:localClock(item.start,settings),tone:'lilac',icon:Clock3,open:() => nav('/schedule') });
    if (tasks) for (const item of active(state.tasks).filter((item) => item.dueDate===date)) items.push({ id:item.id,title:item.title,time:item.dueTime ? localClock(item.dueTime,settings):'',tone:'orange',icon:ClipboardList,open:() => nav('/tasks') });
    if (prayer) {
      const times = computePrayers(date,settings);
      for (const name of prayers) if (times[name]) items.push({ id:date+name,title:t(titleCase(name)),time:clock(times[name],settings),tone:'mint',icon:Moon,open:() => nav('/prayers') });
    }
    return items;
  };
  return <>
    <PageHead title={t('Calendar')} description={t('See classes, exams, assignments, and other dates in one place.')} action={<><Button icon={Download} onClick={() => nav('/import')}>{t('Import')}</Button><Button icon={Upload} onClick={() => { void window.sabri.exportCalendar('calendar').catch(() => tell(t('Could not export calendar'))); }}>{t('Export ICS')}</Button><Button variant="primary" icon={Plus} onClick={() => newEvent(key)}>{t('New event')}</Button></>}/>
    <div className="toolbar"><Segments<typeof view> label={t('Calendar view')} value={view} onChange={setView} options={[{ value:'month',label:t('Month') },{ value:'week',label:t('Week') },{ value:'day',label:t('Day') },{ value:'agenda',label:t('Agenda') }]}/><div className="actions"><Button onClick={() => setKey(today)}>{t('Today')}</Button><Pager back={() => move(-1)} forward={() => move(1)}>{friendlyDate(key,settings.language,view==='month' ? { month:'long',year:'numeric' }:{ month:'short',day:'numeric',year:'numeric' })}</Pager></div></div>
    <div className="toolbar"><div className="actions"><label className="check-label"><input type="checkbox" checked={classes} onChange={(e) => setClasses(e.target.checked)}/>{t('Classes')}</label><label className="check-label"><input type="checkbox" checked={tasks} onChange={(e) => setTasks(e.target.checked)}/>{t('Tasks')}</label><label className="check-label"><input type="checkbox" checked={prayer} onChange={(e) => setPrayer(e.target.checked)}/>{t('Prayer times')}</label></div></div>
    {view==='month'||view==='week' ? <section className="panel calendar-shell"><div className="month-grid">
      {Array.from({ length:7 },(_,index) => <strong key={index} className="calendar-day-label">{t(daysOfWeek[(index+settings.weekStart)%7]!)}</strong>)}
      {days.map((date) => { const items = grouped(date);return <div key={date} className={'month-cell '+(date===today?'month-today ':'')+(date.slice(0,7)!==key.slice(0,7)&&view==='month'?'outside':'')}><button className="calendar-number" type="button" title={t('New event')+' '+date} aria-label={t('New event')+' '+date} onClick={() => newEvent(date)}>{friendlyDate(date,settings.language,{ day:'numeric' })}</button>{items.slice(0,view==='month' ? 3:12).map((item) => <button key={item.id} type="button" className={'event-chip tile-'+item.tone} onClick={item.open} title={item.title}>{item.time && <span>{item.time}</span>} {item.title}</button>)}{items.length>(view==='month'?3:12) && <button className="button button-ghost" onClick={() => { setKey(date);setView('day'); }}>{t('See all')}</button>}</div>; })}
    </div></section> : <Panel title={t(view==='agenda' ? 'Agenda':'Day')} icon={CalendarDays}>
      {days.flatMap((date) => { const items=grouped(date);return items.length ? [<section key={date} className="agenda-day"><h3>{friendlyDate(date,settings.language,{ weekday:'long',month:'short',day:'numeric' })}</h3>{items.map((item) => <button key={item.id} className="data-row" onClick={item.open}><span className={'tile tile-'+item.tone}><item.icon size={17}/></span><strong className="grow">{item.title}</strong><span className="muted">{item.time}</span></button>)}</section>]:[]; })}
      {!days.some((date) => grouped(date).length) && <Empty icon={CalendarDays} title={t('No events to show')}/>}
    </Panel>}
    {event && <EventEditor initial={event} close={() => setEvent(undefined)}/>}
  </>;
}

