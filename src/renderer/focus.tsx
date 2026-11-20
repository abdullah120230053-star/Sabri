import { useEffect, useState, type CSSProperties } from 'react';
import { CircleCheck, Coffee, Maximize2, Pause, Play, RotateCcw, SkipForward, Timer, TreePine } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { active, type Timer as TimerState } from '../shared/schema';
import { remaining, timerLabel } from '../shared/timer';
import { dayKey, friendlyDate } from '../shared/time';
import { useSabri } from './store';
import { ParkingInput, ParkingReview } from './parking-lot';
import { Button, Empty, Field, IconButton, PageHead, Panel, Segments, useNow } from './ui';

const phaseLabels = { focus:'Focus',short:'Short break',long:'Long break' };
export function FocusCard({ compact = false, mini = false }: { compact?: boolean; mini?: boolean }) {
  const { t } = useTranslation();
  const go = useNavigate();
  const state = useSabri((s) => s.data),action = useSabri((s) => s.timer);
  const { timer,settings } = state;
  const now = useNow(250),left = remaining(timer,+now);
  const running = timer.status === 'running';
  const start = t(running ? 'Pause' : timer.status === 'paused' ? 'Resume' : timer.phase === 'focus' ? 'Start focus':'Start');
  const strict = timer.phase === 'focus' && settings.focus.strict && timer.status !== 'idle';
  const task = state.tasks.find((item) => item.id === timer.taskId && !item.deletedAt);
  const course = state.courses.find((item) => item.id === timer.courseId && !item.deletedAt);
  const [check,setCheck] = useState(false);
  const [ready,setReady] = useState(false);
  function toggle() {
    if (check && !ready && timer.status === 'idle' && timer.phase === 'focus') return;
    void action({ type:'toggle' });
  }
  return <Panel title={t(mini ? 'Sabri' : 'Focus timer')} icon={Timer} action={!mini && <IconButton label={t(compact ? 'Open focus timer':'Mini timer')} icon={Maximize2} onClick={() => compact ? go('/focus') : void window.sabri.mini()}/>} className={'focus-card '+(compact ? 'focus-compact':'')}>
    {!mini && <Segments<TimerState['phase']> value={timer.phase} onChange={(phase) => { void action({ type:'select',phase }); }} label={t('Focus timer')} options={(Object.keys(phaseLabels) as TimerState['phase'][]).map((value) => ({ value,label:t(phaseLabels[value]) }))}/>}
    <div className={'time-dial '+(timer.phase === 'focus' ? '' : 'dial-rest')} style={{ '--dial-progress':Math.max(4,100*(1-left/timer.durationMs))+'%' } as CSSProperties} tabIndex={0} onKeyDown={(event) => {
      if (event.code === 'Space') { event.preventDefault();toggle(); }
      if (event.key.toLowerCase() === 's') void action({ type:'skip' });
      if (event.key.toLowerCase() === 'r') void action({ type:'reset' });
    }}>
      <div className="dial-core"><TreePine className="tree-icon" size={19}/><time dir="ltr">{timerLabel(left)}</time><span>{t(phaseLabels[timer.phase])}</span></div>
    </div>
    {!compact && !mini && <div className="focus-link">
      <Field label={t('Task')}><select value={task?.id ?? ''} onChange={(event) => { const selected = state.tasks.find((item) => item.id === event.target.value); void action({ type:'link',taskId:selected?.id,courseId:selected?.courseId }); }}><option value="">{t('No task linked')}</option>{active(state.tasks).filter((item) => item.status !== 'done' || item.id === task?.id).map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></Field>
      <Field label={t('Course')}><select value={course?.id ?? ''} onChange={(e) => { void action({ type:'link',taskId:task?.id,courseId:e.target.value || undefined }); }}><option value="">{t('No course')}</option>{active(state.courses).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
    </div>}
    {check && !compact && !mini && timer.status === 'idle' && timer.phase === 'focus' && <label className="check-label"><input type="checkbox" checked={ready} onChange={(event) => setReady(event.target.checked)}/>{t('My phone is away and my materials are ready.')}</label>}
    <div className="focus-actions"><IconButton label={t('Reset')} icon={RotateCcw} disabled={strict} onClick={() => { void action({ type:'reset' }); }}/><Button variant="primary" icon={running ? Pause : Play} onClick={toggle} disabled={check && !ready && timer.status === 'idle' && timer.phase === 'focus'}>{start}</Button><IconButton label={t('Skip')} icon={SkipForward} disabled={strict} onClick={() => { void action({ type:'skip' }); }}/></div>
    {!compact && !mini && <div className="focus-foot"><Button variant="ghost" onClick={() => { void action({ type:'extend' }); }}>{t('+5 min')}</Button><span className="muted">{t('Round {{current}} of {{total}}',{ current:timer.round % settings.focus.rounds + 1,total:settings.focus.rounds })}</span><Button variant="ghost" onClick={() => setCheck(!check)}>{t('Pre-focus checklist')}</Button></div>}
    {mini&&!compact&&<Button className="addon-section" onClick={()=>void window.sabri.captureParking()}>{t('Park a distraction')}</Button>}
  </Panel>;
}
export function FocusPage() {
  const { t } = useTranslation();
  const state = useSabri((s) => s.data);
  const sessions = active(state.sessions).slice().reverse().slice(0,30);
  const today = dayKey(useNow(60000),state.settings.location.timezone);
  const todaySessions = sessions.filter((item) => item.completed && item.type === 'focus' && dayKey(new Date(item.endedAt),state.settings.location.timezone) === today);
  return <><PageHead title={t('Focus timer')} description={t('Make room for one thing at a time.')}/>
    <div className="two-col"><FocusCard/><div className="stack"><Panel title={t('Daily focus')} icon={CircleCheck} tone="mint"><div className="metric">{Math.round(todaySessions.reduce((sum,item) => sum + item.actualMinutes,0))} <span>{t('minutes')}</span></div><p className="muted">{t('{{count}} completed sessions',{ count:todaySessions.length })}</p></Panel>
    <Panel title={t('Recent sessions')} icon={Coffee}>{sessions.length ? sessions.map((item) => <div className="data-row" key={item.id}><span className="grow"><strong>{t(phaseLabels[item.type])}</strong><small>{friendlyDate(dayKey(new Date(item.endedAt),state.settings.location.timezone),state.settings.language,{ month:'short',day:'numeric' })}</small></span><span className="pill">{Math.round(item.actualMinutes)} {t('min')}</span></div>) : <Empty compact icon={Coffee} title={t('No sessions yet')}/>}</Panel></div></div>
    <Panel title={t('Park a distraction')} icon={Timer}><ParkingInput/></Panel>
    {state.settings.parking.breakReview&&state.timer.phase!=='focus'&&<ParkingReview focused/>}
  </>;
}
export function useFocusSound() {
  const notices = useSabri((s) => s.data.notices);
  const focus = useSabri((s) => s.data.settings.focus);
  const chime = useSabri(s=>s.data.settings.progress.enabled&&s.data.settings.progress.cosmetics.sound==='chime');
  const last = notices.filter((item) => item.kind === 'focus').at(-1);
  useEffect(() => {
    if (!last || Date.now() - Date.parse(last.createdAt) > 3000 || focus.sound === 'off') return;
    const audio = new AudioContext();
    const main = audio.createGain();
    main.gain.value = focus.volume * 0.16;
    main.connect(audio.destination);
    const notes = chime ? [523,659,784] : focus.sound === 'soft' ? [440,550] : [659,784,988];
    const start = audio.currentTime;
    notes.forEach((hertz,index) => {
      const oscillator = audio.createOscillator(),gain = audio.createGain(),time = start + index * 0.17;
      oscillator.frequency.value = hertz;
      gain.gain.setValueAtTime(0.001,time);
      gain.gain.exponentialRampToValueAtTime(0.9,time+0.032);
      gain.gain.exponentialRampToValueAtTime(0.001,time+0.34);
      oscillator.connect(gain).connect(main);
      oscillator.start(time);
      oscillator.stop(time+0.35);
    });
    const cleanup = window.setTimeout(() => { void audio.close(); },1000);
    return () => { clearTimeout(cleanup); if (audio.state !== 'closed') void audio.close(); };
  },[last?.id]); // Only a newly delivered notification should play.
}

