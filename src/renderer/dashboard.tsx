import { ArrowDownToLine, ArrowUpRight, CalendarDays, CircleCheck, LayoutGrid, Moon, Sparkles, Timer } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { active } from '../shared/schema';
import { blocksOn, dayKey, friendlyDate } from '../shared/time';
import { nextPrayer } from '../shared/prayer';
import { FocusCard } from './focus';
import { PrayerChecklist } from './prayers';
import { TodaySchedule } from './schedule';
import { TodayTasks } from './tasks';
import { useSabri } from './store';
import { Button, useNow } from './ui';
import { UpcomingEvents } from './calendar';
import { selectedTheme } from './themes';
import { ThemeArt } from './theme-art';

export function Dashboard() {
  const { t } = useTranslation(),navigate = useNavigate();
  const data = useSabri((s) => s.data);
  const now = useNow(30000),settings = data.settings,zone = settings.location.timezone,today = dayKey(now,zone);
  const localHour = +new Intl.DateTimeFormat('en-GB',{ timeZone:zone,hour:'2-digit',hourCycle:'h23' }).format(now);
  const greeting = localHour < 12 ? 'Good morning' : localHour < 18 ? 'Good afternoon' : 'Good evening';
  const classes = blocksOn(data.schedule,today).length;
  const tasks = active(data.tasks).filter((item) => item.status !== 'done' && (!item.dueDate || item.dueDate<=today)).length;
  const focused = Math.round(active(data.sessions).filter((item) => item.type==='focus' && dayKey(new Date(item.endedAt),zone)===today).reduce((sum,item) => sum+item.actualMinutes,0));
  const upcoming = nextPrayer(now,settings);
  return <div className="dashboard">
    <div className="dashboard-heading">
      <div><div className="heading-date"><CalendarDays size={14}/>{friendlyDate(today,settings.language,{ weekday:'long',month:'long',day:'numeric',year:'numeric' })}</div><h1>{t(greeting)}<span className="greeting-dot">.</span></h1><p>{t('Here’s what’s ahead in your study plan.')}</p></div>
      <Button icon={LayoutGrid} onClick={() => navigate('/settings')}>{t('Preferences')}</Button>
    </div>
    <section className="hero">
      <div className="hero-copy"><span className="hero-kicker"><Sparkles size={15}/>{t('University workspace')}</span><h2>{t('Make time for what matters.')}</h2><p>{t('Bring your class schedule, focus sessions, and daily prayers together in one place.')}</p>
        <Button variant="primary" icon={ArrowDownToLine} onClick={() => navigate('/import')}>{t('Import timetable')}</Button>
      </div>
      <ThemeArt theme={selectedTheme(data).art} motion={settings.themeMotion}/>
    </section>
    <div className="dashboard-metrics">
      {([{ label:'Classes today',value:classes,icon:CalendarDays,tone:'lilac',path:'/schedule' },{ label:'Open tasks',value:tasks,icon:CircleCheck,tone:'orange',path:'/tasks' },{ label:'Focus today',value:focused+' '+t('min'),icon:Timer,tone:'blue',path:'/focus' },{ label:'Next prayer',value:upcoming ? t(upcoming.name.charAt(0).toUpperCase()+upcoming.name.slice(1)):'–',icon:Moon,tone:'mint',path:'/prayers' }]).map((item) => <button key={item.label} className="overview-metric" onClick={() => navigate(item.path)}><span className={'tile tile-'+item.tone}><item.icon size={19}/></span><span className="metric-copy"><small>{t(item.label)}</small><strong>{item.value}</strong></span><ArrowUpRight className="metric-arrow" size={15}/></button>)}
    </div>
    <div className="dashboard-grid"><div className="stack"><TodaySchedule/><FocusCard compact/><UpcomingEvents/></div><div className="stack"><PrayerChecklist compact/><TodayTasks/></div></div>
  </div>;
}


