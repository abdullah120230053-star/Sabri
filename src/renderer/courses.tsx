import { useState, type CSSProperties } from 'react';
import { BookOpen, ChevronDown, ChevronUp, GraduationCap, Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { active,courseSchema,gradeComponentSchema,type RecordFor } from '../shared/schema';
import { gpa,gpaRequirement,requiredGrade,weightedGrade } from '../shared/academic';
import { changeSettings,fresh,patch,remove,save,tell,useSabri } from './store';
import { Button,Empty,Field,FormActions,IconButton,Modal,PageHead,Panel } from './ui';

type Course = RecordFor<'courses'>;
type Component = Course['gradeComponents'][number];
function CourseEditor({ initial,close }: { initial: Course; close(): void }) {
  const { t } = useTranslation(),state = useSabri((s) => s.data);
  const [course,set] = useState(initial),[part,setPart] = useState('');
  const [prediction,setPrediction] = useState(85);
  const setFields = (fields: Partial<Course>) => set({ ...course,...fields });
  const editPart = (id: string,fields: Partial<Component>) => setFields({ gradeComponents:course.gradeComponents.map((item) => item.id===id ? { ...item,...fields }:item) });
  const required = requiredGrade(course.gradeComponents,part,course.targetGrade);
  const matches = active(state.tasks).filter((task) => task.courseId===course.id);
  const days = active(state.calendar).filter((item) => item.courseId===course.id);
  const notes = active(state.notes).filter((item) => item.courseId===course.id);
  const minutes = active(state.sessions).filter((item) => item.courseId===course.id && item.type==='focus').reduce((sum,item) => sum+item.actualMinutes,0);
  return <Modal title={initial.name || t('New course')} close={close} wide>
    <form className="form-grid" onSubmit={async (e) => { e.preventDefault(); if (course.gradeComponents.some((item) => (item.earnedScore ?? 0)>item.maxScore)) { tell(t('An earned score exceeds its maximum.'));return; }if (await save('courses',course)) close(); }}>
      <Field label={t('Course name')}><input autoFocus required maxLength={200} value={course.name} onChange={(e) => setFields({ name:e.target.value })}/></Field>
      <Field label={t('Course code')}><input maxLength={30} value={course.code} onChange={(e) => setFields({ code:e.target.value })}/></Field>
      <Field label={t('Instructor')}><input maxLength={120} value={course.instructor} onChange={(e) => setFields({ instructor:e.target.value })}/></Field>
      <Field label={t('Semester')}><input maxLength={80} placeholder="Fall 2026" value={course.semester} onChange={(e) => setFields({ semester:e.target.value })}/></Field>
      <Field label={t('Credit hours')}><input type="number" min={0} max={100} step={0.5} value={course.creditHours} onChange={(e) => setFields({ creditHours:+e.target.value })}/></Field>
      <Field label={t('Final letter grade')}><select value={course.finalGrade} onChange={(e) => setFields({ finalGrade:e.target.value })}><option value="">{t('Ungraded')}</option>{Object.keys(state.settings.gradeMap).map((key) => <option key={key}>{key}</option>)}</select></Field>
      <Field label={t('Absences')}><input type="number" min={0} max={1000} value={course.absences} onChange={(e) => setFields({ absences:+e.target.value })}/></Field>
      <Field label={t('Absence limit')}><input type="number" min={0} max={100} value={course.absenceLimit} onChange={(e) => setFields({ absenceLimit:+e.target.value })}/></Field>
      <Field label={t('Color')}><input type="color" value={course.color} onChange={(e) => setFields({ color:e.target.value })}/></Field>
      <div className="wide"><div className="toolbar"><h3>{t('Grade components')}</h3><Button icon={Plus} onClick={() => setFields({ gradeComponents:[...course.gradeComponents,gradeComponentSchema.parse({ id:crypto.randomUUID(),name:t('Final exam'),weight:40,maxScore:100 })] })}>{t('Add component')}</Button></div>
        {course.gradeComponents.map((item) => <div className="grade-row" key={item.id}>
          <Field label={t('Name')}><input required maxLength={200} value={item.name} onChange={(e) => editPart(item.id,{ name:e.target.value })}/></Field>
          <Field label={t('Weight %')}><input type="number" min={0} max={100} step={0.1} value={item.weight} onChange={(e) => editPart(item.id,{ weight:+e.target.value })}/></Field>
          <Field label={t('Maximum score')}><input type="number" min={0.01} max={100000} step={0.01} value={item.maxScore} onChange={(e) => editPart(item.id,{ maxScore:+e.target.value })}/></Field>
          <Field label={t('Earned score')}><input type="number" min={0} max={item.maxScore} step={0.01} value={item.earnedScore ?? ''} onChange={(e) => editPart(item.id,{ earnedScore:e.target.value ? +e.target.value:undefined })}/></Field>
          <Field label={t('Due date')}><input type="date" value={item.dueDate ?? ''} onChange={(e) => editPart(item.id,{ dueDate:e.target.value || undefined })}/></Field>
          <IconButton label={t('Delete')} icon={Trash2} onClick={() => setFields({ gradeComponents:course.gradeComponents.filter((value) => value.id!==item.id) })}/>
        </div>)}
        {course.gradeComponents.length > 0 && <p className="muted">{t('Current weighted grade')} · {weightedGrade(course.gradeComponents).toFixed(1)}% · {t('Assigned weight')} {course.gradeComponents.reduce((sum,item) => sum+item.weight,0)}%</p>}
      </div>
      {course.gradeComponents.length > 0 && <div className="wide what-if"><h3>{t('What-if calculator')}</h3><div className="form-grid"><Field label={t('Grade component')}><select value={part} onChange={(e) => setPart(e.target.value)}><option value="">{t('Choose a component')}</option>{course.gradeComponents.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></Field>
        <Field label={t('Hypothetical score %')}><input type="number" min={0} max={100} value={prediction} onChange={(e) => setPrediction(+e.target.value)}/></Field>
        <Field label={t('Target overall grade %')}><input type="number" min={0} max={100} value={course.targetGrade} onChange={(e) => setFields({ targetGrade:+e.target.value })}/></Field>
        {part && <div><strong>{t('Overall grade')} {weightedGrade(course.gradeComponents,{ id:part,percent:prediction }).toFixed(1)}%</strong>{required !== null && <p className={required>100?'warning':'muted'}>{t('Score needed for target')} {required.toFixed(1)}%</p>}</div>}
      </div></div>}
      {initial.name && <details className="wide"><summary>{t('Course activity')} · {Math.round(minutes)} {t('min')}</summary><div className="check-grid">{[...matches.map((item) => item.title),...days.map((item) => item.title),...notes.map((item) => item.title)].map((item,index) => <span key={index} className="pill">{item}</span>)}</div></details>}
      <FormActions close={close}/>
    </form>
    {initial.name && <div className="modal-secondary"><Button variant="danger" onClick={() => { void remove('courses',initial);close(); }}>{t('Delete')}</Button></div>}
  </Modal>;
}
export function CoursesPage() {
  const go=useNavigate();
  const { t } = useTranslation(),state = useSabri((s) => s.data);
  const [selected,setSelected] = useState<Course>();
  const [gradeEditor,setEditor] = useState(false);
  const [grades,setGrades] = useState('');
  const [semester,setSemester] = useState('');
  const all = active(state.courses).sort((a,b) => a.order-b.order),semesters = [...new Set(all.map((item) => item.semester).filter(Boolean))];
  const listed = semester ? all.filter((item) => item.semester===semester):all;
  const current = gpa(listed,state.settings.gradeMap),overall = gpa(all,state.settings.gradeMap);
  const goal = gpaRequirement(listed,state.settings.gradeMap,state.settings.gpaGoal);
  const add = () => setSelected({ ...courseSchema.parse({ ...fresh(),name:'Course',code:'',instructor:'',creditHours:3,color:'#7355c8',semester,gradeComponents:[],finalGrade:'',absenceLimit:4,absences:0,order:(all.at(-1)?.order ?? 0)+1 }),name:'' });
  return <>
    <PageHead title={t('Courses')} description={t('Track your courses, attendance, grades, and GPA.')} action={<Button icon={Plus} variant="primary" onClick={add}>{t('New course')}</Button>}/>
    <div className="dashboard-metrics">
      {[['Cumulative GPA',overall.value?.toFixed(2) ?? '–'],['Selected semester GPA',current.value?.toFixed(2) ?? '–'],['Credits counted',current.credits],['Required GPA on remaining credits',goal?.toFixed(2) ?? '–']].map(([label,value]) => <div className="overview-metric" key={label}><span className="tile tile-lilac"><GraduationCap size={18}/></span><span className="metric-copy"><small>{t(String(label))}</small><strong>{value}</strong></span></div>)}
    </div>
    <div className="toolbar"><Field label={t('Semester')}><select value={semester} onChange={(e) => setSemester(e.target.value)}><option value="">{t('All semesters')}</option>{semesters.map((item) => <option key={item}>{item}</option>)}</select></Field><div className="actions"><Field label={t('GPA goal')}><input type="number" min={0} max={100} step={0.05} key={state.settings.gpaGoal} defaultValue={state.settings.gpaGoal} onBlur={(e) => { if (e.target.checkValidity()) void changeSettings({ gpaGoal:+e.target.value }); }}/></Field><Button onClick={() => { setGrades(Object.entries(state.settings.gradeMap).map(([letter,points]) => letter+'='+points).join('\n'));setEditor(true); }}>{t('Edit GPA scale')}</Button></div></div>
    <Panel title={t('Courses')} icon={BookOpen}>{listed.length ? listed.map((course,index) => <div key={course.id} className="data-row"><span className="course-dot" style={{ '--item-color':course.color } as CSSProperties}/><button className="task-title grow" onClick={() => setSelected(course)}><strong>{course.name}</strong><small>{[course.code,course.instructor,course.semester].filter(Boolean).join(' · ')}</small></button>
      <span className={'pill '+(course.absenceLimit && course.absences>=course.absenceLimit ? 'priority-high':'')}>{course.absences}{course.absenceLimit ? '/'+course.absenceLimit:''} {t('absences')}</span>
      <Button onClick={() => { void save('courses',{ ...course,absences:Math.min(1000,course.absences+1) }); }}>{t('Record absence')}</Button>
      <Button onClick={()=>go('/resources?course='+course.id)}>{t('Resources')}</Button>
      <span className="pill">{course.finalGrade || '–'}</span>
      {[-1,1].map((dir) => <IconButton key={dir} label={t(dir<0?'Move up':'Move down')} icon={dir<0?ChevronUp:ChevronDown} disabled={!listed[index+dir]} onClick={() => { const other=listed[index+dir];if (other) void patch([{ collection:'courses',value:{ ...course,order:other.order } },{ collection:'courses',value:{ ...other,order:course.order } }]); }}/>)}
    </div>) : <Empty icon={BookOpen} title={t('No courses yet')} action={<Button icon={Plus} onClick={add}>{t('New course')}</Button>}/>}</Panel>
    {selected && <CourseEditor initial={selected} close={() => setSelected(undefined)}/>}
    {gradeEditor && <Modal title={t('Edit GPA scale')} close={() => setEditor(false)}><form className="form-grid" onSubmit={async (e) => {
      e.preventDefault();
      const lines = grades.split('\n').filter((item) => item.trim());
      if (!lines.length || lines.some((item) => !/^[A-Za-z0-9+ -]{1,20}=\d+(?:\.\d+)?$/.test(item.trim()))) { tell(t('Enter one letter and point value per line.'));return; }
      const gradeMap = Object.fromEntries(lines.map((item) => { const [key,value] = item.trim().split('=');return [key!,Number(value)]; }));
      if (await changeSettings({ gradeMap })) setEditor(false);
    }}><Field label={t('Letter = grade points')} wide><textarea rows={12} value={grades} onChange={(e) => setGrades(e.target.value)}/></Field><FormActions close={() => setEditor(false)}/></form></Modal>}
  </>;
}

