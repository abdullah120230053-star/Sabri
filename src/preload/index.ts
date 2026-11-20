import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { SabriApi } from '../shared/api';

const api: SabriApi = {
  generatePlan: (value) => ipcRenderer.invoke('planner:generate',value),
  captureParking: () => ipcRenderer.invoke('parking:capture'),
  quietMock:(minutes)=>ipcRenderer.invoke('addon:mock-quiet',minutes),
  connectLms: (value) => ipcRenderer.invoke('lms:connect',value),
  syncLms: (id) => ipcRenderer.invoke('lms:sync',id),
  applyLms: (value) => ipcRenderer.invoke('lms:apply',value),
  disconnectLms: (id) => ipcRenderer.invoke('lms:disconnect',id),
  importLmsCalendar: (label) => ipcRenderer.invoke('lms:import-file',label),
  addAttachment: (value) => ipcRenderer.invoke('attachments:add',value),
  openAttachment: (value) => ipcRenderer.invoke('attachments:open',value),
  addNoteImage: (value) => ipcRenderer.invoke('attachments:image',value),
  exportAddonPdf: (value) => ipcRenderer.invoke('addon:export-pdf',value),
  openResource: (id) => ipcRenderer.invoke('addon:open-resource',id),
  saveRecapImage: (bytes) => ipcRenderer.invoke('addon:save-recap',bytes),
  saveScheduleImage: (data) => ipcRenderer.invoke('schedule:png',data),
  checkUpdates: () => ipcRenderer.invoke('app:updates:check'),
  downloadUpdate: () => ipcRenderer.invoke('app:updates:download'),
  installUpdate: () => ipcRenderer.invoke('app:updates:install'),
  checkPrayer: (input) => ipcRenderer.invoke('prayer:check',input),
  verifyPrayer: (key) => ipcRenderer.invoke('prayer:verify',key),
  estimateLocation: () => ipcRenderer.invoke('system:location'),
  importTheme: () => ipcRenderer.invoke('theme:import'),
  exportTheme: (theme) => ipcRenderer.invoke('theme:export',theme),
  addSound: () => ipcRenderer.invoke('sound:choose'),
  syncInfo: () => ipcRenderer.invoke('sync:info'),
  syncStart: (options) => ipcRenderer.invoke('sync:start',options),
  syncStop: () => ipcRenderer.invoke('sync:stop'),
  exportPhoneCertificate: () => ipcRenderer.invoke('sync:certificate'),
  testPhoneAlert: () => ipcRenderer.invoke('sync:test-alert'),
  syncPair: () => ipcRenderer.invoke('sync:pair'),
  syncDevice: (options) => ipcRenderer.invoke('sync:device',options),
  syncRevoke: (id) => ipcRenderer.invoke('sync:revoke',id),
  timetable: (input) => ipcRenderer.invoke('import:preview', input),
  previewFeed: (url) => ipcRenderer.invoke('ics:preview', { url }),
  pendingFeeds: () => ipcRenderer.invoke('ics:pending'),
  refreshFeed: (id) => ipcRenderer.invoke('ics:sync', { id }),
  commitImport: (input) => ipcRenderer.invoke('import:commit', input),
  exportCalendar: (scope) => ipcRenderer.invoke('ics:export', scope),
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
