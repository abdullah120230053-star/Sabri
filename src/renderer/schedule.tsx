import { useState, type CSSProperties, type PointerEvent } from 'react';
import { CalendarDays, ChevronRight, Clock3, Download, Plus, TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { active, blockKinds, scheduleSchema, prayers, type RecordFor } from '../shared/schema';
import { addDate, blocksOn, conflicts, dayKey, dayOf, freeWindows, friendlyDate, localClock, minuteTime, minutesAt, weekAt } from '../shared/time';
import { computePrayers } from '../shared/prayer';
import { scheduleImage } from './schedule-image';
import { fresh, remove, save, useSabri, tell } from './store';
import { Button, daysOfWeek, Empty, Field, FormActions, Modal, PageHead, Pager, Panel, Segments, titleCase, useNow } from './ui';

type Slot = RecordFor<'schedule'>;
type Draft = Partial<Slot> & Pick<Slot, 'dayOfWeek' | 'start' | 'end'>;
const subject = (index: number) => 'var(--subject-' + (index % 6 + 1) + ')';

function SlotEditor({ draft, close }: { draft: Draft; close(): void }) {
  const { t } = useTranslation();
  const data = useSabri((s) => s.data);
  const [slot, set] = useState(draft);
  const courses = active(data.courses);
  const update = (fields: Partial<Slot>) => set({ ...slot, ...fields });
  const value = scheduleSchema.safeParse({ ...fresh(), ...slot, id:slot.id ?? crypto.randomUUID(), title:slot.title ?? '' });
  const overlap = value.success && data.schedule.some((other) => conflicts(value.data, other));
  return <Modal title={t(slot.id ? 'Edit class' : 'Add class')} close={close}>
    <form className="form-grid" onSubmit={async (event) => {
      event.preventDefault();
      if (!value.success) { tell(t('Check the class date and time range.')); return; }
      if (await save('schedule', value.data)) close();
    }}>
      <Field label={t('Title')} wide><input autoFocus required maxLength={200} value={slot.title ?? ''} onChange={(e) => update({ title:e.target.value })}/></Field>
      <Field label={t('Course')}><select value={slot.courseId ?? ''} onChange={(e) => { const course = courses.find((item) => item.id === e.target.value); update({ courseId:course?.id, courseCode:course?.code ?? slot.courseCode, title:slot.title || course?.name, color:course?.color ?? slot.color }); }}><option value="">{t('No course')}</option>{courses.map((course) => <option key={course.id} value={course.id}>{course.code} {course.name}</option>)}</select></Field>
      <Field label={t('Type')}><select value={slot.kind ?? 'lecture'} onChange={(e) => update({ kind:blockKinds.find((v) => v === e.target.value) })}>{blockKinds.map((kind) => <option key={kind} value={kind}>{t(titleCase(kind))}</option>)}</select></Field>
      <Field label={t('Day')}><select value={slot.dayOfWeek} onChange={(e) => update({ dayOfWeek:+e.target.value })}>{daysOfWeek.map((day,index) => <option key={day} value={index}>{t(day)}</option>)}</select></Field>
      <Field label={t('Recurrence')}><select value={slot.recurrence ?? 'weekly'} onChange={(e) => { const recurrence = e.target.value as Slot['recurrence']; update({ recurrence, onDate:recurrence === 'once' ? slot.onDate ?? dayKey(new Date(), data.settings.location.timezone) : slot.onDate }); }}><option value="weekly">{t('Weekly')}</option><option value="biweekly">{t('Biweekly')}</option><option value="once">{t('Once')}</option></select></Field>
      {slot.recurrence === 'once' && <Field label={t('Date')} wide><input required type="date" value={slot.onDate ?? ''} onChange={(e) => update({ onDate:e.target.value,dayOfWeek:dayOf(e.target.value) })}/></Field>}
      <Field label={t('Start time')}><input required type="time" value={slot.start} onChange={(e) => update({ start:e.target.value })}/></Field>
      <Field label={t('End time')}><input required type="time" value={slot.end} onChange={(e) => update({ end:e.target.value })}/></Field>
      <Field label={t('Room')}><input maxLength={160} value={slot.location ?? ''} onChange={(e) => update({ location:e.target.value })}/></Field>
      <Field label={t('Instructor')}><input maxLength={120} value={slot.instructor ?? ''} onChange={(e) => update({ instructor:e.target.value })}/></Field>
      <Field label={t('Color')}><input type="color" value={slot.color ?? '#7355c8'} onChange={(e) => update({ color:e.target.value })}/></Field>
      <Field label={t('Notes field')} wide><textarea rows={2} maxLength={3000} value={slot.notes ?? ''} onChange={(e) => update({ notes:e.target.value })}/></Field>
      {overlap && <p className="warning wide"><TriangleAlert size={16}/>{t('Schedule overlap')}</p>}
      <FormActions close={close}/>
    </form>
    {slot.id && <div className="modal-secondary"><Button onClick={() => set({ ...slot,...fresh(),id:undefined })}>{t('Duplicate')}</Button><Button variant="danger" onClick={() => { if (value.success) { void remove('schedule',value.data); close(); } }}>{t('Delete')}</Button></div>}
  </Modal>;
}

export function TodaySchedule({ dense = false }: { dense?: boolean }) {
  const { t } = useTranslation();
  const navigation = useNavigate();
  const state = useSabri((s) => s.data);
  const key = dayKey(useNow(60000),state.settings.location.timezone);
  const blocks = blocksOn(state.schedule,key);
  return <Panel title={t('Today’s schedule')} icon={CalendarDays} action={<Button variant="ghost" onClick={() => navigation('/schedule')}>{t('View schedule')} <ChevronRight className="dir-arrow" size={15}/></Button>}>
    {blocks.length ? <div className="timeline">{blocks.slice(0,dense ? 3 : 5).map((block,index) => <div className="timeline-row" key={block.id} style={{ '--item-color':block.color ?? state.courses.find((course) => course.id === block.courseId)?.color ?? subject(index) } as CSSProperties}>
      <div className="timeline-time">{localClock(block.start,state.settings)}<small>{localClock(block.end,state.settings)}</small></div><div className="timeline-mark"/><div className="timeline-body"><strong>{block.title}</strong><small>{[block.courseCode || t(titleCase(block.kind)),block.location].filter(Boolean).join(' · ')}</small></div>
    </div>)}</div> : <Empty compact icon={CalendarDays} title={t('No classes today')} detail={t('Add a class or import your university timetable.')} action={<Button onClick={() => navigation('/schedule?add=1')} icon={Plus}>{t('Add class')}</Button>}/>}
  </Panel>;
}

export function SchedulePage() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const [params,setParams] = useSearchParams();
  const { settings,schedule,courses } = useSabri((s) => s.data);
  const now = useNow(60000), today = dayKey(now,settings.location.timezone);
  const [key,setKey] = useState(today);
  const [view,setView] = useState<'week'|'day'|'list'>('week');
  const [draft,setDraft] = useState<Draft>();
  const [overlay,setOverlay] = useState(false);
  const [gapSize,setGapSize] = useState(45);
  const [showFree,setShowFree] = useState(false);
  const [studyCourse,setStudyCourse] = useState('');
  const [preview,setPreview] = useState<Slot>();
  const start = minutesAt(settings.dayStart), end = Math.max(start + 30,minutesAt(settings.dayEnd));
  const range = end - start, height = Math.max(560,range * 0.86);
  const from = weekAt(key,settings.weekStart);
  const days = Array.from({ length:7 },(_,index) => addDate(from,index)).filter((date) => !settings.hideFriday || dayOf(date) !== 5);
  const blocks = active(schedule);
  const openAt = (date: string, minute = 540) => setDraft({ dayOfWeek:dayOf(date),onDate:date,start:minuteTime(Math.min(minute,1379)),end:minuteTime(Math.min(minute+60,1439)) });
  function drag(event: PointerEvent<HTMLElement>,block: Slot,date: string,edge: 'move'|'top'|'bottom') {
    if (event.button !== 0) return;
    event.stopPropagation();
    let next = block, moved = false;
    const y = event.clientY, x = event.clientX;
    const move = (cursor: globalThis.PointerEvent) => {
      const dy = cursor.clientY - y;
      if (!moved && Math.abs(dy) + Math.abs(cursor.clientX - x) < 6) return;
      moved = true;
      const step = Math.round(dy / height * range / settings.snap) * settings.snap;
      const first = minutesAt(block.start),last = minutesAt(block.end);
      const column = document.elementFromPoint(cursor.clientX,cursor.clientY)?.closest<HTMLElement>('[data-schedule-date]');
      const destination = edge === 'move' ? column?.dataset.scheduleDate ?? date : date;
      const shifted = Math.max(-first,Math.min(1439-last,step));
      const newStart = edge === 'move' ? first+shifted : edge === 'top' ? Math.max(0,Math.min(last-settings.snap,first+step)) : first;
      const newEnd = edge === 'move' ? last+shifted : edge === 'bottom' ? Math.min(1439,Math.max(first+settings.snap,last+step)) : last;
      next = { ...block,start:minuteTime(newStart),end:minuteTime(newEnd),dayOfWeek:dayOf(destination),onDate:block.recurrence === 'weekly' ? block.onDate : destination };
      setPreview(next);
    };
    const release = () => {
      window.removeEventListener('pointermove',move);
      window.removeEventListener('pointerup',done);
      window.removeEventListener('pointercancel',release);
      setPreview(undefined);
    };
    const done = () => {
      release();
      if (moved) void save('schedule',next).then((ok) => { if (ok) tell(t('Saved'),() => { void save('schedule',block); }); });
      else if (edge === 'move') setDraft(block);
    };
    window.addEventListener('pointermove',move);
    window.addEventListener('pointerup',done);
    window.addEventListener('pointercancel',release);
  }
  const localMinutes = (iso: string) => minutesAt(new Intl.DateTimeFormat('en-GB',{ timeZone:settings.location.timezone,hour:'2-digit',minute:'2-digit',hourCycle:'h23' }).format(new Date(iso)));
  const list = view === 'day' ? blocksOn(blocks,key) : blocks;
  return <>
    <PageHead title={t('Schedule')} description={t('Plan your classes and find time to study.')} action={<><Button icon={Download} onClick={() => nav('/import')}>{t('Import timetable')}</Button><Button variant="primary" icon={Plus} onClick={() => openAt(key)}>{t('Add class')}</Button></>}/>
    <div className="toolbar"><Segments label={t('Schedule')} value={view} onChange={(value) => setView(value)} options={[{ value:'week',label:t('Weekly grid') },{ value:'day',label:t('Day agenda') },{ value:'list',label:t('List') }]}/>
      <div className="actions"><Button onClick={() => setKey(today)}>{t('Today')}</Button><Pager back={() => setKey(addDate(key,view === 'week' ? -7 : -1))} forward={() => setKey(addDate(key,view === 'week' ? 7 : 1))}>{friendlyDate(view === 'week' ? from : key,settings.language,{ month:'short',day:'numeric',year:'numeric' })}</Pager></div></div>
    <div className="toolbar"><div className="actions"><label className="check-label"><input type="checkbox" checked={overlay} onChange={(e) => setOverlay(e.target.checked)}/>{t('Prayer overlay')}</label><Button onClick={() => setShowFree(!showFree)}>{t('Find study time')}</Button></div><Button onClick={() => { void window.sabri.print(); }}>{t('Print / PDF')}</Button><Button onClick={() => { void window.sabri.exportCalendar('schedule').catch(() => tell(t('Could not export calendar'))); }}>{t('Export ICS')}</Button><Button onClick={() => { void window.sabri.exportCalendar('csv').catch(() => tell(t('Could not export calendar'))); }}>{t('Export CSV')}</Button><Button onClick={()=>{void scheduleImage(useSabri.getState().data,from).then(window.sabri.saveScheduleImage).catch(()=>tell(t('Could not export schedule image')));}}>{t('Export PNG')}</Button></div>
    {showFree && <Panel title={t('Free time')} icon={Clock3}><div className="actions"><Field label={t('Minimum minutes')}><input type="number" min={15} max={240} value={gapSize} onChange={(e) => setGapSize(Math.max(15,+e.target.value))}/></Field><Field label={t('Study course')}><select value={studyCourse} onChange={(e)=>setStudyCourse(e.target.value)}><option value="">{t('No course')}</option>{active(courses).map((course)=><option key={course.id} value={course.id}>{course.name}</option>)}</select></Field>{freeWindows(blocks,key,settings.dayStart,settings.dayEnd,gapSize).map((gap) => <Button key={gap.start} onClick={() => setDraft({ ...gap,dayOfWeek:dayOf(key),onDate:key,recurrence:'once',kind:'study',courseId:studyCourse || undefined,title:active(courses).find((course)=>course.id===studyCourse)?.name ?? t('Study block') })}>{gap.start}–{gap.end}</Button>)}</div></Panel>}
    {view === 'week' ? <section className="panel schedule-panel"><div className="timetable" style={{ '--day-count':days.length } as CSSProperties}>
      <div className="schedule-day"><Clock3 size={17}/></div>{days.map((date) => <div key={date} className={'schedule-day '+(today === date ? 'is-today':'')}><span>{friendlyDate(date,settings.language,{ weekday:'short' })}</span><strong>{friendlyDate(date,settings.language,{ day:'numeric' })}</strong></div>)}
      <div className="schedule-axis" style={{ height }}>{Array.from({ length:Math.ceil(range/60) },(_,i) => <span key={i} style={{ top:i*60/range*100+'%' }}>{localClock(minuteTime(start+i*60),settings)}</span>)}</div>
      {days.map((date) => {
        const shown = blocksOn(blocks.map((item) => preview?.id === item.id ? preview : item),date);
        const times = overlay ? computePrayers(date,settings) : undefined;
        return <div key={date} className={'schedule-column '+(today === date ? 'is-today':'')} data-schedule-date={date} style={{ height }}>
          {Array.from({ length:Math.ceil(range/60) },(_,i) => <button className="empty-slot" aria-label={t('Add class')+' '+date+' '+minuteTime(start+i*60)} key={i} type="button" style={{ top:i*60/range*100+'%',height:Math.min(60,range-i*60)/range*100+'%' }} onClick={() => openAt(date,start+i*60)}/>)}
          {today === date && localMinutes(now.toISOString()) > start && localMinutes(now.toISOString()) < end && <div className="now-line" style={{ top:(localMinutes(now.toISOString())-start)/range*100+'%' }}/>}
          {times && prayers.map((name) => times[name] && localMinutes(times[name]) >= start && localMinutes(times[name]) < end && <span className="prayer-line" key={name} style={{ top:(localMinutes(times[name])-start)/range*100+'%' }} title={t(titleCase(name))}/>)}
          {shown.filter((block) => minutesAt(block.end)>start && minutesAt(block.start)<end).map((block,index) => {
            const overlapping = blocks.some((other) => conflicts(block,other)) || (times && prayers.some((name) => times[name] && localMinutes(times[name]) >= minutesAt(block.start) && localMinutes(times[name]) < minutesAt(block.end)));
            const style = { '--item-color':block.color ?? courses.find((course) => course.id === block.courseId)?.color ?? subject(index),top:(Math.max(start,minutesAt(block.start))-start)/range*100+'%',height:(Math.min(end,minutesAt(block.end))-Math.max(start,minutesAt(block.start)))/range*100+'%' } as CSSProperties;
            return <div className="schedule-block" key={block.id} style={style} onContextMenu={(e) => { e.preventDefault();setDraft(block); }}>
              <span className="resize top" onPointerDown={(e) => drag(e,block,date,'top')}/>
              <button type="button" onPointerDown={(e) => drag(e,block,date,'move')} onClick={(e) => { if (e.detail === 0) setDraft(block); }}><strong>{block.title}</strong><small>{block.start}–{block.end}</small>{block.location && <small>{block.location}</small>}{overlapping && <TriangleAlert size={13} aria-label={t('Schedule overlap')}/>}</button>
              <span className="resize bottom" onPointerDown={(e) => drag(e,block,date,'bottom')}/>
            </div>;
          })}
        </div>;
      })}
    </div></section> : <Panel title={view === 'day' ? friendlyDate(key,settings.language,{ weekday:'long',month:'long',day:'numeric' }) : t('All classes')} icon={CalendarDays}>
      {!list.length && <Empty icon={CalendarDays} title={t('No classes to show')}/>}
      {list.map((block) => <button className="data-row" key={block.id} onClick={() => setDraft(block)}><span className="tile tile-lilac"><Clock3 size={19}/></span><span className="grow"><strong>{block.title}</strong><small>{t(daysOfWeek[block.dayOfWeek]!)} · {block.start}–{block.end}</small></span>{block.location && <span className="muted">{block.location}</span>}{blocks.some((other) => conflicts(block,other)) && <TriangleAlert className="warning" size={16}/>}</button>)}
    </Panel>}
    {(draft || params.has('add')) && <SlotEditor draft={draft ?? { dayOfWeek:dayOf(key),start:'09:00',end:'10:00' }} close={() => { setDraft(undefined); if (params.has('add')) setParams({}); }}/>}
  </>;
}
