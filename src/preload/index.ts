import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { SabriApi } from '../shared/api';

const api: SabriApi = {
  load: () => ipcRenderer.invoke('storage:load'),
  apply: (patch) => ipcRenderer.invoke('storage:save', patch),
  timer: (action) => ipcRenderer.invoke('timer:action', action),
  changed: (listener) => {
    const receive = (_event: IpcRendererEvent, state: Parameters<typeof listener>[0]) => listener(state);
    ipcRenderer.on('storage:changed', receive);
    return () => { ipcRenderer.removeListener('storage:changed', receive); };
  },
  saveBackup: () => ipcRenderer.invoke('storage:export'),
  importBackup: () => ipcRenderer.invoke('storage:import'),
  backups: () => ipcRenderer.invoke('storage:backup:list'),
  restoreBackup: (id) => ipcRenderer.invoke('storage:backup:restore', id),
  prayers: (input) => ipcRenderer.invoke('prayer:compute', input),
  mini: () => ipcRenderer.invoke('window:mini-timer'),
  onShortcut: (listener) => {
    const receive = (_event: IpcRendererEvent, name: string) => listener(name);
    ipcRenderer.on('app:shortcut', receive);
    return () => { ipcRenderer.removeListener('app:shortcut', receive); };
  },
  print: () => ipcRenderer.invoke('window:print'),
};
contextBridge.exposeInMainWorld('sabri', api);
