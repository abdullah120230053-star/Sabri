import { load } from 'cheerio';
import { rowSchema, type Mapping, type Format, type Preview, type Row } from '../shared/imports';

const names = [
  ['sunday','sun','الأحد','الاحد','أحد'],
  ['monday','mon','الاثنين','الإثنين','اثنين'],
  ['tuesday','tue','tues','الثلاثاء','ثلاثاء'],
  ['wednesday','wed','الأربعاء','الاربعاء','أربعاء'],
  ['thursday','thu','thurs','الخميس','خميس'],
  ['friday','fri','الجمعة','جمعة'],
  ['saturday','sat','السبت','سبت'],
];
const normal = (input: string) => input.replace(/[٠-٩۰-۹]/g,(digit) => String(digit.charCodeAt(0) & 15)).replace(/[\u200e\u200f\u061c\u202a-\u202e]/g,'').replace(/[\u064b-\u065f]/g,'').trim();
function weekday(input: string) {
  const text = normal(input).toLowerCase();
  const tokens = text.split(/[\s،,|/()[\]:]+/);
  const found = names.findIndex((list) => list.some((name) => tokens.includes(name)));
  return found < 0 ? (/^[0-6]$/.test(text) ? +text:null) : found;
}
function clocks(input: string) {
  return Array.from(normal(input).matchAll(/\b([0-9]{1,2})\s*[:٫.]\s*([0-9]{2})(?:\s*(AM|PM|ص|م))?/gi)).flatMap((match) => {
    let hour = Number(match[1]);
    const minute = Number(match[2]),part = match[3]?.toLowerCase();
    if (hour > 23 || minute > 59 || (part && (hour < 1 || hour > 12))) return [];
    if (part) hour = (hour % 12) + (part === 'pm' || part === 'م' ? 12 : 0);
    return [String(hour).padStart(2,'0')+':'+String(minute).padStart(2,'0')];
  });
}
const aliases: Record<keyof Mapping,string[]> = {
  title:['title','course','subject','course name','module','المقرر','المادة','اسم المقرر','اسم المادة'],
  day:['day','weekday','اليوم'],
  start:['start','start time','from','time','begin','الوقت','من','بداية','وقت البداية'],
  end:['end','end time','to','finish','إلى','الى','نهاية','وقت النهاية'],
  room:['room','location','venue','hall','القاعة','المكان','قاعة'],
  code:['code','course code','رمز المقرر','كود','كود المقرر','الرمز'],
  instructor:['instructor','teacher','lecturer','المحاضر','المدرس','عضو هيئة التدريس'],
};
function detectHeader(cells: string[]): Mapping {
  const result: Mapping = {};
  for (const [key,list] of Object.entries(aliases)) {
    const idx = cells.findIndex((cell) => list.includes(normal(cell).toLowerCase().replace(/[_-]/g,' ')));
    if (idx >= 0) result[key as keyof Mapping] = idx;
  }
  return result;
}
export function splitDelimited(input: string,separator: string) {
  const records: string[][] = [];
  let line: string[] = [],cell = '',quoted = false;
  for (let idx=0;idx<input.length;idx++) {
    const value = input[idx];
    if (value === '"') {
      if (quoted && input[idx+1] === '"') { cell += '"';idx++; }
      else if (quoted || !cell) quoted = !quoted;
      else cell += value;
    } else if (!quoted && (value === separator || value === '\n' || value === '\r')) {
      line.push(cell.trim());cell='';
      if (value !== separator) { if (line.some(Boolean)) records.push(line);line=[];if (value === '\r' && input[idx+1] === '\n') idx++; }
    } else cell += value;
  }
  if (cell || line.length) { line.push(cell.trim());if (line.some(Boolean)) records.push(line); }
  return records;
}
function kindFor(text: string): Row['kind'] {
  if (/\b(lab|practical)\b|معمل|مختبر/i.test(text)) return 'lab';
  if (/\b(tutorial|section)\b|تمرين|سكشن/i.test(text)) return 'tutorial';
  if (/\b(exam|midterm|final)\b|امتحان|اختبار/i.test(text)) return 'exam';
  return 'lecture';
}
function parseRows(records: string[][],source: Format,mapping?: Mapping): Preview {
  const rows: Row[] = [];
  let skipped = 0;
  const header = records[0] ?? [];
  const automatic = detectHeader(header);
  const hasHeader = Object.keys(automatic).length >= 2;
  const columns = hasHeader ? header : [];
  const fields = { ...automatic,...mapping };
  const gridDays = header.map(weekday);
  const gridHours = header.map(clocks);
  const grid = !hasHeader && (gridDays.filter((day) => day !== null).length >= 2 || gridHours.filter((hours) => hours.length).length >= 2);
  const add = (title: string,day: number|null,start: string,end: string,room = '',code = '',instructor = '',confidence?: number) => {
    if (rows.length >= 1500) { skipped++;return; }
    const clean = normal(title).slice(0,200);
    if (!clean) { skipped++;return; }
    rows.push(rowSchema.parse({ title:clean,day,start,end,room:normal(room).slice(0,160),courseCode:normal(code).slice(0,30),instructor:normal(instructor).slice(0,120),kind:kindFor(clean),source,confidence:confidence ?? (day !== null && start && end && start < end ? .94:.48) }));
  };
  for (const cells of records.slice(hasHeader || grid ? 1:0)) {
    if (grid) {
      for (let idx=1;idx<cells.length;idx++) {
        const cell = cells[idx];
        if (!cell || /^[–—-]+$/.test(cell)) continue;
        const cellDay = gridDays[idx] ?? weekday(cells[0] ?? '');
        const found = (gridHours[idx]?.length ? gridHours[idx] : clocks(cells[0] ?? '')) ?? [];
        add(cell,cellDay,found[0] ?? '',found[1] ?? '');
      }
      continue;
    }
    const get = (key: keyof Mapping) => fields[key] === undefined ? undefined : cells[fields[key]!];
    const index = cells.findIndex((cell) => weekday(cell) !== null && clocks(cell).length === 0);
    const joined = cells.join(' ');
    const found = clocks(get('start') ?? joined);
    const day = weekday(get('day') ?? cells[index] ?? joined);
    const end = clocks(get('end') ?? '')[0] ?? found[1] ?? '';
    const inferred = cells.filter((cell,i) => i !== index && !clocks(cell).length)[0] ?? normal(joined.split(/\d{1,2}\s*[:٫.]\s*\d{2}/)[0] ?? '').replace(new RegExp('(?:^|\\s)(?:'+names.flat().join('|')+')(?=\\s|$)','gi'),' ').trim();
    const additional = cells.filter((cell,i) => i !== index && cell !== inferred && !clocks(cell).length);
    if (!found.length && day === null && !get('title')) { skipped++;continue; }
    const title = get('title') ?? inferred ?? '';
    const code = get('code') ?? /\b[A-Z]{2,6}\s*\d{2,5}\b/.exec(title)?.[0] ?? '';
    const room = get('room') ?? additional[0] ?? /(?:room|hall|قاعة)\s*[\p{L}\d-]+/iu.exec(joined)?.[0] ?? '';
    add(title,day,found[0] ?? '',end,room,code,get('instructor'));
  }
  return { rows,columns,skipped };
}
export function parseTable(input: string,format: Exclude<Format,'ics'>,mapping?: Mapping): Preview {
  const cleaned = input.replace(/^\uFEFF/,'');
  if (format === 'html') {
    const $ = load(cleaned);
    $('script,style,form,iframe,svg,noscript').remove();
    const tables = $('table').toArray().map((table) => {
      const rows: string[][] = [];
      const spans = new Map<number,{ text:string; remaining:number }>();
      for (const tr of $(table).find('tr').toArray().slice(0,1501)) {
        if ($(tr).closest('table')[0] !== table) continue;
        const cells: string[] = [];
        let position = 0;
        const fill = () => {
          for (let span = spans.get(position); span; span = spans.get(position)) {
            cells[position] = span.text;
            if (--span.remaining === 0) spans.delete(position);
            position++;
          }
        };
        for (const cell of $(tr).children('td,th').toArray().slice(0,100)) {
          fill();
          const text = $(cell).text().replace(/\s+/g,' ').trim();
          const across = Math.max(1,Math.min(20,+($(cell).attr('colspan') ?? 1) || 1));
          const down = Math.max(1,Math.min(100,+($(cell).attr('rowspan') ?? 1) || 1));
          for (let n=0;n<across;n++) { cells[position]=text;if (down>1) spans.set(position,{ text,remaining:down-1 });position++; }
        }
        fill();
        rows.push(cells);
      }
      return parseRows(rows,format,mapping);
    });
    return tables.sort((a,b) => b.rows.length-a.rows.length)[0] ?? { rows:[],columns:[],skipped:0 };
  }
  const first = cleaned.split(/\r?\n/)[0] ?? '';
  if (format === 'csv' || first.includes('\t')) return parseRows(splitDelimited(cleaned,first.includes('\t') ? '\t' : first.includes(';') && !first.includes(',') ? ';':','),format,mapping);
  return parseRows(cleaned.split(/\r?\n/).map((line) => line.trim().split(/\s*\|\s*| {2,}/)).filter((line) => line.some(Boolean)),format,mapping);
}

