import { create } from 'zustand';
import { applyPatch, emptyState, patchSchema, stamp, type Collection, type Patch, type RecordFor, type Settings, type State, type TimerAction } from '../shared/schema';
import i18n from './i18n';

type Toast = { message: string; undo?: () => void; id: string };
type Store = { data: State; loaded: boolean; toast?: Toast; reload(): Promise<void>; receive(state: State): void; apply(patch: Patch): Promise<boolean>; notice(message: string, undo?: () => void): void; dismiss(): void; timer(action: TimerAction): Promise<void> };
let confirmed = emptyState();
const pending: { token: string; patch: Patch }[] = [];
const displayed = () => pending.reduce((state, item) => applyPatch(state, item.patch), confirmed);
let queue: Promise<unknown> = Promise.resolve();

export const useSabri = create<Store>((set, get) => ({
  data: confirmed, loaded: false,
  async reload() {
    try {
      const { state, recoveredFrom } = await window.sabri.load();
      get().receive(state);
      set({ loaded: true });
      if (recoveredFrom) get().notice(i18n.t('Sabri recovered your data from a backup.'));
    } catch {
      set({ loaded: true });
      get().notice(i18n.t('Could not load your data'));
    }
  },
  receive(state) {
    if (state.revision < confirmed.revision) return;
    confirmed = state;
    set({ data: displayed() });
  },
  async apply(input) {
    const validated = patchSchema.safeParse(input);
    if (!validated.success) { get().notice(i18n.t('Check the required fields and try again.')); return false; }
    const patch = validated.data;
    const token = crypto.randomUUID();
    pending.push({ token, patch });
    set({ data: displayed() });
    const run = queue.then(async () => {
      try {
        get().receive(await window.sabri.apply(patch));
        return true;
      } catch {
        get().notice(i18n.t('Could not save changes'));
        return false;
      } finally {
        const index = pending.findIndex((item) => item.token === token);
        if (index >= 0) pending.splice(index, 1);
        set({ data: displayed() });
      }
    });
    queue = run;
    return run;
  },
  notice(message, undo) { set({ toast: { message, undo, id: crypto.randomUUID() } }); },
  dismiss() { set({ toast: undefined }); },
  async timer(action) {
    try { await queue; get().receive(await window.sabri.timer(action)); }
    catch { get().notice(i18n.t('Could not update the timer')); }
  }
}));
export const current = () => useSabri.getState().data;
export const tell = (message: string, undo?: () => void) => useSabri.getState().notice(message, undo);
export const patch = (changes: Patch['changes']) => useSabri.getState().apply({ changes });
export const save = <K extends Collection>(collection: K, item: RecordFor<K>) => patch([{ collection, value: item }]);
export const changeSettings = (update: Partial<Settings>) => useSabri.getState().apply({ changes: [], settings: { ...current().settings, ...update } });
export async function remove<K extends Collection>(collection: K, value: RecordFor<K>) {
  if (await save(collection, { ...value, deletedAt: new Date().toISOString() }))
    tell(i18n.t('Deleted'), () => { void save(collection, { ...value, deletedAt: undefined }); });
}
export const fresh = () => stamp();

