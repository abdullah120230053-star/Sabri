import { randomUUID } from 'node:crypto';
import { copyFile,open, mkdir, readFile, rename, readdir, rm, stat } from 'node:fs/promises';
import { join,basename,extname } from 'node:path';
import { z } from 'zod';
import { applyPatch, emptyState, stateSchema, type State, type Patch } from '../shared/schema';
import { addDate, dayKey } from '../shared/time';
import { sanitizeNote } from './note-html';

export const backupId = z.string().regex(/^\d{4}-\d{2}-\d{2}(?:-migration-\d+)?$/);
const schemaHeader = z.object({ schemaVersion: z.number().int().nonnegative().default(0) });
const MAX_BYTES = 32 * 1024 * 1024;

export async function atomicWrite(target: string, contents: string) {
  const staging = target + '.' + randomUUID() + '.tmp';
  try {
    const handle = await open(staging, 'wx', 0o600);
    try { await handle.writeFile(contents, 'utf8'); await handle.sync(); } finally { await handle.close(); }
    await rename(staging, target);
  } finally { await rm(staging, { force: true }); }
}

export async function readText(path: string, maximum = MAX_BYTES) {
  if ((await stat(path)).size > maximum) throw new Error('File exceeds the allowed size.');
  return readFile(path, 'utf8');
}
export function migrate(value: unknown): State {
  const { schemaVersion } = schemaHeader.parse(value);
  if (schemaVersion > 1) throw new Error('This data was created by a newer version of Sabri.');
  if (schemaVersion === 0) return stateSchema.parse({ ...z.looseObject({}).parse(value), schemaVersion: 1 });
  return stateSchema.parse(value);
}

export class Storage {
  private data = emptyState();
  private queue: Promise<unknown> = Promise.resolve();
  private readonly listeners = new Set<(state: State) => void>();
  private readonly target: string;
  private readonly backups: string;
  recoveredFrom?: string;
  private dailyBackup?: string;

