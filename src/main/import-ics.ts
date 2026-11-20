import ICAL from 'ical.js';
import { formatInTimeZone } from 'date-fns-tz';
import { createHash } from 'node:crypto';
import { rowSchema, type Preview, type Row } from '../shared/imports';
import { dayOf, atTime, addDate, dayKey, blocksOn } from '../shared/time';
import { active, type State } from '../shared/schema';

const digest = (value: string) => createHash('sha256').update(value).digest('hex');
function eventType(title: string): Row['eventType'] {
  if (/\b(exam|final|midterm)\b|امتحان|اختبار نهائي/i.test(title)) return 'exam';
  if (/\b(quiz)\b|اختبار قصير/i.test(title)) return 'quiz';
  if (/\b(due|deadline|closes)\b|موعد التسليم/i.test(title)) return 'deadline';
  if (/\b(assignment|homework|submission)\b|واجب|تكليف/i.test(title)) return 'assignment';
  return 'event';
}
function toLocal(value: InstanceType<typeof ICAL.Time>,zone: string,sourceZone?: unknown) {
  const date=value.toString().slice(0,10),time=value.toString().slice(11,16);
  if (value.isDate) return { date,time:'' };
  if (value.zone.tzid==='floating' && typeof sourceZone!=='string') return { date,time };
  let instant=value.toJSDate();
  if (value.zone.tzid==='floating' && typeof sourceZone==='string') {
    instant=atTime(date,time,sourceZone);
    if (!Number.isFinite(+instant)) return { date,time };
  }
  return { date:formatInTimeZone(instant,zone,'yyyy-MM-dd'),time:formatInTimeZone(instant,zone,'HH:mm') };
}
export function parseIcs(raw: string,zone: string): Preview {
  if (!/^\s*BEGIN:VCALENDAR\s*$/im.test(raw)) throw new Error('The file is not an iCalendar calendar.');
  const calendar = new ICAL.Component(ICAL.parse(raw));
  const localZones = calendar.getAllSubcomponents('vtimezone').map((component) => new ICAL.Timezone({ component }));
  const registered = new Map(localZones.map((value) => [value.tzid,ICAL.TimezoneService.get(value.tzid)] as const));
  localZones.forEach((value) => ICAL.TimezoneService.register(value));
  try {
    const rows: Row[] = [];
    let skipped = 0;
    for (const component of calendar.getAllSubcomponents('vevent')) {
      if (rows.length >= 1500) { skipped++;continue; }
      try {
        const event = new ICAL.Event(component);
        const title = (event.summary || (component.getFirstPropertyValue('status') === 'CANCELLED' ? 'Cancelled':'')).trim().slice(0,200);
        if (!event.uid || !event.startDate || !title) { skipped++;continue; }
        const sourceZone=component.getFirstProperty('dtstart')?.getParameter('tzid');
        const start = toLocal(event.startDate,zone,sourceZone),end = toLocal(event.endDate,zone,sourceZone);
        const rule = component.getFirstPropertyValue('rrule');
        const recurring = rule instanceof ICAL.Recur && rule.freq === 'WEEKLY' && rule.interval <= 2 && !event.recurrenceId;
        const recurrence = recurring ? (rule.interval===2 ? 'biweekly':'weekly') : 'once';
        const explicitExceptions=component.getAllProperties('exdate').flatMap((property)=>property.getValues()).filter((value)=>value instanceof ICAL.Time).map((value)=>toLocal(value,zone,sourceZone).date);
        let occurrences=[start.date];
        if (recurring && (rule.count || rule.until || rule.getComponent('BYDAY').length>1)) {
          const iterator=event.iterator();
          occurrences=[];
          const finite=!!(rule.count || rule.until);
          for (let index=0;index<(finite?450:14);index++) {
            const current=iterator.next();
            if (!current) break;
            occurrences.push(toLocal(current,zone,sourceZone).date);
          }
        }
        const type = eventType(title);
        const grouped = Map.groupBy(occurrences,dayOf);
        for (const [day,dates] of grouped) {
          if (rows.length>=1500) { skipped++;break; }
          const firstDate=dates[0]!;
          const untilDate=recurring && (rule.count || rule.until) ? dates.at(-1):undefined;
          const implicitExceptions:string[]=[];
          if (untilDate && recurring) {
            const allowed=new Set(dates);
            for (let value=firstDate;value<untilDate;value=addDate(value,rule.interval*7)) if (!allowed.has(value)) implicitExceptions.push(value);
          }
          rows.push(rowSchema.parse({ title,room:(event.location || '').slice(0,160),description:(event.description || '').slice(0,8000),
          day,date:firstDate,start:start.time,end:end.date === start.date ? end.time : '',kind:type === 'exam' ? 'exam' : /\blab\b/i.test(title) ? 'lab':'lecture',eventType:type,source:'ics',confidence:1,
          recurrence,untilDate,exceptionDates:[...new Set([...explicitExceptions,...implicitExceptions])].slice(0,450),externalUid:digest(event.uid+(event.recurrenceId ? '\n'+event.recurrenceId.toString():day===dayOf(start.date)?'':'\nday:'+day)),cancelled:component.getFirstPropertyValue('status') === 'CANCELLED' }));
        }
      } catch { skipped++; }
    }
    return { rows,columns:[],skipped };
  } finally {
    for (const [key,old] of registered) {
      ICAL.TimezoneService.remove(key);
      if (old) ICAL.TimezoneService.register(old);
    }
  }
}
export function exportIcs(state: State,scope: 'calendar'|'schedule',today = dayKey(new Date(),state.settings.location.timezone)) {
  const timezone = state.settings.location.timezone;
  const calendar = new ICAL.Component(['vcalendar',[],[]]);
  calendar.updatePropertyWithValue('prodid','-//Sabri//Study planner//EN');
  calendar.updatePropertyWithValue('version','2.0');
  const zone = new ICAL.Timezone({ tzid:timezone });
  const create = (item: { id:string;title:string;location:string;date:string;start?:string;end?:string;notes?:string;recurrence?:string;untilDate?:string;exceptionDates?:string[] }) => {
    const event = new ICAL.Event();
    event.uid = item.id+'@sabri.app';
    event.summary = item.title;
    event.location = item.location;
    if (item.notes) event.description = item.notes;
    if (item.start && item.recurrence && item.recurrence !== 'once') {
      const local = (time: string) => {
        const value = ICAL.Time.fromDateTimeString(item.date+'T'+time+':00');
        value.zone = zone;
        return value;
      };
      event.startDate = local(item.start);
      if (item.end) event.endDate = local(item.end);
      const rule=ICAL.Recur.fromString(item.recurrence === 'biweekly' ? 'FREQ=WEEKLY;INTERVAL=2':'FREQ=WEEKLY');
      if (item.untilDate) rule.until=ICAL.Time.fromJSDate(atTime(item.untilDate,'23:59',timezone),true);
      event.component.addPropertyWithValue('rrule',rule);
      for (const date of item.exceptionDates ?? []) {
        if (date<item.date || !item.start) continue;
        const exclusion=ICAL.Time.fromDateTimeString(date+'T'+item.start+':00');
        exclusion.zone=zone;
        const property=event.component.addPropertyWithValue('exdate',exclusion);
        property.setParameter('tzid',timezone);
      }
    } else {
      event.startDate = item.start ? ICAL.Time.fromJSDate(atTime(item.date,item.start,timezone),true):ICAL.Time.fromDateString(item.date);
      if (item.end) event.endDate = ICAL.Time.fromJSDate(atTime(item.date,item.end,timezone),true);
    }
    event.component.updatePropertyWithValue('dtstamp',ICAL.Time.now());
    calendar.addSubcomponent(event.component);
  };
  if (scope === 'calendar') for (const item of active(state.calendar)) create({ ...item,start:item.time,end:item.endTime,notes:item.description });
  else for (const block of active(state.schedule)) {
    const date = block.recurrence === 'once' ? block.onDate : Array.from({ length:14 },(_,index) => addDate(today,index)).find((key) => blocksOn([block],key).length);
    if (date) create({ ...block,date,recurrence:block.weeks !== 'all' && block.recurrence === 'weekly' ? 'biweekly':block.recurrence });
  }
  return calendar.toString()+'\r\n';
}
