import { useMemo,useState } from 'react';
import { Activity,BarChart3,CalendarDays,ChartPie,CircleCheck,Flame,Moon,Timer } from 'lucide-react';
import { Bar,BarChart,CartesianGrid,Cell,Pie,PieChart,ResponsiveContainer,Tooltip,XAxis,YAxis,Line,LineChart } from 'recharts';
import { useTranslation } from 'react-i18next';
import { active } from '../shared/schema';
import { addDate,dayKey,friendlyDate } from '../shared/time';
import { gpa,studyStats } from '../shared/academic';
import { changeSettings,useSabri } from './store';
import { StudyInsights } from './study-insights';
import { Empty,Field,PageHead,Panel,Segments,useNow } from './ui';
import { GoalSummary } from './goal-widget';
const chartTip = { background:'var(--surface)',borderColor:'var(--border)',borderRadius:'var(--radius-sm)',color:'var(--text)' };
export function StatsPage() {
  const { t } = useTranslation(),state = useSabri((s) => s.data),today = dayKey(useNow(60000),state.settings.location.timezone);
  const [range,setRange] = useState<'today'|'week'|'month'|'all'>('week');
  const days = { today:1,week:7,month:30,all:null }[range];
  const stats = useMemo(() => studyStats(state,today,days),[state,today,days]);
  const history = days ? Array.from({ length:days },(_,index) => addDate(today,index-days+1)) : [...stats.daily.keys()].sort().slice(-365);
  const chart = history.map((day) => ({ date:friendlyDate(day,state.settings.language,{ month:'short',day:'numeric' }),minutes:Math.round(stats.daily.get(day) ?? 0) }));
  const courses = active(state.courses),terms = [...new Set(courses.map((item) => item.semester).filter(Boolean))].sort();
  const trend = terms.flatMap((semester) => { const { value } = gpa(courses.filter((item) => item.semester===semester),state.settings.gradeMap);return value===null ? []:[{ semester,gpa:Number(value.toFixed(2)) }]; });
  const sections = [...stats.byCourse].map(([courseId,minutes]) => ({ name:courses.find((item) => item.id===courseId)?.name ?? t('No course'),value:Math.round(minutes),color:courses.find((item) => item.id===courseId)?.color ?? 'var(--primary)' }));
  const metrics = [{ name:'Focus minutes',value:Math.round(stats.totalMinutes),icon:Timer,tone:'lilac' },{ name:'Sessions completed',value:stats.sessions,icon:Activity,tone:'blue' },{ name:'Tasks completed',value:stats.completed,icon:CircleCheck,tone:'orange' },{ name:'Prayers logged as complete',value:stats.prayerPct+'%',icon:Moon,tone:'mint' }];
  return <>
    <PageHead title={t('Statistics')} description={t('Review your focus sessions and study habits.')}/>
    <Segments<typeof range> value={range} onChange={setRange} label={t('Statistics range')} options={[{ value:'today',label:t('Today') },{ value:'week',label:t('Week') },{ value:'month',label:t('Month') },{ value:'all',label:t('All time') }]}/>
    <div className="dashboard-metrics">{metrics.map((item) => <div className="overview-metric" key={item.name}><span className={'tile tile-'+item.tone}><item.icon size={18}/></span><span className="metric-copy"><small>{t(item.name)}</small><strong>{item.value}</strong></span></div>)}</div>
    <div className="two-col">
      <Panel title={t('Focus time')} icon={BarChart3}>{stats.totalMinutes ? <div className="chart-area"><ResponsiveContainer width="100%" height="100%"><BarChart data={chart}><CartesianGrid stroke="var(--border)" vertical={false}/><XAxis dataKey="date" tick={{ fill:'var(--text-secondary)',fontSize:10 }}/><YAxis tick={{ fill:'var(--text-secondary)',fontSize:10 }}/><Tooltip contentStyle={chartTip}/><Bar dataKey="minutes" name={t('minutes')} fill="var(--primary)" radius={[5,5,0,0]}/></BarChart></ResponsiveContainer></div> : <Empty compact icon={BarChart3} title={t('No focus sessions in this range')}/>}</Panel>
      <Panel title={t('Time by course')} icon={ChartPie} tone="orange">{sections.length ? <div className="chart-area"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={sections} dataKey="value" nameKey="name" innerRadius="46%" outerRadius="74%">{sections.map((item,index) => <Cell fill={item.color} key={index}/>)}</Pie><Tooltip contentStyle={chartTip}/></PieChart></ResponsiveContainer></div> : <Empty compact icon={ChartPie} title={t('No course activity yet')}/>}</Panel>
      <Panel title={t('Weekly review')} icon={CalendarDays} tone="blue"><div className="form-grid">
        <div className="metric">{Math.round(stats.thisWeek)} <span>{t('min this week')}</span></div><div className="metric">{Math.round(stats.lastWeek)} <span>{t('min last week')}</span></div>
        <p>{t('Best study day')} · {stats.best ? friendlyDate(stats.best,state.settings.language,{ month:'short',day:'numeric' }):'–'}</p><p>{t('Average session')} · {stats.average} {t('min')}</p><p>{t('On-time tasks')} · {stats.onTime===null ? '–':stats.onTime+'%'}</p><p>{t('Weekly goal progress')} · {Math.round(stats.thisWeek/state.settings.focus.weeklyGoal*100)}%</p>
        <Field label={t('Next weekly goal (minutes)')} wide><input min={1} max={10080} type="number" key={state.settings.focus.weeklyGoal} defaultValue={state.settings.focus.weeklyGoal} onBlur={(e) => { if (e.target.checkValidity()) void changeSettings({ focus:{ ...state.settings.focus,weeklyGoal:+e.target.value } }); }}/></Field>
      </div></Panel>
      <GoalSummary/>
      <Panel title={t('Productivity heatmap')} icon={Flame} tone="mint"><div className="heatmap">{Array.from({ length:70 },(_,index) => addDate(today,index-69)).map((key) => { const value=stats.daily.get(key) ?? 0;return <span className={'heat-cell heat-'+Math.min(5,Math.ceil(value/30))} key={key} title={key+' · '+Math.round(value)+' '+t('min')}/>; })}</div></Panel>
      <Panel title={t('Peak hours')} icon={Timer}><div className="hour-heatmap">{Array.from({ length:168 },(_,index) => {
        const key=Math.floor(index/24)+'-'+String(index%24).padStart(2,'0'),value=stats.byHour.get(key) ?? 0;
        return <span className={'heat-cell heat-'+Math.min(5,Math.ceil(value/30))} key={key} title={key+' · '+Math.round(value)+' '+t('min')}/>;
      })}</div></Panel>
      <Panel title={t('GPA trend')} icon={BarChart3}>{trend.length ? <div className="chart-area"><ResponsiveContainer width="100%" height="100%"><LineChart data={trend}><XAxis dataKey="semester"/><YAxis/><Tooltip contentStyle={chartTip}/><Line dataKey="gpa" name={t('GPA')} stroke="var(--primary)" strokeWidth={2}/></LineChart></ResponsiveContainer></div> : <Empty compact icon={BarChart3} title={t('Add course grades to see your GPA trend')}/>}</Panel>
    </div>
    <StudyInsights/>
  </>;
}
