import { useEffect, useState } from 'react';
import { ArrowRight, CalendarDays, ClipboardPaste, Download, FileText, GraduationCap, Link2, RefreshCw, ShieldCheck, Trash2, TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { active, eventTypes, blockKinds, type RecordFor } from '../shared/schema';
import { providers, type Destination, type Format, type Mapping, type Preview, type Provider, type Row } from '../shared/imports';
import { dayOf } from '../shared/time';
import { remove, tell, useSabri } from './store';
import { Button, daysOfWeek, Empty, Field, IconButton, PageHead, Panel, Segments, titleCase } from './ui';

const providerName = { moodle:'Moodle',classroom:'Google Classroom',ejust:'E-JUST SIS',zewail:'Zewail City SIS',other:'Other university' };
const guide: Record<Provider,string> = {
  moodle:'Open Calendar in Moodle, then choose Export calendar. Download the ICS file or copy the private calendar URL.',
  classroom:'In Classroom, open Classwork and select Google Calendar. If your school permits calendar export, use the ICS file or the calendar’s private iCal link.',
  ejust:'Open SIS or Moodle from the E-JUST Student Service Hub. Export the timetable as a file, or copy the table from the signed-in page.',
  zewail:'Open your timetable in the student portal. Import a PDF, CSV, or calendar export, or paste the timetable table.',
  other:'Use your student portal’s export options or paste the timetable. Formats include PDF, CSV, HTML, text, and ICS.',
};
const mappings = { title:'Title',day:'Day',start:'Start time',end:'End time',room:'Room',code:'Course code',instructor:'Instructor' } as const;
type Source = 'file'|'paste'|'feed';
type SavedFeed = RecordFor<'feeds'>;

export function UniversityPage() {
  const { t } = useTranslation(),go = useNavigate();
  const feeds = useSabri((s) => s.data.feeds);
  const [provider,setProvider] = useState<Provider>('moodle');
  const [source,setSource] = useState<Source>('file');
  const [destination,setDestination] = useState<Destination>('schedule');
  const [format,setFormat] = useState<Format>('text');
  const [text,setText] = useState('');
  const [url,setUrl] = useState('');
  const [name,setName] = useState('');
  const [refresh,setRefresh] = useState(0);
  const [remember,setRemember] = useState(true);
  const [preview,setPreview] = useState<Preview>();
  const [enabled,setEnabled] = useState<boolean[]>([]);
  const [mapping,setMapping] = useState<Mapping>({});
  const [refreshing,setRefreshing] = useState<SavedFeed>();
  const [pending,setPending] = useState<string[]>([]);
  const [busy,setBusy] = useState(false);
  const [status,setStatus] = useState('');
  const show = (value: Preview | null) => {
    if (!value) return;
    setPreview(value);setEnabled(value.rows.map(() => true));
    if (!value.rows.length) setStatus(t('No rows found. Try another format or select a timetable table.'));
  };
  const changeSource = (value: Source) => {
    setSource(value);setDestination(value === 'feed' ? 'calendar':'schedule');setPreview(undefined);setRefreshing(undefined);setStatus('');
  };
  const run = async (get: () => Promise<Preview|null>, onError: string) => {
    setBusy(true);setStatus('');
    try { show(await get()); } catch { setStatus(t(onError)); } finally { setBusy(false); }
  };
  const previewText = (columns = mapping) => run(() => window.sabri.timetable({ format,text,mapping:columns }),'Could not read the pasted timetable.');
  useEffect(() => {
    const refresh = () => { void window.sabri.pendingFeeds().then(setPending).catch(() => undefined); };
    refresh();const id = setInterval(refresh,15000);
    return () => clearInterval(id);
  },[feeds]);
  const updateRow = (index: number,update: Partial<Row>) => setPreview((value) => value && { ...value,rows:value.rows.map((row,i) => i===index ? { ...row,...update }:row) });
  const valid = (row: Row) => row.cancelled || (row.title.trim() && (destination === 'calendar' ? row.date : row.day !== null && row.start && row.end && row.start<row.end && (row.recurrence !== 'once' || row.date)));
  const selected = preview?.rows.filter((_row,index) => enabled[index]) ?? [];
  const canSave = selected.length > 0 && selected.every(valid);
  const loadLink = () => {
    if (!url.trim()) return;
    setRefreshing(undefined);
    void run(() => window.sabri.previewFeed(url),'Could not read the calendar link. Use a direct HTTPS calendar export.');
  };
  const savePreview = async () => {
    if (!canSave) return;
    setBusy(true);setStatus('');
    try {
      const feed = refreshing ? { id:refreshing.id,name:refreshing.name,provider:refreshing.provider,refreshHours:refreshing.refreshHours }
        : source === 'feed' && remember ? { name:name.trim() || providerName[provider],url,provider,refreshHours:refresh }:undefined;
      const result = await window.sabri.commitImport({ rows:selected,destination,feed });
      setPreview(undefined);setUrl('');setRefreshing(undefined);
      tell(t('Imported {{saved}} rows · {{skipped}} unchanged or skipped',result));
      go(destination === 'calendar' ? '/calendar':'/schedule');
    } catch { setStatus(t('Could not save the reviewed import.')); } finally { setBusy(false); }
  };
  return <div className="university-page">
    <PageHead title={t('University data')} description={t('Bring your timetable and coursework into Sabri.')}/>
    <div className="import-intro"><div className="panel-label"><span className="tile tile-lilac"><GraduationCap size={22}/></span><div><h2>{t('Import from your university')}</h2><p>{t('Review and edit every row before adding it to your planner.')}</p></div></div><span className="pill"><ShieldCheck size={14}/>{t('No university sign-in needed')}</span></div>
    <section className="panel provider-section">
      <h2>{t('Choose a source')}</h2><div className="provider-grid">{providers.map((value) => <button key={value} type="button" className="provider-button" aria-pressed={provider===value} onClick={() => { setProvider(value);setName(''); }}><span className={'tile '+(value==='moodle'?'tile-orange':value==='classroom'?'tile-mint':'tile-lilac')}>{value==='moodle'||value==='classroom' ? <CalendarDays size={18}/> : <GraduationCap size={18}/>}</span><strong>{t(providerName[value])}</strong></button>)}</div>
      <p className="muted provider-guide">{t(guide[provider])}</p>
    </section>
    <div className="two-col import-columns">
      <Panel title={t('Add timetable or calendar')} icon={Download}>
        <Segments<Source> value={source} onChange={changeSource} label={t('Import method')} options={[{ value:'file',label:t('Upload file') },{ value:'paste',label:t('Paste timetable') },{ value:'feed',label:t('Calendar link') }]}/>
        {source === 'file' && <div className="file-zone"><span className="tile tile-lilac"><FileText size={19}/></span><strong>{t('Select a timetable or calendar file')}</strong><p className="muted">PDF, CSV, TSV, HTML, TXT, ICS</p><Button variant="primary" icon={Download} disabled={busy} onClick={() => {
          setRefreshing(undefined);
          void run(async () => {
            const result = await window.sabri.timetable({ format:'text' });
            if (result?.rows[0]?.source === 'ics') setDestination('calendar');
            return result;
          },'Could not read the file. Check that it has a text timetable or calendar.');
        }}>{t('Choose file')}</Button></div>}
        {source === 'paste' && <div className="stack input-stack"><Field label={t('Pasted format')}><select value={format} onChange={(e) => { setFormat(e.target.value as Format);setMapping({});setPreview(undefined);if (e.target.value==='ics') setDestination('calendar'); }}><option value="text">{t('Text / copied table')}</option><option value="html">HTML</option><option value="csv">CSV</option><option value="ics">ICS</option></select></Field>
          <Field label={t('Paste timetable')}><textarea rows={6} maxLength={8_000_000} value={text} onChange={(e) => setText(e.target.value)} onPaste={(e) => { const html = e.clipboardData.getData('text/html'); if (format === 'html' && html.includes('<table')) { e.preventDefault();setText(html); } }} placeholder={t('Example: Data Structures | Monday | 09:00–10:15 | B204')}/></Field>
          <Button variant="primary" icon={ClipboardPaste} disabled={busy || !text.trim()} onClick={() => { void previewText(); }}>{t('Preview rows')}</Button></div>}
        {source === 'feed' && <div className="stack input-stack"><Field label={t('Private calendar URL')}><input autoComplete="off" spellCheck={false} type="password" maxLength={3200} value={url} onChange={(e) => { setUrl(e.target.value);setPreview(undefined); }} placeholder="https://…"/></Field>
          <label className="check-label"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)}/>{t('Save this calendar source')}</label>
          {remember && <div className="form-grid"><Field label={t('Source name')}><input maxLength={200} placeholder={providerName[provider]} value={name} onChange={(e) => setName(e.target.value)}/></Field><Field label={t('Check for updates')}><select value={refresh} onChange={(e) => setRefresh(+e.target.value)}><option value={0}>{t('On demand')}</option><option value={6}>{t('Every 6 hours')}</option><option value={24}>{t('Daily')}</option><option value={168}>{t('Weekly')}</option></select></Field></div>}
          <Button variant="primary" icon={Link2} disabled={busy || !url.trim()} onClick={loadLink}>{t('Preview calendar')}</Button></div>}
      </Panel>
      <Panel title={t('Connected calendars')} icon={Link2} tone="mint">
        {active(feeds).length ? active(feeds).map((feed) => <div className="data-row" key={feed.id}><span className="grow"><strong>{feed.name}</strong><small>{feed.host}{pending.includes(feed.id) ? ' · '+t('Update ready to review'):''}</small></span>
          <IconButton label={t('Review refresh')} icon={RefreshCw} disabled={busy} onClick={() => { setRefreshing(feed);setSource('feed');setDestination(feed.destination);void run(() => window.sabri.refreshFeed(feed.id),'Could not refresh the calendar. Its export link may have changed.'); }}/><IconButton label={t('Disconnect calendar')} icon={Trash2} onClick={() => { void remove('feeds',feed); }}/>
        </div>) : <Empty compact icon={Link2} title={t('No calendars connected')} detail={t('Add a calendar link to review future updates here.')}/>}
      </Panel>
    </div>
    {busy && <p className="muted" role="status">{t('Working…')}</p>}
    {status && <p className="warning" role="alert"><TriangleAlert size={17}/>{status}</p>}
    {preview && <Panel title={t('Review imported rows')} icon={ClipboardPaste} action={<span className="pill">{t('{{count}} selected',{ count:selected.length })}</span>}>
      <div className="toolbar"><Segments<Destination> label={t('Import destination')} value={destination} onChange={setDestination} options={[{ value:'schedule',label:t('Schedule') },{ value:'calendar',label:t('Calendar') }]}/>
        <Button variant="primary" icon={ArrowRight} disabled={!canSave || busy} onClick={() => { void savePreview(); }}>{t('Save selected rows')}</Button></div>
      {!canSave && selected.length > 0 && <p className="warning"><TriangleAlert size={16}/>{t('Fill in the required fields or deselect incomplete rows.')}</p>}
      {preview.skipped > 0 && <p className="muted">{t('{{count}} rows could not be read',{ count:preview.skipped })}</p>}
      {source === 'paste' && preview.columns.length > 0 && <details className="mapping"><summary>{t('Map columns')}</summary><div className="form-grid">{Object.entries(mappings).map(([key,label]) => <Field key={key} label={t(label)}><select value={mapping[key as keyof Mapping] ?? ''} onChange={(e) => setMapping({ ...mapping,[key]:e.target.value === '' ? undefined:+e.target.value })}><option value="">{t('Automatic')}</option>{preview.columns.map((column,index) => <option key={index} value={index}>{column}</option>)}</select></Field>)}</div><Button onClick={() => { void previewText(); }}>{t('Apply column mapping')}</Button></details>}
      <div className="table-scroll"><table className="import-table"><thead><tr><th><input type="checkbox" aria-label={t('Select all rows')} checked={!!enabled.length && enabled.every(Boolean)} onChange={(e) => setEnabled(enabled.map(() => e.target.checked))}/></th><th>{t('Title')}</th><th>{t(destination === 'schedule' ? 'Day':'Date')}</th><th>{t('Start time')}</th><th>{t('End time')}</th><th>{t('Room')}</th><th>{t('Type')}</th>{destination === 'schedule' && <><th>{t('Recurrence')}</th><th>{t('Course code')}</th><th>{t('Instructor')}</th></>}</tr></thead><tbody>{preview.rows.map((row,index) => <tr key={index} className={!valid(row) || row.confidence < .75 ? 'review-warning':''}>
        <td><input type="checkbox" aria-label={t('Select row')+' '+(index+1)} checked={!!enabled[index]} onChange={(e) => setEnabled(enabled.map((value,n) => n===index ? e.target.checked:value))}/></td>
        <td><input aria-label={t('Title')+' '+(index+1)} value={row.title} maxLength={200} onChange={(e) => updateRow(index,{ title:e.target.value })}/>{row.cancelled && <small>{t('Cancelled in source')}</small>}{row.confidence < .75 && <small className="warning">{t('Needs review')}</small>}</td>
        <td>{destination === 'calendar' || row.recurrence==='once' ? <input type="date" aria-label={t('Date')+' '+(index+1)} value={row.date} onChange={(e) => updateRow(index,{ date:e.target.value,day:e.target.value ? dayOf(e.target.value):null })}/> : <select aria-label={t('Day')+' '+(index+1)} value={row.day ?? ''} onChange={(e) => updateRow(index,{ day:e.target.value!=='' ? +e.target.value:null })}><option value="">–</option>{daysOfWeek.map((key,i) => <option key={key} value={i}>{t(key)}</option>)}</select>}</td>
        <td><input type="time" aria-label={t('Start time')+' '+(index+1)} value={row.start} onChange={(e) => updateRow(index,{ start:e.target.value })}/></td><td><input type="time" aria-label={t('End time')+' '+(index+1)} value={row.end} onChange={(e) => updateRow(index,{ end:e.target.value })}/></td>
        <td><input aria-label={t('Room')+' '+(index+1)} value={row.room} maxLength={160} onChange={(e) => updateRow(index,{ room:e.target.value })}/></td>
        <td>{destination === 'schedule' ? <select aria-label={t('Type')+' '+(index+1)} value={row.kind} onChange={(e) => updateRow(index,{ kind:e.target.value as Row['kind'] })}>{blockKinds.map((key) => <option key={key} value={key}>{t(titleCase(key))}</option>)}</select> : <select aria-label={t('Type')+' '+(index+1)} value={row.eventType} onChange={(e) => updateRow(index,{ eventType:e.target.value as Row['eventType'] })}>{eventTypes.map((key) => <option key={key} value={key}>{t(titleCase(key))}</option>)}</select>}</td>
        {destination === 'schedule' && <><td><select aria-label={t('Recurrence')+' '+(index+1)} value={row.recurrence} onChange={(e) => updateRow(index,{ recurrence:e.target.value as Row['recurrence'] })}>{(['once','weekly','biweekly'] as const).map((key) => <option key={key} value={key}>{t(titleCase(key))}</option>)}</select></td><td><input aria-label={t('Course code')+' '+(index+1)} value={row.courseCode} maxLength={30} onChange={(e) => updateRow(index,{ courseCode:e.target.value })}/></td><td><input aria-label={t('Instructor')+' '+(index+1)} value={row.instructor} maxLength={120} onChange={(e) => updateRow(index,{ instructor:e.target.value })}/></td></>}
      </tr>)}</tbody></table></div>
    </Panel>}
  </div>;
}

