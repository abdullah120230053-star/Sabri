import { useState } from 'react';
import { Archive, Bell, BookOpen, Clock3, Database, Globe, MapPin, Palette, Shield, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { courseSchema, eventSchema, prayers, prayerMethods, scheduleSchema, taskSchema, type Settings } from '../shared/schema';
import { cities } from '../shared/prayer';
import { addDate, dayKey, dayOf } from '../shared/time';
import { changeSettings, fresh, patch, tell, useSabri } from './store';
import { themes } from './themes';
import { artwork } from './theme-art';
import { ThemeEditor } from './theme-editor';
import { Updates } from './updates';
import { Button, daysOfWeek, Field, FormActions, Modal, PageHead, Panel, titleCase } from './ui';

export function CityField({ value,onChange }: { value: Settings['location']; onChange(location: Settings['location']): void }) {
  const { t,i18n } = useTranslation();
  return <Field label={t('City')}><select value={cities.some((item) => item[0] === value.city) ? value.city : ''} onChange={(e) => {
    const city = cities.find((item) => item[0] === e.target.value);
    if (city) onChange({ city:city[0],latitude:city[2],longitude:city[3],timezone:'Africa/Cairo' });
    else onChange({ ...value,city:t('Custom location') });
  }}><option value="">{t('Custom location')}</option>{cities.map((item) => <option key={item[0]} value={item[0]}>{item[i18n.language === 'ar' ? 1 : 0]}</option>)}</select></Field>;
}
export function Onboarding({ close }: { close(): void }) {
  const { t,i18n } = useTranslation(),navigate = useNavigate();
  const settings = useSabri((s) => s.data.settings);
  const [stage,setStage] = useState(0);
  const finish = async (path?: string) => {
    await changeSettings({ onboarded:true });
    close();
    if (path) navigate(path);
  };
  const stages = ['Language','Location','Appearance','University data'];
  return <Modal title={t('Welcome to Sabri')} close={() => { void finish(); }}>
    <div className="onboarding-stages">{stages.map((item,index) => <span key={item} className={'pill '+(stage === index ? 'active-pill':'')}>{t(item)}</span>)}</div>
    {stage === 0 && <Field label={t('Language')}><select value={settings.language} onChange={(e) => { void changeSettings({ language:e.target.value === 'ar' ? 'ar':'en' }); }}><option value="en">{t('English')}</option><option value="ar">{t('Arabic')}</option></select></Field>}
    {stage === 1 && <><p>{t('Choose your city for local prayer times.')}</p><CityField value={settings.location} onChange={(location) => { void changeSettings({ location }); }}/></>}
    {stage === 2 && <div className="theme-grid">{themes.map((theme) => <button type="button" key={theme.id} className="theme-choice" aria-pressed={settings.theme === theme.id} onClick={() => { void changeSettings({ theme:theme.id }); }}>{theme.symbol} {i18n.t(theme.name)}</button>)}</div>}
    {stage === 3 && <p>{t('Bring in classes and deadlines from a file, copied timetable, or calendar link.')}</p>}
    <div className="form-actions"><Button variant="ghost" onClick={() => { void finish(); }}>{t('Skip setup')}</Button>{stage > 0 && <Button onClick={() => setStage(stage-1)}>{t('Previous')}</Button>}{stage < 3 ? <Button variant="primary" onClick={() => setStage(stage+1)}>{t('Next')}</Button> : <><Button onClick={() => { void finish('/import'); }}>{t('Import timetable')}</Button><Button variant="primary" onClick={() => { void finish(); }}>{t('Get started')}</Button></>}</div>
  </Modal>;
}
async function seed(settings: Settings) {
  const today = dayKey(new Date(),settings.location.timezone);
  const courses = [
    ['Data Structures','CS 201','Dr. A. Hassan','#7355c8'],
    ['Linear Algebra','MATH 210','Dr. M. Adel','#258574'],
    ['Digital Systems','ENG 214','Dr. S. Youssef','#b36236']
  ].map(([name,code,instructor,color],order) => courseSchema.parse({ ...fresh(),name,code,instructor,color,creditHours:3,semester:'Current semester',gradeComponents:[],finalGrade:'',absenceLimit:4,absences:0,order }));
  const schedule = courses.map((course,index) => scheduleSchema.parse({ ...fresh(),title:course.name,dayOfWeek:dayOf(today),start:['09:00','11:00','13:30'][index],end:['10:15','12:15','15:00'][index],courseCode:course.code,courseId:course.id,location:['Room B204','Room A112','Lab C03'][index],kind:index === 2 ? 'lab':'lecture',source:'manual' }));
  const tasks = ['Review lecture notes','Finish problem set','Prepare for the lab'].map((title,index) => taskSchema.parse({ ...fresh(),title,priority:['high','medium','low'][index],order:Date.now()+index,courseId:courses[index]?.id,dueDate:today }));
  const upcoming = eventSchema.parse({ ...fresh(),title:'Data Structures midterm',date:addDate(today,6),time:'10:00',location:'Room B204',type:'exam',courseId:courses[0]?.id,reminders:[10080,1440] });
  return patch([...courses.map((value) => ({ collection:'courses' as const,value })),...schedule.map((value) => ({ collection:'schedule' as const,value })),...tasks.map((value) => ({ collection:'tasks' as const,value })),{ collection:'calendar',value:upcoming }]);
}

export function SettingsPage() {
  const { t } = useTranslation(),nav = useNavigate();
  const { settings,themes:custom } = useSabri((s) => s.data);
  const [location,setLocation] = useState(settings.location);
  const [backups,setBackups] = useState<string[]>();
  const [restore,setRestore] = useState<string>();
  const [onboard,setOnboard] = useState(false);
  const [demo,setDemo] = useState(false);
  const focus = (value: Partial<Settings['focus']>) => { void changeSettings({ focus:{ ...settings.focus,...value } }); };
  const prayer = (value: Partial<Settings['prayer']>) => { void changeSettings({ prayer:{ ...settings.prayer,...value } }); };
  const notification = (value: Partial<Settings['notifications']>) => { void changeSettings({ notifications:{ ...settings.notifications,...value } }); };
  return <>
    <PageHead title={t('Settings')} description={t('Set up Sabri around your day.')}/>
    <div className="settings-grid">
      <Panel title={t('Appearance')} icon={Palette}>
        <div className="theme-grid visual-themes">{[...themes,...custom.filter((item) => !item.deletedAt).map((item) => ({ id:item.id,name:item.name,symbol:'◈',art:item.parent }))].map((theme) => <button type="button" key={theme.id} className="theme-choice" aria-pressed={settings.theme === theme.id} onClick={() => { void changeSettings({ theme:theme.id }); }}><img src={artwork[theme.art] ?? artwork.light} alt="" loading="lazy"/><span>{theme.symbol} {t(theme.name)}</span></button>)}</div>
        <div className="form-grid"><Field label={t('Language')}><select value={settings.language} onChange={(e) => { void changeSettings({ language:e.target.value === 'ar' ? 'ar':'en' }); }}><option value="en">{t('English')}</option><option value="ar">{t('Arabic')}</option></select></Field>
        <Field label={t('Time format')}><select value={settings.timeFormat} onChange={(event) => { void changeSettings({ timeFormat:event.target.value === '24h' ? '24h':'12h' }); }}><option value="12h">12h</option><option value="24h">24h</option></select></Field></div>
      </Panel>
      <ThemeEditor/>
      <Panel title={t('Location')} icon={MapPin} tone="mint">
        <form className="form-grid" onSubmit={async (e) => { e.preventDefault(); if (await changeSettings({ location })) tell(t('Saved')); }}>
          <CityField value={location} onChange={setLocation}/>
          <Field label={t('Location name')}><input required value={location.city} onChange={(e) => setLocation({ ...location,city:e.target.value })}/></Field>
          <Field label={t('Latitude')}><input required type="number" min={-90} max={90} step="any" value={location.latitude} onChange={(e) => setLocation({ ...location,latitude:+e.target.value })}/></Field>
          <Field label={t('Longitude')}><input required type="number" min={-180} max={180} step="any" value={location.longitude} onChange={(e) => setLocation({ ...location,longitude:+e.target.value })}/></Field>
          <Field label={t('Time zone')} wide><input required list="timezones" value={location.timezone} onChange={(e) => setLocation({ ...location,timezone:e.target.value })}/><datalist id="timezones">{Intl.supportedValuesOf('timeZone').map((zone) => <option key={zone} value={zone}/>)}</datalist></Field>
          <Button type="submit" variant="primary">{t('Save location')}</Button>
          <Button onClick={()=>{void window.sabri.estimateLocation().then(setLocation).catch(()=>tell(t('Could not estimate your location.')));}}>{t('Estimate from IP')}</Button>
          <small className="wide">{t('The IP estimate contacts ipapi.co and can be adjusted before saving.')}</small>
        </form>
      </Panel>
      <Panel title={t('Prayer times')} icon={Globe} tone="mint">
        <div className="form-grid">
          <Field label={t('Prayer method')}><select value={settings.prayer.method} onChange={(e) => prayer({ method:e.target.value as Settings['prayer']['method'] })}>{prayerMethods.map((item) => <option key={item} value={item}>{t(item.replace(/([a-z])([A-Z])/g,'$1 $2'))}</option>)}</select></Field>
          <Field label={t('School of thought')}><select value={settings.prayer.madhab} onChange={(e) => prayer({ madhab:e.target.value === 'hanafi' ? 'hanafi':'shafi' })}><option value="shafi">{t('Shafi')}</option><option value="hanafi">{t('Hanafi')}</option></select></Field>
          <Field label={t('High latitude rule')} wide><select value={settings.prayer.highLatitude} onChange={(e) => prayer({ highLatitude:e.target.value as Settings['prayer']['highLatitude'] })}>{['MiddleOfTheNight','SeventhOfTheNight','TwilightAngle'].map((value) => <option key={value}>{t(value)}</option>)}</select></Field>
          <strong className="wide">{t('Prayer offsets')} · {t('minutes')}</strong>
          {prayers.map((name) => <Field key={name} label={t(titleCase(name))}><input type="number" min={-120} max={120} step={1} key={settings.prayer.offsets[name]} defaultValue={settings.prayer.offsets[name]} onBlur={(e) => { if (e.target.checkValidity()) prayer({ offsets:{ ...settings.prayer.offsets,[name]:+e.target.value } }); }}/></Field>)}
          <label className="check-label wide"><input type="checkbox" checked={settings.prayer.pauseFocus} onChange={(e) => prayer({ pauseFocus:e.target.checked })}/>{t('Pause focus at prayer time')}</label>
          <label className="check-label wide"><input type="checkbox" checked={settings.prayer.ramadan} onChange={(e) => prayer({ ramadan:e.target.checked })}/>{t('Ramadan mode')}</label>
        </div>
      </Panel>
      <Panel title={t('Focus timer')} icon={Clock3}>
        <div className="form-grid">
        {([['work','Focus',1,120],['short','Short break',1,30],['long','Long break',5,60],['rounds','Rounds before a long break',1,10],['dailyGoal','Daily goal (minutes)',1,1440],['weeklyGoal','Weekly goal (minutes)',1,10080]] as const).map(([key,label,min,max]) => <Field key={key} label={t(label)}><input key={settings.focus[key]} type="number" min={min} max={max} step={1} defaultValue={settings.focus[key]} onBlur={(e) => {
          if (!e.target.checkValidity() || +e.target.value === settings.focus[key]) return;
          void changeSettings({ focus:{ ...settings.focus,[key]:+e.target.value } }).then(() => { if (useSabri.getState().data.timer.status === 'idle') void useSabri.getState().timer({ type:'select',phase:useSabri.getState().data.timer.phase }); });
        }}/></Field>)}
        {([['autoBreak','Auto-start breaks'],['autoWork','Auto-start focus'],['strict','Strict mode'],['quiet','Quiet during focus']] as const).map(([key,label]) => <label className="check-label" key={key}><input type="checkbox" checked={settings.focus[key]} onChange={(e) => focus({ [key]:e.target.checked })}/>{t(label)}</label>)}
        <Field label={t('Timer sound')}><select value={settings.focus.sound} onChange={(e) => focus({ sound:e.target.value as Settings['focus']['sound'] })}>{['bell','soft','off'].map((item) => <option key={item} value={item}>{t(titleCase(item))}</option>)}</select></Field>
        <Field label={t('Volume')}><input type="range" min={0} max={1} step={0.05} value={settings.focus.volume} onChange={(e) => focus({ volume:+e.target.value })}/></Field></div>
      </Panel>
      <Panel title={t('Schedule')} icon={BookOpen}><div className="form-grid">
        <Field label={t('Week starts on')}><select value={settings.weekStart} onChange={(e) => { void changeSettings({ weekStart:+e.target.value }); }}>{daysOfWeek.map((day,index) => <option key={day} value={index}>{t(day)}</option>)}</select></Field>
        <Field label={t('Drag snap (minutes)')}><select value={settings.snap} onChange={(e) => { void changeSettings({ snap:+e.target.value as Settings['snap'] }); }}>{[5,15,30].map((item) => <option key={item}>{item}</option>)}</select></Field>
        <Field label={t('Start time')}><input type="time" value={settings.dayStart} onChange={(e) => { if (e.target.value && e.target.value < settings.dayEnd) void changeSettings({ dayStart:e.target.value }); }}/></Field>
        <Field label={t('End time')}><input type="time" value={settings.dayEnd} onChange={(e) => { if (e.target.value>settings.dayStart) void changeSettings({ dayEnd:e.target.value }); }}/></Field>
        <label className="check-label wide"><input type="checkbox" checked={settings.hideFriday} onChange={(e) => { void changeSettings({ hideFriday:e.target.checked }); }}/>{t('Hide Friday in the weekly grid')}</label>
      </div></Panel>
      <Panel title={t('Notifications')} icon={Bell} tone="orange"><div className="form-grid">
        {([['enabled','Notifications enabled'],['prayerAt','Notify at prayer time'],['habits','Habit reminders'],['examMode','Exam mode']] as const).map(([key,label]) => <label className="check-label" key={key}><input type="checkbox" checked={settings.notifications[key]} onChange={(e) => notification({ [key]:e.target.checked })}/>{t(label)}</label>)}
        <Field label={t('Daily goal reminder')}><input type="time" value={settings.notifications.daysGoal} onChange={(e)=>{ if (e.target.value) notification({ daysGoal:e.target.value }); }}/></Field>
        {([['prayerLead','Prayer reminder (minutes)',120],['classLead','Class reminder (minutes)',1440],['taskLead','Task reminder (minutes)',1440],['breakAfter','Study break after (minutes)',720]] as const).map(([key,label,max]) => <Field key={key} label={t(label)}><input key={settings.notifications[key]} type="number" min={0} max={max} defaultValue={settings.notifications[key]} onBlur={(e) => { if (e.target.checkValidity()) notification({ [key]:+e.target.value }); }}/></Field>)}
      </div></Panel>
      <Panel title={t('Data and backups')} icon={Database} tone="blue">
        <p className="muted">{t('Your planner data is stored on this computer.')}</p>
        <div className="actions"><Button onClick={() => { void window.sabri.saveBackup().then((ok) => ok && tell(t('Saved'))).catch(() => tell(t('Could not export backup'))); }}>{t('Export backup')}</Button>
        <Button onClick={() => { void window.sabri.importBackup().then((ok) => ok && tell(t('Saved'))).catch(() => tell(t('Could not import backup'))); }}>{t('Import backup')}</Button>
        <Button icon={Archive} onClick={() => { void window.sabri.backups().then(setBackups); }}>{t('Automatic backups')}</Button></div>
        {backups && <div>{backups.map((id) => <div className="data-row" key={id}><span className="grow">{id}</span><Button onClick={() => setRestore(id)}>{t('Restore')}</Button></div>)}</div>}
      </Panel>
      <Panel title={t('About Sabri')} icon={Shield}><p className="muted">{t('Sabri (صبري) is a study planner for Windows, built around classes, focus, and daily prayers.')}</p>
        <div className="check-grid"><label className="check-label"><input type="checkbox" checked={settings.minimizeToTray} onChange={(e) => { void changeSettings({ minimizeToTray:e.target.checked }); }}/>{t('Minimize to tray')}</label><label className="check-label"><input type="checkbox" checked={settings.startAtLogin} onChange={(e) => { void changeSettings({ startAtLogin:e.target.checked }); }}/>{t('Launch at login')}</label></div>
        <div className="check-grid"><label className="check-label"><input type="checkbox" checked={settings.hmBar} onChange={(e) => { void changeSettings({ hmBar:e.target.checked }); }}/>{t('Show timer and next prayer in HM-Bar')}</label>
        <label className="check-label"><input type="checkbox" checked={settings.themeMotion} onChange={(e) => { void changeSettings({ themeMotion:e.target.checked }); }}/>{t('Animate theme artwork')}</label></div>
        <div className="actions"><Button icon={Sparkles} onClick={() => setDemo(true)}>{t('Use sample data')}</Button><Button onClick={() => setOnboard(true)}>{t('Run setup')}</Button><Button onClick={() => nav('/import')}>{t('University data')}</Button></div>
        <Updates/>
      </Panel>
    </div>
    {onboard && <Onboarding close={() => setOnboard(false)}/>}
    {demo && <Modal title={t('Use sample data')} close={() => setDemo(false)}><p>{t('Add example courses, classes, tasks, and an exam to this planner.')}</p><form onSubmit={async (e) => { e.preventDefault(); if (await seed(settings)) { setDemo(false);tell(t('Saved')); } }}><FormActions close={() => setDemo(false)} label={t('Use sample data')}/></form></Modal>}
    {restore && <Modal title={t('Restore backup')} close={() => setRestore(undefined)}><p>{t('Restore {{date}} and keep a backup of the current planner.',{ date:restore })}</p><form onSubmit={async (e) => { e.preventDefault();try { await window.sabri.restoreBackup(restore);tell(t('Saved'));setRestore(undefined); } catch { tell(t('Could not restore backup')); } }}><FormActions close={() => setRestore(undefined)} label={t('Restore')}/></form></Modal>}
  </>;
}
