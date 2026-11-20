import type { State, Patch, TimerAction, Settings } from './schema';
import type { PrayerTimesMap } from './prayer';
import type { CommitImport, Format, Mapping, Preview } from './imports';
export interface SabriApi {
  timetable(input: { format: Format; text?: string; mapping?: Mapping }): Promise<Preview | null>;
  previewFeed(url: string): Promise<Preview>;
  pendingFeeds(): Promise<string[]>;
  refreshFeed(id: string): Promise<Preview>;
  commitImport(input: CommitImport): Promise<{ saved: number; skipped: number }>;
  exportCalendar(scope: 'schedule'|'calendar'|'csv'): Promise<boolean>;
  load(): Promise<{ state: State; recoveredFrom?: string }>;
  apply(patch: Patch): Promise<State>;
  timer(action: TimerAction): Promise<State>;
  changed(listener: (state: State) => void): () => void;
  saveBackup(): Promise<boolean>;
  importBackup(): Promise<boolean>;
  backups(): Promise<string[]>;
  restoreBackup(id: string): Promise<State>;
  prayers(input: { key: string; settings: Settings }): Promise<PrayerTimesMap>;
  mini(): Promise<void>;
  onShortcut(listener: (name: string) => void): () => void;
  print(): Promise<void>;
}
declare global { interface Window { sabri: SabriApi } }
