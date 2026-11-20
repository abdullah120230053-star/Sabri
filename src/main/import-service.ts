import { safeStorage } from 'electron';
import { applyPatch, feedSchema, stamp } from '../shared/schema';
import { importChanges, type CommitImport, type Preview } from '../shared/imports';
import { parseIcs } from './import-ics';
import { Storage } from './storage';

const limit = 6_000_000;
export function calendarUrl(text: string) {
  const url = new URL(text.trim().replace(/^webcal:/i,'https:'));
  if (url.protocol !== 'https:' || url.username || url.password || !url.hostname || url.hash)
    throw new Error('Use an HTTPS or webcal calendar export link.');
  return url;
}
async function fetchCalendar(url: URL) {
  const response = await fetch(url,{ headers:{ Accept:'text/calendar, text/plain;q=0.9' },redirect:'error',signal:AbortSignal.timeout(18000) });
  if (!response.ok || !response.body) throw new Error('The calendar feed could not be downloaded.');
  const reader = response.body.getReader(),chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > limit) throw new Error('The calendar feed is too large.');
      chunks.push(chunk.value);
    }
  } finally { await reader.cancel().catch(() => undefined); }
  return Buffer.concat(chunks).toString('utf8');
}
export class CalendarFeeds {
  private pending = new Map<string,Preview>();
  private attempted = new Map<string,number>();
  private running = new Set<string>();
  constructor(private readonly storage: Storage) {}
  async preview(url: string) {
    try { return parseIcs(await fetchCalendar(calendarUrl(url)),this.storage.state.settings.location.timezone); }
    catch { throw new Error('Could not read that calendar link. Check that it is a direct HTTPS calendar export.'); }
  }
  async refresh(id: string) {
    const encrypted = await this.storage.readSecret(id);
    if (!encrypted || !safeStorage.isEncryptionAvailable()) throw new Error('Reconnect the calendar using its export link.');
    return this.preview(safeStorage.decryptString(Buffer.from(encrypted,'base64')));
  }
  listPending() { return [...this.pending.keys()]; }
  takePending(id: string) { return this.pending.get(id); }
  async poll() {
    for (const feed of this.storage.state.feeds) {
      if (feed.deletedAt) { this.pending.delete(feed.id);continue; }
      if (!feed.refreshHours || this.pending.has(feed.id) || this.running.has(feed.id)) continue;
      const latest = Math.max(Date.parse(feed.updatedFromSourceAt ?? feed.createdAt),this.attempted.get(feed.id) ?? 0);
      if (Date.now()-latest < feed.refreshHours*3600000) continue;
      this.running.add(feed.id);
      this.attempted.set(feed.id,Date.now());
      try { this.pending.set(feed.id,await this.refresh(feed.id)); } catch { /* Keep the last reviewed calendar on network errors. */ }
      finally { this.running.delete(feed.id); }
    }
  }
  async commit(input: CommitImport) {
    const id = input.feed?.id ?? (input.feed?.url ? crypto.randomUUID():undefined);
    const previous = id ? this.storage.state.feeds.find((item) => item.id === id && !item.deletedAt) : undefined;
    let feed: ReturnType<typeof feedSchema.parse> | undefined;
    if (input.feed && id) {
      if (input.feed.id && !previous) throw new Error('This calendar source no longer exists.');
      const host = input.feed.url ? calendarUrl(input.feed.url).host : previous?.host;
      if (!host) throw new Error('A calendar link is required.');
      if (input.feed.url) {
        if (!safeStorage.isEncryptionAvailable()) throw new Error('The operating system credential store is unavailable. Import the calendar as a file.');
        await this.storage.writeSecret(id,safeStorage.encryptString(input.feed.url).toString('base64'));
      }
      feed = feedSchema.parse({ ...stamp(id),...previous,name:input.feed.name,provider:input.feed.provider,host,refreshHours:input.feed.refreshHours,destination:input.destination,updatedFromSourceAt:new Date().toISOString() });
    }
    let result = { saved:0,skipped:0 };
    await this.storage.update((state) => {
      const parsed = importChanges(state,input,id);
      result = { saved:parsed.saved,skipped:parsed.skipped };
      if (feed) parsed.changes.push({ collection:'feeds',value:feed });
      if (!parsed.changes.length) return state;
      return applyPatch(state,{ changes:parsed.changes },new Date().toISOString());
    });
    if (id) this.pending.delete(id);
    return result;
  }
}
