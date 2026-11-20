import { useState } from 'react';
import { Check,ChevronDown,ChevronUp,Flame,Plus,Repeat2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { active,habitSchema,habitLogSchema,type RecordFor } from '../shared/schema';
import { habitApplies,habitStreak } from '../shared/academic';
import { addDate,dayKey,friendlyDate,weekAt } from '../shared/time';
import { current,fresh,patch,remove,save,useSabri } from './store';
import { Button,daysOfWeek,Empty,Field,FormActions,IconButton,Modal,PageHead,Pager,Panel,titleCase,useNow } from './ui';

type Habit = RecordFor<'habits'>;
function record(habit: Habit,date: string,value: number) {
  const existing = current().habitLogs.find((item) => !item.deletedAt && item.habitId===habit.id && item.date===date);
  return save('habitLogs',habitLogSchema.parse({ ...(existing ?? fresh()),habitId:habit.id,date,value:Math.min(100000,Math.max(0,value)) }));
}
function HabitEditor({ initial,close }: { initial: Habit;close():void }) {
  const { t } = useTranslation();
  const [habit,set] = useState(initial);
  const edit = (value: Partial<Habit>) => set({ ...habit,...value });
  return <Modal title={t(initial.name?'Edit habit':'New habit')} close={close}>
    <form className="form-grid" onSubmit={async (e) => { e.preventDefault();if (await save('habits',habit)) close(); }}>
      <Field label={t('Name')}><input autoFocus required maxLength={200} value={habit.name} onChange={(e) => edit({ name:e.target.value })}/></Field>
      <Field label={t('Category')}><input maxLength={80} value={habit.category} onChange={(e) => edit({ category:e.target.value })}/></Field>
      <Field label={t('Icon')}><input maxLength={12} value={habit.icon} onChange={(e) => edit({ icon:e.target.value })}/></Field>
      <Field label={t('Color')}><input type="color" value={habit.color} onChange={(e) => edit({ color:e.target.value })}/></Field>
      <Field label={t('Frequency')}><select value={habit.frequency} onChange={(e) => edit({ frequency:e.target.value as Habit['frequency'] })}>{(['daily','weekly','specific_days'] as const).map((value) => <option key={value} value={value}>{t(titleCase(value))}</option>)}</select></Field>
      <Field label={t('Reminder time')}><input type="time" value={habit.remindAt ?? ''} onChange={(e) => edit({ remindAt:e.target.value || undefined })}/></Field>
      <Field label={t('Target count')}><input type="number" min={1} max={100000} value={habit.targetCount} onChange={(e) => edit({ targetCount:+e.target.value })}/></Field>
      <Field label={t('Unit')}><input maxLength={30} value={habit.unit} onChange={(e) => edit({ unit:e.target.value })}/></Field>
      {habit.frequency!=='daily' && <div className="check-grid wide">{daysOfWeek.map((name,index) => <label className="check-label" key={name}><input type="checkbox" checked={habit.targetDays.includes(index)} onChange={(e) => edit({ targetDays:e.target.checked ? (habit.frequency==='weekly' ? [index]:[...habit.targetDays,index]) : habit.targetDays.filter((day) => day!==index) })}/>{t(name)}</label>)}</div>}
      <label className="check-label wide"><input type="checkbox" checked={habit.archived} onChange={(e) => edit({ archived:e.target.checked })}/>{t('Archived')}</label><FormActions close={close}/>
    </form>
    {initial.name && <div className="modal-secondary"><Button variant="danger" onClick={() => { void remove('habits',initial);close(); }}>{t('Delete')}</Button></div>}
  </Modal>;
}
export function HabitSummary() {
  const { t } = useTranslation(),data = useSabri((s) => s.data);
  const today = dayKey(useNow(60000),data.settings.location.timezone);
  const habits = active(data.habits).filter((habit) => !habit.archived && habitApplies(habit,today,data.settings.weekStart));
  return <Panel title={t('Habits')} icon={Repeat2} tone="mint">{habits.length ? habits.slice(0,5).map((habit) => {
    const value = active(data.habitLogs).find((log) => log.habitId===habit.id && log.date===today)?.value ?? 0;
    return <div className="data-row" key={habit.id}><button className="check-circle" aria-label={habit.name} aria-pressed={value>=habit.targetCount} onClick={() => { void record(habit,today,value>=habit.targetCount ? 0:habit.targetCount); }}>{value>=habit.targetCount && <Check size={13}/>}</button><strong className="grow">{habit.icon} {habit.name}</strong><small>{value}/{habit.targetCount}</small></div>;
  }) : <Empty compact icon={Repeat2} title={t('No habits today')}/>}</Panel>;
}
export function HabitsPage() {
  const { t } = useTranslation(),state = useSabri((s) => s.data),{ settings } = state;
  const today = dayKey(useNow(60000),settings.location.timezone),[key,setKey] = useState(today);
  const [selected,setSelected] = useState<Habit>(),[history,setHistory] = useState<Habit>(),[archived,setArchived] = useState(false);
  const list = active(state.habits).filter((habit) => archived || !habit.archived).sort((a,b) => a.order-b.order);
  const from = weekAt(key,settings.weekStart),days = Array.from({ length:7 },(_,index) => addDate(from,index));
  const logs = new Map(active(state.habitLogs).map((log) => [log.habitId+log.date,log.value]));
  const add = (name = '') => setSelected({ ...habitSchema.parse({ ...fresh(),name:name || 'Habit',icon:'✦',color:'#258574',category:'',frequency:'daily',targetDays:[],targetCount:1,unit:'',archived:false,order:(list.at(-1)?.order ?? 0)+1 }),name });
  return <>
    <PageHead title={t('Habits')} description={t('Build a routine one small action at a time.')} action={<Button icon={Plus} variant="primary" onClick={() => add()}>{t('New habit')}</Button>}/>
    <div className="toolbar"><Pager back={() => setKey(addDate(key,-7))} forward={() => setKey(addDate(key,7))}>{friendlyDate(from,settings.language,{ month:'short',day:'numeric' })}</Pager><label className="check-label"><input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)}/>{t('Show archived')}</label></div>
    <Panel title={t('Habit tracker')} icon={Repeat2}>{list.length ? <div className="table-scroll"><table className="habit-table"><thead><tr><th>{t('Habits')}</th>{days.map((date) => <th key={date}>{friendlyDate(date,settings.language,{ weekday:'short',day:'numeric' })}</th>)}<th>{t('Streak')}</th><th>{t('Reorder')}</th></tr></thead>
      <tbody>{list.map((habit,index) => <tr key={habit.id}><td><button className="task-title" onClick={() => setSelected(habit)}><strong>{habit.icon} {habit.name}</strong><small>{habit.archived ? t('Archived'):habit.category}</small></button></td>
        {days.map((date) => {
          const count = logs.get(habit.id+date) ?? 0,applies = habitApplies(habit,date,settings.weekStart);
          return <td key={date}>{applies ? habit.targetCount===1 ? <button type="button" className="check-circle" aria-label={habit.name+' '+date} aria-pressed={count>=1} onClick={() => { void record(habit,date,count>=1 ? 0:1); }}>{count>=1 && <Check size={13}/>}</button> : <input className="habit-count" type="number" aria-label={habit.name+' '+date} min={0} max={100000} key={count} defaultValue={count} onBlur={(e) => { if (e.target.checkValidity() && +e.target.value!==count) void record(habit,date,+e.target.value); }}/> : <span className="muted">–</span>}</td>;
        })}
        <td><Button variant="ghost" icon={Flame} onClick={() => setHistory(habit)}>{habitStreak(habit,state.habitLogs,today,settings.weekStart)}</Button></td><td>
        {[-1,1].map((dir) => <IconButton key={dir} icon={dir<0?ChevronUp:ChevronDown} label={t(dir<0?'Move up':'Move down')} disabled={!list[index+dir]} onClick={() => { const other=list[index+dir];if (other) void patch([{ collection:'habits',value:{ ...habit,order:other.order } },{ collection:'habits',value:{ ...other,order:habit.order } }]); }}/>)}</td>
      </tr>)}</tbody></table></div> : <Empty icon={Repeat2} title={t('No habits yet')} action={<div className="actions">{['Read a Quran page','Exercise','Drink water','Review notes'].map((name) => <Button key={name} onClick={() => add(t(name))}>{t(name)}</Button>)}</div>}/>}</Panel>
    {selected && <HabitEditor initial={selected} close={() => setSelected(undefined)}/>}
    {history && <Modal title={history.name+' · '+t('Habit history')} close={() => setHistory(undefined)}><div className="heatmap">{Array.from({ length:84 },(_,index) => addDate(today,index-83)).map((date) => <span className={'heat-cell '+((logs.get(history.id+date) ?? 0)>=history.targetCount ? 'heat-5':'')} key={date} title={date+' · '+(logs.get(history.id+date) ?? 0)}/>)}</div></Modal>}
  </>;
}