  constructor(private readonly directory: string) {
    this.target = join(directory, 'state.json');
    this.backups = join(directory, 'backups');
  }
  get state() { return this.data; }
  subscribe(listener: (state: State) => void) {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  async load() {
    await mkdir(this.backups, { recursive: true });
    const leftovers = (await readdir(this.directory)).filter((name) => /^state\.json\.[a-f0-9-]{36}\.tmp$/i.test(name));
    await Promise.all(leftovers.map((name) => rm(join(this.directory, name), { force: true })));
    let raw: string;
    try { raw = await readText(this.target); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      await atomicWrite(this.target, JSON.stringify(this.data));
      await this.backup();
      return this.data;
    }
    const parsed: unknown = (() => { try { return JSON.parse(raw); } catch { return null; } })();
    const version = schemaHeader.safeParse(parsed);
    if (version.success && version.data.schemaVersion > 1)
      throw new Error('This data was created by a newer version of Sabri.');
    try { this.data = migrate(parsed); }
    catch {
      const backup = await this.latestBackup();
      await rename(this.target, join(this.directory, 'state.corrupt-' + randomUUID() + '.json'));
      this.recoveredFrom = backup?.id ?? 'empty';
      this.data = backup?.state ?? emptyState();
      await atomicWrite(this.target, JSON.stringify(this.data));
    }
    if (version.success && version.data.schemaVersion < 1) {
      await this.writeBackup(dayKey() + '-migration-' + Date.now(), raw);
      await atomicWrite(this.target, JSON.stringify(this.data));
    }
    await this.backup();
    return this.data;
  }
  private async latestBackup() {
    for (const id of await this.listBackups()) {
      try { return { id, state: migrate(JSON.parse(await readText(join(this.backups, id, 'state.json')))) }; }
      catch { continue; }
    }
    return undefined;
  }
  private async writeBackup(id: string, value: string) {
    const dir = join(this.backups, id);
    await mkdir(dir, { recursive: true });
    await atomicWrite(join(dir, 'state.json'), value);
  }
  private async backup() {
    const today = dayKey(new Date(), this.data.settings.location.timezone);
    if (this.dailyBackup === today) return;
    const path = join(this.backups, today, 'state.json');
    const exists = await stat(path).then(() => true, () => false);
    if (!exists || this.data.revision > 0) await this.writeBackup(today, JSON.stringify(this.data));
    this.dailyBackup = today;
    const threshold = addDate(today, -13);
    for (const id of await this.listBackups())
      if (id.length === 10 && id < threshold) await rm(join(this.backups, id, 'state.json'), { force: true });
  }
  async listBackups() {
    const dirs = await readdir(this.backups, { withFileTypes: true });
    const available = await Promise.all(dirs.filter((dir) => dir.isDirectory() && backupId.safeParse(dir.name).success).map(async (dir) =>
      await stat(join(this.backups, dir.name, 'state.json')).then(() => dir.name, () => '')));
    return available.filter(Boolean).sort().reverse();
  }
  soundPath(file: string) {
    return join(this.directory,'sounds',z.string().regex(/^[a-f0-9-]{36}\.(mp3|wav|ogg|m4a|flac)$/i).parse(file));
  }
  async addSound(path: string) {
    const id=randomUUID(),extension=extname(path).toLowerCase(),file=id+extension;
    const target=this.soundPath(file);
    if ((await stat(path)).size>50_000_000) throw new Error('Audio file is too large.');
    await mkdir(join(this.directory,'sounds'),{ recursive:true });
    const staging=target+'.tmp';
    try { await copyFile(path,staging);await rename(staging,target); }
    finally { await rm(staging,{ force:true }); }
    return { id,name:basename(path,extname(path)).slice(0,200),file };
  }
  async readPhoneKeys(key: 'phone-push'|'phone-tls') {
    try { return JSON.parse(await readText(join(this.directory,key+'.json'),25000)) as unknown; }
    catch (error) { if ((error as NodeJS.ErrnoException).code==='ENOENT') return undefined;throw error; }
  }
  writePhoneKeys(key: 'phone-push'|'phone-tls',value: unknown) { return atomicWrite(join(this.directory,key+'.json'),JSON.stringify(value)); }
  async readDevices() {
    try { return JSON.parse(await readText(join(this.directory,'devices.json'),250000)) as unknown; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
  }
  writeDevices(devices: unknown) { return atomicWrite(join(this.directory,'devices.json'),JSON.stringify(devices)); }
  async readSecret(id: string) {
    const path = join(this.directory, 'calendar-secrets', z.uuid().parse(id) + '.enc');
    try { return await readText(path, 20000); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; }
  }
  async writeSecret(id: string, value: string) {
    const directory = join(this.directory, 'calendar-secrets');
    await mkdir(directory, { recursive: true });
    await atomicWrite(join(directory, z.uuid().parse(id) + '.enc'), value);
  }
  restore(id: string) {
    return this.update(async () => migrate(JSON.parse(await readText(join(this.backups, backupId.parse(id), 'state.json')))), true);
  }
  patch(patch: Patch) {
    return this.update((state) => applyPatch(state, patch, new Date().toISOString()));
  }
  update(change: (state: State) => State | Promise<State>, preflight = false) {
    const work = this.queue.then(async () => {
      const next = await change(this.data);
      if (next === this.data) return this.data;
      const before = new Map(this.data.notes.map((note) => [note.id,note.content]));
      const notes = next.notes===this.data.notes ? next.notes : next.notes.map((note) => before.get(note.id)===note.content ? note : { ...note,content:sanitizeNote(note.content) });
      const validated = stateSchema.parse({ ...next, notes, revision: this.data.revision + 1 });
      const serialized = JSON.stringify(validated);
      if (Buffer.byteLength(serialized) > MAX_BYTES) throw new Error('Data exceeds the storage limit.');
      if (preflight) await this.writeBackup(dayKey() + '-migration-' + Date.now(), JSON.stringify(this.data));
      await atomicWrite(this.target, serialized);
      this.data = validated;
      this.backup().catch((error: unknown) => console.error('Sabri backup failed', error));
      for (const listener of this.listeners) {
        try { listener(validated); } catch (error) { console.error('Sabri state listener failed', error); }
      }
      return validated;
    });
    this.queue = work.catch(() => undefined);
    return work;
  }
  async drain() { await this.queue; }
}
