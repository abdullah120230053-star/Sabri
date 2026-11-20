import { readFile } from 'node:fs/promises';
import { expect,it } from 'vitest';
import { emptyState,applyPatch } from '../src/shared/schema';
import { importChanges } from '../src/shared/imports';
import { parseTable } from '../src/main/import-table';
import { exportIcs,parseIcs } from '../src/main/import-ics';
import { pdfText } from '../src/main/import-pdf';
import { blocksOn } from '../src/shared/time';

const fixture = (file: string) => new URL('./fixtures/'+file,import.meta.url);
it('reads CSV columns and English pasted rows',async () => {
  const csv=parseTable(await readFile(fixture('sis-english.csv'),'utf8'),'csv');
  expect(csv.rows).toMatchObject([
    { title:'Data Structures, Lab',kind:'lab',day:1,start:'09:00',end:'10:30',room:'B204',courseCode:'CS201',instructor:'Dr. Hassan' },
    { title:'Discrete Math',day:3,start:'11:00',end:'12:30',room:'A112' }
  ]);
  const pasted=parseTable(await readFile(fixture('sis-pasted.txt'),'utf8'),'text');
  expect(pasted.rows).toMatchObject([{ title:'Circuits',day:2,start:'10:00',end:'11:15',room:'Room C04' },{ day:4,start:'09:00',end:'10:30' }]);
});
it('reads Arabic numerals, 12-hour times, rowspan, and timetable grids',async () => {
  const html=parseTable(await readFile(fixture('sis-arabic.html'),'utf8'),'html');
  expect(html.rows).toMatchObject([{ title:'تحليل البيانات',day:0,start:'09:30',end:'11:00',room:'أ201' },{ title:'مختبر الفيزياء',day:0,start:'12:30',end:'14:00',room:'ب203' }]);
  const grid=parseTable(await readFile(fixture('sis-grid.html'),'utf8'),'html');
  expect(grid.rows).toMatchObject([{ title:'Digital Systems',day:6,start:'09:00' },{ title:'Algorithms Lab',day:4,end:'10:30' },{ title:'Linear Algebra',day:1 }]);
});
it('extracts table columns from PDF text coordinates',async () => {
  const extracted=await pdfText(await readFile(fixture('sis-sample.pdf')));
  const rows=parseTable(extracted,'pdf').rows;
  expect(rows).toMatchObject([{ title:'Data Structures',day:1,start:'09:00',end:'10:30',room:'B204',courseCode:'CS201' },{ title:'Physics Lab',kind:'lab',day:0,start:'13:00',end:'15:00',room:'Lab C',courseCode:'PHY102' }]);
});
it('deduplicates calendar refreshes, updates edited UIDs, and exports all-day events',async () => {
  const raw=await readFile(fixture('moodle.ics'),'utf8');
  const zone='Africa/Cairo';
  const preview=parseIcs(raw,zone);
  expect(preview.rows).toMatchObject([{ date:'2026-11-21',start:'20:30',eventType:'deadline' },{ date:'2026-11-26',start:'',eventType:'exam' }]);
  const state=emptyState(),feed='moodle-example';
  const imported=importChanges(state,{ rows:preview.rows,destination:'calendar' },feed);
  const updated=applyPatch(state,{ changes:imported.changes });
  expect(importChanges(updated,{ rows:preview.rows,destination:'calendar' },feed).saved).toBe(0);
  expect(importChanges(updated,{ rows:parseIcs(raw.replace('183000Z','173000Z'),zone).rows,destination:'calendar' },feed).saved).toBe(1);
  expect(parseIcs(exportIcs(updated,'calendar'),zone).rows).toMatchObject([{ start:'20:30' },{ start:'' }]);
});


it('retains term boundaries and excluded dates from a weekly university feed',()=>{
  const input=['BEGIN:VCALENDAR','VERSION:2.0','BEGIN:VEVENT','UID:term-one','DTSTART;TZID=Africa/Cairo:20261116T090000','DTEND;TZID=Africa/Cairo:20261116T103000','RRULE:FREQ=WEEKLY;COUNT=4','EXDATE;TZID=Africa/Cairo:20261123T090000','SUMMARY:Academic writing','END:VEVENT','END:VCALENDAR'].join('\r\n');
  const rows=parseIcs(input,'Africa/Cairo').rows;
  expect(rows[0]).toMatchObject({ recurrence:'weekly',date:'2026-11-16',untilDate:'2026-12-07',exceptionDates:['2026-11-23'],start:'09:00' });
  const state=emptyState();
  const scheduled=applyPatch(state,{ changes:importChanges(state,{ rows,destination:'schedule' }).changes });
  expect(blocksOn(scheduled.schedule,'2026-11-23')).toHaveLength(0);
  expect(blocksOn(scheduled.schedule,'2026-11-30')).toHaveLength(1);
  expect(blocksOn(scheduled.schedule,'2026-12-14')).toHaveLength(0);
});
