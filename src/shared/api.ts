import type { State, Patch, TimerAction, Settings } from './schema';
import type { PrayerTimesMap } from './prayer';
export interface SabriApi {
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
