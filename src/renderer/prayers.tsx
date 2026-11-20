import { useMemo, useState } from 'react';
import { Check, ChevronRight, Clock3, MapPin, Moon, Plus, Sunrise } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { computePrayers, nextPrayer } from '../shared/prayer';
import { active, prayers, prayerStatuses, type Prayer, type RecordFor } from '../shared/schema';
import { addDate, clock, dayKey, dayOf, friendlyDate } from '../shared/time';
import { countdownLabel } from '../shared/timer';
import { changeSettings, tell, useSabri } from './store';
import type { PrayerEdit } from '../shared/prayer-record';
import type { SabriApi } from '../shared/api';
import { Button, Field, PageHead, Pager, Panel, titleCase, useNow } from './ui';

export const filledPrayer = (day: RecordFor<'prayerDays'> | undefined) => prayers.filter((name) => day?.status[name] === 'done' || day?.status[name] === 'late').length;
export const prayerName = (name: Prayer,key: string) => name === 'dhuhr' && dayOf(key) === 5 ? 'Jumu’ah' : titleCase(name);
export function PrayerChecklist({ compact = false, date }: { compact?: boolean; date?: string }) {
  const { t } = useTranslation(),nav = useNavigate();
  const { settings,prayerDays } = useSabri((s) => s.data);
  const now = useNow(),today = dayKey(now,settings.location.timezone),key = date ?? today;
  const times = useMemo(() => computePrayers(key,settings),[key,settings]);
  const upcoming = useMemo(() => nextPrayer(now,settings),[now,settings]);
  const stored = active(prayerDays).find((item) => item.date === key);
  const edit = (fields: PrayerEdit['fields']) => {
    void window.sabri.checkPrayer({ date:key,fields }).then(useSabri.getState().receive).catch(()=>tell(t('Could not save changes')));
  };
  const completed = filledPrayer(stored);
  return <Panel title={t(compact ? 'Prayer times':'Prayer checklist')} icon={Moon} tone="mint" action={compact ? <Button variant="ghost" onClick={() => nav('/prayers')}>{t('View prayers')} <ChevronRight className="dir-arrow" size={15}/></Button> : <span className="pill"><MapPin size={13}/>{settings.location.city}</span>} className="prayer-card">
    {upcoming && key === today && <div className="next-prayer"><div><small>{t('Next prayer')}</small><strong>{t(prayerName(upcoming.name,upcoming.key))} <span>· {clock(upcoming.time,settings)}</span></strong></div><time dir="ltr">{countdownLabel(+new Date(upcoming.time) - +now)}</time></div>}
    <div className="prayer-list">{prayers.map((name) => {
      const status = stored?.status[name] ?? 'pending';
      const checked = status === 'done' || status === 'late';
      return <div key={name} className={'prayer-row '+(upcoming?.key === key && upcoming.name === name ? 'prayer-current':'')}>
        <button type="button" className="check-circle" aria-label={t(prayerName(name,key)) + ' · ' + t(status === 'pending' ? 'Complete' : 'Pending')} aria-pressed={checked} onClick={() => edit({ status:{ [name]:checked ? 'pending':'done' } })}>{checked && <Check size={13}/>}</button>
        <span className="grow">{t(prayerName(name,key))}</span><time>{times[name] ? clock(times[name],settings):'–'}</time>
        {!compact && <><select className="prayer-status" aria-label={t(prayerName(name,key))+' '+t('Status')} value={status} onChange={(e) => edit({ status:{ [name]:e.target.value as typeof status } })}>{prayerStatuses.map((item) => <option value={item} key={item}>{t(titleCase(item))}</option>)}</select><label className="check-label"><input type="checkbox" checked={stored?.congregation[name] ?? false} onChange={(e) => edit({ congregation:{ [name]:e.target.checked } })}/>{t('Congregation')}</label></>}
      </div>;
    })}</div>
    {!compact && <div className="prayer-row"><Sunrise size={17}/><span className="grow">{t('Sunrise')}</span><time>{times.sunrise ? clock(times.sunrise,settings):'–'}</time></div>}
    <div className="prayer-progress"><small>{t('{{count}} of 5 prayed',{ count:completed })}</small><progress value={completed} max={5}/></div>
    {!compact && <div className="check-grid">{(['duha','witr','tahajjud','rawatib'] as const).map((value) => <label key={value} className="check-label"><input type="checkbox" checked={stored?.sunnah[value] ?? false} onChange={(e) => edit({ sunnah:{ [value]:e.target.checked } })}/>{t(titleCase(value))}</label>)}
      {settings.prayer.ramadan && <><label className="check-label"><input type="checkbox" checked={stored?.fasting ?? false} onChange={(e) => edit({ fasting:e.target.checked })}/>{t('Fasting')}</label><label className="check-label"><input type="checkbox" checked={stored?.taraweeh ?? false} onChange={(e) => edit({ taraweeh:e.target.checked })}/>{t('Taraweeh')}</label></>}
    </div>}
  </Panel>;
}
export function PrayersPage() {
  const { t } = useTranslation(),nav = useNavigate();
  const { settings,prayerDays } = useSabri((s) => s.data);
  const now=useNow(settings.prayer.ramadan ? 1000:60000);
  const today = dayKey(now,settings.location.timezone);
  const [key,setKey] = useState(today);
  const [verify,setVerify] = useState<Awaited<ReturnType<SabriApi['verifyPrayer']>>>();
  const [busy,setBusy] = useState(false);
  const history = active(prayerDays);
  let streak = 0;
  for (let cursor = filledPrayer(history.find((day) => day.date === today)) === 5 ? today : addDate(today,-1); filledPrayer(history.find((day) => day.date === cursor)) === 5; cursor = addDate(cursor,-1)) streak++;
  return <><PageHead title={t('Prayer times')} description={t('A quiet space to keep track of your daily prayers.')} action={<Button icon={MapPin} onClick={() => nav('/settings')}>{t('Location settings')}</Button>}/>
    <div className="toolbar"><Pager back={() => setKey(addDate(key,-1))} forward={() => setKey(addDate(key,1))}>{friendlyDate(key,settings.language,{ weekday:'long',month:'long',day:'numeric' })}</Pager><Button onClick={() => setKey(today)}>{t('Today')}</Button></div>
    <div className="two-col"><PrayerChecklist date={key}/><div className="stack">
      <Panel title={t('Prayer history')} icon={Moon} tone="mint"><div className="metric">{streak} <span>{t('day streak')}</span></div><div className="heatmap">{Array.from({ length:35 },(_,index) => {
        const date = addDate(today,index-34),count = filledPrayer(history.find((item) => item.date === date));
        return <button className={'heat-cell heat-'+count} key={date} title={date+' · '+count+'/5'} aria-label={date+' · '+count+'/5'} onClick={() => setKey(date)}/>;
      })}</div></Panel>
      <Panel title={t('Qada counter')} icon={Clock3}><div className="toolbar"><strong className="metric">{settings.prayer.qada}</strong><div className="actions"><Button disabled={settings.prayer.qada < 1} onClick={() => { void changeSettings({ prayer:{ ...settings.prayer,qada:settings.prayer.qada-1 } }); }}>{t('Mark one prayed')}</Button><Button icon={Plus} onClick={() => { void changeSettings({ prayer:{ ...settings.prayer,qada:settings.prayer.qada+1 } }); }}>{t('Add')}</Button></div></div></Panel>
      {settings.prayer.ramadan && <Panel title={t('Ramadan')} icon={Moon}><div className="toolbar">{(['fajr','maghrib'] as const).map((name) => { const value = computePrayers(key,settings)[name]; return <Field key={name} label={t(name === 'fajr' ? 'Suhoor ends':'Iftar')}><strong>{value ? clock(value,settings):'–'}</strong>{key===today && Date.parse(value)>+now && <time dir="ltr">{countdownLabel(Date.parse(value)-+now)}</time>}</Field>; })}</div></Panel>}
      <Panel title={t('Compare calculation')} icon={Clock3}><p className="muted">{t('Comparing sends the selected date and saved coordinates to AlAdhan.')}</p>
      <Button onClick={async()=>{ setBusy(true);try { setVerify(await window.sabri.verifyPrayer(key)); } catch { tell(t('AlAdhan comparison unavailable')); } finally {setBusy(false);} }} disabled={busy}>{t('Verify with AlAdhan')}</Button>
      {verify?.map((item)=><div className="data-row" key={item.name}><strong className="grow">{t(prayerName(item.name,key))}</strong><small>{clock(item.local,settings)} / {clock(item.remote,settings)}</small><span className="pill">{item.minutes>0?'+':''}{item.minutes} {t('min')}</span></div>)}
      </Panel>
    </div></div>
  </>;
}
