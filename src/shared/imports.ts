import { z } from 'zod';
import { active, blockKinds, eventTypes, date, time, eventSchema, scheduleSchema, stamp, type Patch, type State } from './schema';
import { dayOf } from './time';

export const importFormats = ['text','html','csv','pdf','ics'] as const;
export const providers = ['moodle','classroom','ejust','zewail','other'] as const;
export const destinationSchema = z.enum(['schedule','calendar']);
export const formatSchema = z.enum(importFormats);
export const mappingSchema = z.object({ title:z.number().int().min(0).max(100).optional(), day:z.number().int().min(0).max(100).optional(), start:z.number().int().min(0).max(100).optional(), end:z.number().int().min(0).max(100).optional(), room:z.number().int().min(0).max(100).optional(), code:z.number().int().min(0).max(100).optional(), instructor:z.number().int().min(0).max(100).optional() });
export const rowSchema = z.object({
  title:z.string().max(200), courseCode:z.string().max(30).default(''), instructor:z.string().max(120).default(''), room:z.string().max(160).default(''),
  description:z.string().max(8000).default(''), day:z.number().int().min(0).max(6).nullable().default(null), start:z.union([time,z.literal('')]).default(''), end:z.union([time,z.literal('')]).default(''), date:z.union([date,z.literal('')]).default(''),
  kind:z.enum(blockKinds).default('lecture'), eventType:z.enum(eventTypes).default('event'), recurrence:z.enum(['once','weekly','biweekly']).default('weekly'),
  confidence:z.number().min(0).max(1), source:formatSchema, externalUid:z.string().max(1500).optional(), cancelled:z.boolean().default(false)
});
export type Row = z.infer<typeof rowSchema>;
export type Format = z.infer<typeof formatSchema>;
export type Provider = typeof providers[number];
export type Destination = z.infer<typeof destinationSchema>;
export type Mapping = z.infer<typeof mappingSchema>;
export type Preview = { rows: Row[]; columns: string[]; skipped: number };
export const importRequest = z.object({ format:formatSchema, text:z.string().max(8_000_000).optional(), mapping:mappingSchema.optional() });
export const feedPreviewRequest = z.object({ url:z.string().min(1).max(3200) });
export const refreshRequest = z.object({ id:z.uuid() });
export const feedConfig = z.object({ id:z.uuid().optional(), name:z.string().trim().min(1).max(200), provider:z.enum(providers), url:z.string().min(1).max(3200).optional(), refreshHours:z.number().int().min(0).max(168) });
export const commitImportRequest = z.object({ rows:z.array(rowSchema).max(1500), destination:destinationSchema, feed:feedConfig.optional() });
export type CommitImport = z.infer<typeof commitImportRequest>;

export function importChanges(state: State, { rows, destination }: CommitImport, feedId?: string): { changes: Patch['changes']; saved: number; skipped: number } {
  const changes: Patch['changes'] = [];
  const collection = destination === 'schedule' ? 'schedule' : 'calendar';
  const records = state[collection];
  const uids = new Map(records.flatMap((record) => record.externalUid ? [[record.externalUid,record] as const]:[]));
  const signatures = new Map(records.map((item) => {
    const key = 'start' in item ? [item.title.toLowerCase(),item.dayOfWeek,item.start,item.end,item.recurrence,item.onDate ?? ''] : [item.title.toLowerCase(),item.date,item.time ?? ''];
    return [key.join('|'),item] as const;
  }));
  let saved = 0,skipped = 0;
  for (const row of rows) {
    const externalUid = row.externalUid ? (feedId ? feedId+':':'file:')+row.externalUid : undefined;
    const existing = externalUid ? uids.get(externalUid) ?? uids.get('file:'+row.externalUid) : undefined;
    if (row.cancelled) {
      if (existing && !existing.deletedAt) { changes.push({ collection,value:{ ...existing,deletedAt:new Date().toISOString() } }); saved++; }
      else skipped++;
      continue;
    }
    if (existing?.deletedAt) { skipped++;continue; }
    const course = active(state.courses).find((item) => (row.courseCode && item.code.replace(/\s/g,'').toLowerCase() === row.courseCode.replace(/\s/g,'').toLowerCase()) || item.name.toLowerCase() === row.title.toLowerCase());
    const fields = { ...existing,...(existing ? {} : stamp()),title:row.title,courseId:course?.id ?? existing?.courseId, location:row.room,externalUid };
    const built = destination === 'schedule'
      ? scheduleSchema.safeParse({ ...fields,dayOfWeek:row.day ?? (row.date ? dayOf(row.date):null),start:row.start,end:row.end,onDate:row.recurrence === 'weekly' ? undefined : row.date || undefined,recurrence:row.recurrence,kind:row.kind,source:row.source,courseCode:row.courseCode,instructor:row.instructor,importConfidence:row.confidence,notes:row.description })
      : eventSchema.safeParse({ ...fields,date:row.date,time:row.start || undefined,endTime:row.end || undefined,type:row.eventType,source:row.source === 'ics' ? 'ics':'manual',description:row.description,reminders:existing && 'reminders' in existing ? existing.reminders : row.eventType === 'exam' ? [10080,1440]:[1440] });
    if (!built.success) { skipped++;continue; }
    const item = built.data;
    const signature = ('start' in item ? [item.title.toLowerCase(),item.dayOfWeek,item.start,item.end,item.recurrence,item.onDate ?? ''] : [item.title.toLowerCase(),item.date,item.time ?? '']).join('|');
    if (existing && JSON.stringify(existing) === JSON.stringify(item)) { skipped++;continue; }
    if (!externalUid && signatures.has(signature)) { skipped++;continue; }
    if (externalUid) uids.set(externalUid,item);
    signatures.set(signature,item);
    changes.push({ collection,value:item });
    saved++;
  }
  return { changes,saved,skipped };
}
