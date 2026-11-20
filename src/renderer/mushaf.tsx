import { useState } from 'react';
import { Bell, BookOpen, Bookmark, Check, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { active, type RecordFor } from '../shared/schema';
import { completeWerd, lastMushafPage, werdRange } from '../shared/mushaf-werd';
import { dayKey, localClock } from '../shared/time';
import mushaf from './data/mushaf.json';
import { changeSettings, fresh, remove, save, tell, useSabri } from './store';
import { Button, Empty, Field, FormActions, Modal, PageHead, Pager, Panel, useNow } from './ui';
import './mushaf.css';

type Werd = RecordFor<'mushafWerds'>;

function WerdEditor({ initial, close }: { initial: Werd; close(): void }) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(initial);
  const update = (fields: Partial<Werd>) => setDraft((current) => ({ ...current, ...fields }));
  return <Modal title={t(initial.title ? 'Edit Mushaf Werd' : 'New Mushaf Werd')} close={close}>
    <form className="form-grid" onSubmit={async (event) => {
      event.preventDefault();
      if (await save('mushafWerds', draft)) close();
    }}>
      <Field label={t('Title')} wide><input required autoFocus maxLength={200} value={draft.title} onChange={(e) => update({ title: e.target.value })}/></Field>
      <Field label={t('Next page')}><input required type="number" min={1} max={lastMushafPage} value={draft.nextPage} onChange={(e) => update({ nextPage: +e.target.value })}/></Field>
      <Field label={t('Pages per day')}><input required type="number" min={1} max={lastMushafPage} value={draft.pagesPerDay} onChange={(e) => update({ pagesPerDay: +e.target.value })}/></Field>
      <label className="check-label"><input type="checkbox" checked={draft.reminderEnabled} onChange={(e) => update({ reminderEnabled: e.target.checked })}/>{t('Daily reminder')}</label>
      <Field label={t('Reminder time')}><input type="time" required value={draft.reminderTime} onChange={(e) => update({ reminderTime: e.target.value })}/></Field>
      <FormActions close={close}/>
    </form>
    {initial.title && <div className="modal-secondary"><Button variant="danger" onClick={() => { void remove('mushafWerds', initial); close(); }}>{t('Delete')}</Button></div>}
  </Modal>;
}

