import { useState } from 'react';
import { Check, ChevronDown, ChevronUp, ClipboardList, GripVertical, MoreHorizontal, Plus, Timer, Trash2 } from 'lucide-react';
import { DndContext, PointerSensor, KeyboardSensor, useDroppable, useDraggable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { active, priorities, taskSchema, taskStatuses, type RecordFor } from '../shared/schema';
import { dayKey, friendlyDate } from '../shared/time';
import { quickTask, taskTransition } from '../shared/tasks';
import { current, fresh, patch, remove, save, useSabri } from './store';
import { Button, Empty, Field, FormActions, IconButton, Modal, PageHead, Panel, Segments, titleCase, useNow } from './ui';

type Task = RecordFor<'tasks'>;
const statusNames = { todo:'To do',doing:'In progress',done:'Completed' };
const setStatus = (task: Task,status: Task['status']) => patch(taskTransition(task,status,current()).map((value) => ({ collection:'tasks',value })));

function QuickAdd({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  const [value,setValue] = useState('');
  return <form className="quick-add" onSubmit={async (event) => {
    event.preventDefault();
    const data = current(),parsed = quickTask(value.trim(),data);
    if (!parsed.title) return;
    const order = data.tasks.reduce((max,task) => Math.max(max,task.order),0)+1;
    if (await save('tasks',taskSchema.parse({ ...fresh(),...parsed,order }))) setValue('');
  }}><Plus size={19}/><input aria-label={t('Add a task')} placeholder={t(compact ? 'Add a task' : 'Add a task… try !high #course @tomorrow')} value={value} onChange={(e) => setValue(e.target.value)} maxLength={300}/><Button variant={compact ? 'ghost':'primary'} type="submit">{t('Add')}</Button></form>;
}

function TaskEditor({ initial,close }: { initial: Task; close(): void }) {
  const { t } = useTranslation();
  const [task,set] = useState(initial);
  const [subtask,setSubtask] = useState('');
  const courses = useSabri((s) => s.data.courses);
  const edit = (fields: Partial<Task>) => set({ ...task,...fields });
  return <Modal title={t(current().tasks.some((item) => item.id === initial.id) ? 'Edit task':'New task')} close={close}>
    <form className="form-grid" onSubmit={async (event) => {
      event.preventDefault();
      const result = taskSchema.safeParse(task);
      if (result.success && await patch(taskTransition({ ...result.data,status:initial.status },task.status,current()).map((value) => ({ collection:'tasks',value })))) close();
    }}>
      <Field label={t('Title')} wide><input autoFocus required maxLength={200} value={task.title} onChange={(e) => edit({ title:e.target.value })}/></Field>
      <Field label={t('Priority')}><select value={task.priority} onChange={(e) => edit({ priority:e.target.value as Task['priority'] })}>{priorities.map((item) => <option key={item} value={item}>{t(titleCase(item))}</option>)}</select></Field>
      <Field label={t('Status')}><select value={task.status} onChange={(e) => edit({ status:e.target.value as Task['status'] })}>{taskStatuses.map((item) => <option key={item} value={item}>{t(statusNames[item])}</option>)}</select></Field>
      <Field label={t('Course')}><select value={task.courseId ?? ''} onChange={(e) => edit({ courseId:e.target.value || undefined })}><option value="">{t('No course')}</option>{active(courses).map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}</select></Field>
      <Field label={t('Category')}><input maxLength={80} value={task.category} onChange={(e) => edit({ category:e.target.value })}/></Field>
      <Field label={t('Due date')}><input type="date" value={task.dueDate ?? ''} onChange={(e) => edit({ dueDate:e.target.value || undefined })}/></Field><Field label={t('Due time')}><input type="time" value={task.dueTime ?? ''} onChange={(e) => edit({ dueTime:e.target.value || undefined })}/></Field>
      <Field label={t('Recurrence')}><select value={task.recurring ?? ''} onChange={(e) => edit({ recurring:(e.target.value || undefined) as Task['recurring'] })}><option value="">{t('No recurrence')}</option>{['daily','weekly','monthly'].map((item) => <option key={item} value={item}>{t(titleCase(item))}</option>)}</select></Field>
      <Field label={t('Estimated sessions')}><input type="number" min={0} max={1000} value={task.estimated} onChange={(e) => edit({ estimated:+e.target.value })}/></Field>
      <Field label={t('Tags')} wide><input defaultValue={task.tags.join(', ')} onChange={(e) => edit({ tags:e.target.value.split(',').map((item) => item.trim().slice(0,80)).filter(Boolean).slice(0,40) })}/></Field>
      <Field label={t('Description')} wide><textarea value={task.description} rows={3} maxLength={6000} onChange={(e) => edit({ description:e.target.value })}/></Field>
      <div className="wide"><strong>{t('Subtasks')}</strong>{task.subtasks.map((item) => <div className="subtask" key={item.id}><label><input type="checkbox" checked={item.completed} onChange={(e) => edit({ subtasks:task.subtasks.map((child) => child.id === item.id ? { ...child,completed:e.target.checked }:child) })}/>{item.title}</label><IconButton label={t('Delete')} icon={Trash2} onClick={() => edit({ subtasks:task.subtasks.filter((child) => child.id !== item.id) })}/></div>)}
        <div className="actions"><input aria-label={t('Subtask title')} maxLength={200} value={subtask} onChange={(e) => setSubtask(e.target.value)}/><Button icon={Plus} onClick={() => { if (subtask.trim()) { edit({ subtasks:[...task.subtasks,{ id:crypto.randomUUID(),title:subtask.trim(),completed:false }] });setSubtask(''); } }}>{t('Add')}</Button></div>
      </div><FormActions close={close}/>
    </form>
  </Modal>;
}

function TaskLine({ task,today,edit,compact = false,reorder }: { task: Task; today: string; edit(): void; compact?: boolean; reorder?(direction: number): void }) {
  const { t } = useTranslation();
  const nav = useNavigate(),timer = useSabri((s) => s.timer),settings = useSabri((s) => s.data.settings);
  const drag = useDraggable({ id:task.id,disabled:compact });
  const drop = useDroppable({ id:'item:'+task.id,disabled:compact });
  return <div className={'task-row '+(task.status === 'done' ? 'task-done ':'')+(drop.isOver ? 'drop-target':'')} ref={(element) => { drag.setNodeRef(element);drop.setNodeRef(element); }} style={drag.transform ? { transform:'translate('+drag.transform.x+'px,'+drag.transform.y+'px)',zIndex:2,position:'relative' }:undefined}>
    <button type="button" className="check-circle" aria-label={t(task.status === 'done' ? 'Reopen task':'Complete task')+' '+task.title} aria-pressed={task.status === 'done'} onClick={() => { void setStatus(task,task.status === 'done' ? 'todo':'done'); }}>{task.status === 'done' && <Check size={13}/>}</button>
    <button className="task-title grow" type="button" onClick={edit}><strong>{task.title}</strong>{!compact && <small className={task.dueDate && task.dueDate<today && task.status !== 'done' ? 'error':''}>{[task.dueDate ? friendlyDate(task.dueDate,settings.language,{ month:'short',day:'numeric' }):'',task.category,task.subtasks.length ? task.subtasks.filter((item) => item.completed).length+'/'+task.subtasks.length:''].filter(Boolean).join(' · ')}</small>}</button>
    <span className={'pill priority-'+task.priority}><i/>{t(titleCase(task.priority))}</span>
    {!compact && <div className="row-actions"><IconButton icon={Timer} label={t('Focus on this task')} onClick={async () => { await timer({ type:'link',taskId:task.id,courseId:task.courseId }); nav('/focus'); }}/>{reorder && <><IconButton icon={ChevronUp} label={t('Move up')} onClick={() => reorder(-1)}/><IconButton icon={ChevronDown} label={t('Move down')} onClick={() => reorder(1)}/></>}<IconButton icon={Trash2} label={t('Delete')} onClick={() => { void remove('tasks',task); }}/><button type="button" className="icon-button drag-handle" {...drag.attributes} {...drag.listeners} aria-label={t('Reorder')}><GripVertical size={16}/></button></div>}
  </div>;
}
function Column({ status,tasks,today,open }: { status: Task['status']; tasks: Task[]; today: string; open(task: Task): void }) {
  const { t } = useTranslation(),drop = useDroppable({ id:'status:'+status });
  return <div className={drop.isOver ? 'drop-target':''} ref={drop.setNodeRef}><Panel title={t(statusNames[status])} action={<span className="pill">{tasks.length}</span>}>{tasks.length ? tasks.map((task) => <TaskLine key={task.id} task={task} today={today} edit={() => open(task)}/>) : <p className="muted column-empty">{t('Drop a task here')}</p>}</Panel></div>;
}
export function TodayTasks() {
  const { t } = useTranslation(),state = useSabri((s) => s.data),nav = useNavigate();
  const [edit,setEdit] = useState<Task>();
  const today = dayKey(useNow(60000),state.settings.location.timezone);
  const tasks = active(state.tasks).filter((item) => !item.dueDate || item.dueDate<=today).sort((a,b) => Number(a.status === 'done')-Number(b.status === 'done') || a.order-b.order).slice(0,5);
  return <Panel title={t('Today’s tasks')} icon={ClipboardList} tone="orange" action={<IconButton icon={MoreHorizontal} label={t('View tasks')} onClick={() => nav('/tasks')}/>}>
    {tasks.length ? tasks.map((task) => <TaskLine key={task.id} task={task} today={today} compact edit={() => setEdit(task)}/>) : <Empty compact icon={ClipboardList} title={t('No tasks yet')}/>}<QuickAdd compact/>
    {edit && <TaskEditor initial={edit} close={() => setEdit(undefined)}/>}
  </Panel>;
}

export function TasksPage() {
  const { t } = useTranslation(),state = useSabri((s) => s.data),today = dayKey(useNow(60000),state.settings.location.timezone);
  const [params,setParams] = useSearchParams();
  const [view,setView] = useState<'list'|'board'|'today'|'upcoming'|'course'>('list');
  const [query,setQuery] = useState(''),[priority,setPriority] = useState(''),[status,setFilterStatus] = useState(''),[courseId,setCourse] = useState(''),[sort,setSort] = useState('order');
  const [showCompleted,setShowCompleted] = useState(true),[edit,setEdit] = useState<Task>();
  const all = active(state.tasks).sort((a,b) => a.order-b.order),courses = active(state.courses);
  const visible = all.filter((task) => (!query || [task.title,task.category,...task.tags].join(' ').toLowerCase().includes(query.toLowerCase())) && (!priority || priority === task.priority) && (!status || status === task.status) && (!courseId || courseId === task.courseId) && (showCompleted || task.status !== 'done') && (view !== 'today' || !task.dueDate || task.dueDate<=today) && (view !== 'upcoming' || (task.dueDate && task.dueDate>today)));
  if (sort === 'date') visible.sort((a,b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'));
  if (sort === 'priority') visible.sort((a,b) => priorities.indexOf(a.priority)-priorities.indexOf(b.priority));
  const sensors = useSensors(useSensor(PointerSensor,{ activationConstraint:{ distance:5 } }),useSensor(KeyboardSensor));
  const reorder = (task: Task,target: Task) => {
    const old = all.findIndex((item) => item.id === task.id),next = all.findIndex((item) => item.id === target.id);
    if (old === next || old < 0 || next < 0) return;
    const ordered = all.slice();ordered.splice(old,1);ordered.splice(next,0,task);
    void patch(ordered.map((item,order) => ({ collection:'tasks',value:{ ...item,order } })));
  };
  const dropped = ({ active:source,over }: DragEndEvent) => {
    const task = all.find((item) => item.id === source.id);
    if (!task || !over) return;
    const target = all.find((item) => 'item:'+item.id === over.id);
    const status = taskStatuses.find((item) => 'status:'+item === over.id) ?? target?.status;
    if (view === 'board' && status && status !== task.status) void setStatus(task,status); else if (target) reorder(task,target);
  };
  const newTask = () => taskSchema.parse({ ...fresh(),title:t('New task'),order:(all.at(-1)?.order ?? 0)+1 });
  const render = (task: Task,index: number,list: Task[]) => <TaskLine key={task.id} task={task} today={today} edit={() => setEdit(task)} reorder={(dir) => { const target = list[index+dir];if (target) reorder(task,target); }}/>;
  return <>
    <PageHead title={t('Tasks')} description={t('Keep track of coursework and the little things that count.')} action={<Button variant="primary" icon={Plus} onClick={() => setEdit(newTask())}>{t('New task')}</Button>}/>
    <QuickAdd/>
    <div className="toolbar"><Segments value={view} onChange={(value) => setView(value)} label={t('Tasks')} options={[{ value:'list',label:t('List') },{ value:'board',label:t('Kanban') },{ value:'today',label:t('Today') },{ value:'upcoming',label:t('Upcoming') },{ value:'course',label:t('By course') }]}/>
      <label className="check-label"><input type="checkbox" checked={showCompleted} onChange={(e) => setShowCompleted(e.target.checked)}/>{t('Show completed')}</label></div>
    <div className="toolbar filters"><input type="search" aria-label={t('Search tasks')} placeholder={t('Search tasks')} value={query} onChange={(e) => setQuery(e.target.value)}/>
      <select aria-label={t('Priority')} value={priority} onChange={(e) => setPriority(e.target.value)}><option value="">{t('All priorities')}</option>{priorities.map((item) => <option key={item} value={item}>{t(titleCase(item))}</option>)}</select>
      <select aria-label={t('Status')} value={status} onChange={(e) => setFilterStatus(e.target.value)}><option value="">{t('All statuses')}</option>{taskStatuses.map((item) => <option key={item} value={item}>{t(statusNames[item])}</option>)}</select>
      <select aria-label={t('Course')} value={courseId} onChange={(e) => setCourse(e.target.value)}><option value="">{t('All courses')}</option>{courses.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}</select>
      <select aria-label={t('Sort')} value={sort} onChange={(e) => setSort(e.target.value)}><option value="order">{t('Manual order')}</option><option value="date">{t('Due date')}</option><option value="priority">{t('Priority')}</option></select></div>
    <DndContext sensors={sensors} onDragEnd={dropped}>{view === 'board' ? <div className="kanban">{taskStatuses.map((item) => <Column key={item} status={item} tasks={visible.filter((task) => task.status === item)} today={today} open={setEdit}/>)}</div> : view === 'course' && visible.length ? <div className="stack">{[...courses.map((course) => ({ id:course.id,name:course.name })),{ id:undefined,name:t('No course') }].map((course) => {
      const group = visible.filter((task) => task.courseId === course.id);
      return group.length ? <Panel key={course.id ?? 'none'} title={course.name}>{group.map(render)}</Panel> : null;
    })}</div> : <Panel title={t('All tasks')} icon={ClipboardList} action={<span className="pill">{visible.length}</span>}>{visible.length ? visible.map(render) : <Empty icon={ClipboardList} title={t('No tasks to show')}/>}</Panel>}</DndContext>
    {(edit || params.has('new')) && <TaskEditor initial={edit ?? newTask()} close={() => { setEdit(undefined);if (params.has('new')) setParams({}); }}/>}
  </>;
}