function Mushaf() {
  const { t } = useTranslation();
  const { settings, mushafWerds } = useSabri((store) => store.data);
  const today = dayKey(useNow(60000), settings.location.timezone);
  const [page, setPage] = useState(settings.mushafPage);
  const [reading, setReading] = useState<string>();
  const [edit, setEdit] = useState<Werd>();
  const [jump, setJump] = useState(String(page));
  const number = new Intl.NumberFormat(settings.language, { useGrouping: false });
  const arabicNumber = new Intl.NumberFormat('ar-EG', { useGrouping: false });
  const changePage = (value: number) => {
    if (!Number.isInteger(value) || value < 1 || value > lastMushafPage) return;
    setPage(value);
    setJump(String(value));
  };
  const werd = active(mushafWerds).find((item) => item.id === reading && item.completedOn !== today);
  const range = werd ? werdRange(werd) : undefined;
  const verses = mushaf.pages[page - 1] ?? [];
  const sections: { chapter: number; verses: { ayah: number; text: string }[] }[] = [];
  for (const [surah, ayah, arabic] of verses) {
    if (typeof surah !== 'number' || typeof ayah !== 'number' || typeof arabic !== 'string') continue;
    const tail = sections.at(-1);
    const verse = { ayah, text: arabic };
    if (tail?.chapter === surah) tail.verses.push(verse);
    else sections.push({ chapter: surah, verses: [verse] });
  }
  const addWerd = () => setEdit({ ...fresh(), title: '', nextPage: page, pagesPerDay: 2, reminderTime: '19:00', reminderEnabled: true });
  const markDone = async (item: Werd) => {
    if (await save('mushafWerds', completeWerd(item, today))) {
      setReading(undefined);
      tell(t('Today’s Werd is complete'), () => { void save('mushafWerds', item); });
    }
  };
  return <div className="mushaf-page">
    <PageHead title={t('Quran Mushaf')} description={t('Read the Quran offline by Madinah Mushaf page, surah, or juz.')} action={<Button variant="primary" icon={Plus} onClick={addWerd}>{t('New Mushaf Werd')}</Button>}/>
    <div className="mushaf-layout">
      <Panel title={t('Quran Mushaf')} icon={BookOpen}>
        <div className="mushaf-controls">
          <Field label={t('Surah')}><select value="" onChange={(e) => { changePage(+e.target.value); setReading(undefined); }}><option value="">{t('Go to surah')}</option>{mushaf.chapters.map((chapter) => <option key={chapter.number} value={chapter.page}>{number.format(chapter.number)} · {settings.language === 'ar' ? chapter.name : chapter.transliteration}</option>)}</select></Field>
          <Field label={t('Juz')}><select value="" onChange={(e) => { changePage(+e.target.value); setReading(undefined); }}><option value="">{t('Go to juz')}</option>{mushaf.juzPages.map((start, index) => <option key={index} value={start}>{number.format(index+1)}</option>)}</select></Field>
          <form className="actions" onSubmit={(e) => { e.preventDefault(); changePage(+jump); }}>
            <Field label={t('Page')}><input type="number" min={1} max={lastMushafPage} required value={jump} onChange={(e) => setJump(e.target.value)}/></Field>
            <Button type="submit">{t('Go')}</Button>
          </form>
        </div>
        <div className="toolbar"><Pager back={() => changePage(page-1)} forward={() => changePage(page+1)}>
          {t('Page {{page}} of {{total}}', { page: number.format(page), total: number.format(lastMushafPage) })}
        </Pager><Button icon={Bookmark} disabled={settings.mushafPage === page} onClick={async () => { if (await changeSettings({ mushafPage: page })) tell(t('Saved')); }}>{t('Bookmark page')}</Button></div>
        {werd && range && <div className="mushaf-reading"><span>{werd.title} · {number.format(range.start)}–{number.format(range.end)}</span><Button icon={Check} onClick={() => { void markDone(werd); }}>{t('Mark today complete')}</Button></div>}
        <article className="mushaf-sheet" lang="ar" dir="rtl">
          {sections.map((section) => <section key={section.chapter}>
            <h3>{mushaf.chapters[section.chapter-1]?.name}</h3>
            <p>{section.verses.map(({ ayah, text }) => <span key={ayah}> {text}<span className="mushaf-ayah" aria-label={t('Ayah') + ' ' + arabicNumber.format(ayah)}>{arabicNumber.format(ayah)}</span> </span>)}</p>
          </section>)}
        </article>
        <small className="mushaf-credit">{t('Arabic text and page divisions by Tanzil Project.')} · {mushaf.url}</small>
      </Panel>
      <Panel title={t('Mushaf Werd')} icon={Bell} tone="mint">
        {!settings.notifications.enabled && <p className="warning" role="status">{t('Enable Sabri notifications in Settings to receive Werd reminders.')}</p>}
        {active(mushafWerds).length ? active(mushafWerds).map((item) => {
          const completed = item.completedOn === today;
          const { start, end } = werdRange(item);
          return <section className="mushaf-werd" key={item.id}>
            <div className="mushaf-werd-heading"><h3>{item.title}</h3>{completed && <span className="pill"><Check size={13}/>{t('Completed today')}</span>}</div>
            <p className="muted">{t(completed ? 'Next reading: pages {{start}}–{{end}}' : 'Today: pages {{start}}–{{end}}', { start: number.format(start), end: number.format(end) })}</p>
            <p className="muted">{item.reminderEnabled ? t('Daily at {{time}}', { time: localClock(item.reminderTime, settings) }) : t('Reminder paused')}</p>
            <div className="actions">
              {!completed && <Button variant="primary" onClick={() => { setReading(item.id); changePage(start); }}>{t('Open today’s reading')}</Button>}
              <Button onClick={() => setEdit(item)}>{t('Edit')}</Button>
            </div>
          </section>;
        }) : <Empty compact icon={BookOpen} title={t('No Werd yet')} detail={t('Choose a starting page, daily page count, and reminder time.')}/>}
      </Panel>
    </div>
    {edit && <WerdEditor initial={edit} close={() => setEdit(undefined)}/>}
  </div>;
}

export default Mushaf;
