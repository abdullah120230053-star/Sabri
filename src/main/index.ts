import { app, BrowserWindow, dialog, globalShortcut, ipcMain, Menu, nativeImage, session, Tray, type IpcMainInvokeEvent } from 'electron';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { atomicWrite, backupId, migrate, readText, Storage } from './storage';
import { date, patchSchema, settingsSchema, timerActionSchema } from '../shared/schema';
import { computePrayers, nextPrayer } from '../shared/prayer';
import { clock } from '../shared/time';
import { moveTimer, remaining, timerLabel } from '../shared/timer';
import { runScheduler } from './notifications';

app.setName('Sabri');
app.setAppUserModelId('com.sabri.app');
if (process.env.SABRI_TEST_DATA) app.setPath('userData', process.env.SABRI_TEST_DATA);
const singleton = app.requestSingleInstanceLock();
if (!singleton) app.quit();

let main: BrowserWindow | undefined;
let floating: BrowserWindow | undefined;
let quitting = false;
let tray: Tray | undefined;
const words = {
  en: { show: 'Open Sabri', start: 'Start focus', pause: 'Pause timer', exit: 'Quit', backup: 'Import backup?', detail: 'This replaces the current data. Sabri keeps a backup of the previous data.', replace: 'Replace data', cancel: 'Cancel' },
  ar: { show: 'افتح صبري', start: 'ابدأ التركيز', pause: 'أوقف المؤقت مؤقتًا', exit: 'خروج', backup: 'استيراد النسخة الاحتياطية؟', detail: 'سيتم استبدال البيانات الحالية مع حفظ نسخة احتياطية منها.', replace: 'استبدال البيانات', cancel: 'إلغاء' },
};
const files = () => app.isPackaged ? join(process.resourcesPath, 'resources') : join(app.getAppPath(), 'resources');
const renderer = (hash = '') => {
  const development = process.env.ELECTRON_RENDERER_URL;
  return development ? new URL(hash, development).href : pathToFileURL(join(__dirname, '../renderer/index.html')).href + hash;
};
function windowFor(quick = false) {
  const win = new BrowserWindow({
    width: quick ? 355 : 1390, height: quick ? 365 : 960, minWidth: quick ? 300 : 720, minHeight: quick ? 250 : 550,
    show: false, autoHideMenuBar: true, alwaysOnTop: quick, backgroundColor: '#f7f7fb', title: 'Sabri', icon: join(files(), 'icon.png'),
    webPreferences: { preload: join(__dirname, '../preload/index.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.once('ready-to-show', () => win.show());
  void win.loadURL(renderer(quick ? '#/mini' : ''));
  return win;
}
function show() {
  if (!main || main.isDestroyed()) main = windowFor();
  main.show();
  main.focus();
}
function assertIpc(event: IpcMainInvokeEvent) {
  const trusted = [main, floating].some((window) => window && !window.isDestroyed() && window.webContents.id === event.sender.id);
  if (!trusted || event.senderFrame !== event.sender.mainFrame) throw new Error('Invalid IPC sender.');
}
function register<T>(channel: string, schema: z.ZodType<T>, action: (value: T, event: IpcMainInvokeEvent) => unknown) {
  ipcMain.handle(channel, (event, input: unknown) => {
    assertIpc(event);
    return action(schema.parse(input), event);
  });
}

if (singleton) void app.whenReady().then(async () => {
  session.defaultSession.setPermissionRequestHandler((_web, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  const storage = new Storage(join(app.getPath('userData'), 'sabri-data'));
  await storage.load();
  let trayLanguage: string | undefined;
  let trayStatus: string | undefined;
  let trayTooltip = '';
  let loginSetting: boolean | undefined;
  const refreshTray = () => {
    const { settings, timer } = storage.state;
    if (loginSetting !== settings.startAtLogin) {
      loginSetting = settings.startAtLogin;
      if (app.isPackaged && process.platform !== 'linux') app.setLoginItemSettings({ openAtLogin: loginSetting });
    }
    if (!tray) return;
    const labels = words[settings.language];
    if (settings.language !== trayLanguage || timer.status !== trayStatus) {
      trayLanguage = settings.language;
      trayStatus = timer.status;
      tray.setContextMenu(Menu.buildFromTemplate([
        { label: labels.show, click: show },
        { label: timer.status === 'running' ? labels.pause : labels.start, click: () => { void storage.update((state) => moveTimer(state, { type: 'toggle' })); } },
        { type: 'separator' }, { label: labels.exit, click: () => app.quit() }
      ]));
    }
    const prayer = nextPrayer(new Date(), settings);
    const tooltip = ['Sabri', timer.status === 'running' ? timerLabel(remaining(timer, Date.now())) : '', prayer ? clock(prayer.time, settings) : ''].filter(Boolean).join(' · ');
    if (tooltip !== trayTooltip) { trayTooltip = tooltip; tray.setToolTip(tooltip); }
  };
  const image = nativeImage.createFromPath(join(files(), 'icon.png'));
  if (!image.isEmpty()) {
    tray = new Tray(image.resize({ width: 24, height: 24 }));
    tray.on('click', show);
  }
  const noArgs = z.undefined();
  register('storage:load', noArgs, () => ({ state: storage.state, recoveredFrom: storage.recoveredFrom }));
  register('storage:save', patchSchema, (patch) => storage.patch(patch));
  register('timer:action', timerActionSchema, (action) => storage.update((state) => moveTimer(state, action)));
  register('storage:export', noArgs, async (_value, event) => {
    const file = await dialog.showSaveDialog(BrowserWindow.fromWebContents(event.sender)!, { defaultPath: 'sabri-backup.json', filters: [{ name: 'Sabri JSON', extensions: ['json'] }] });
    if (!file.filePath || file.canceled) return false;
    await atomicWrite(file.filePath, JSON.stringify(storage.state, null, 2));
    return true;
  });
  register('storage:import', noArgs, async (_value, event) => {
    const parent = BrowserWindow.fromWebContents(event.sender)!;
    const result = await dialog.showOpenDialog(parent, { properties: ['openFile'], filters: [{ name: 'Sabri JSON', extensions: ['json'] }] });
    if (!result.filePaths[0] || result.canceled) return false;
    const imported = migrate(JSON.parse(await readText(result.filePaths[0])));
    const labels = words[storage.state.settings.language];
    const confirm = await dialog.showMessageBox(parent, { type: 'warning', buttons: [labels.cancel, labels.replace], cancelId: 0, defaultId: 0, message: labels.backup, detail: labels.detail });
    if (confirm.response !== 1) return false;
    await storage.update(() => imported, true);
    return true;
  });
  register('storage:backup:list', noArgs, () => storage.listBackups());
  register('storage:backup:restore', backupId, (id) => storage.restore(id));
  register('prayer:compute', z.object({ key: date, settings: settingsSchema }), ({ key, settings }) => computePrayers(key, settings));
  register('window:mini-timer', noArgs, () => {
    if (!floating || floating.isDestroyed()) floating = windowFor(true);
    else floating.show();
  });
  register('window:print', noArgs, (_input, event) => event.sender.print({ printBackground: true }));
  storage.subscribe((state) => {
    for (const win of BrowserWindow.getAllWindows()) if (!win.webContents.isDestroyed()) win.webContents.send('storage:changed', state);
    refreshTray();
  });
  const keepOpen = (window: BrowserWindow) => window.on('close', (event) => {
    if (!quitting && tray && storage.state.settings.minimizeToTray) { event.preventDefault(); window.hide(); }
  });
  show();
  if (main) keepOpen(main);
  refreshTray();
  const stopScheduler = runScheduler(storage, show, refreshTray);
  app.on('activate', show);
  app.on('second-instance', show);
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
  app.on('before-quit', (event) => {
    if (quitting) return;
    event.preventDefault();
    quitting = true;
    stopScheduler();
    globalShortcut.unregisterAll();
    tray?.destroy();
    void storage.drain().finally(() => app.quit());
  });
}).catch((error: unknown) => {
  dialog.showErrorBox('Sabri', error instanceof Error ? error.message : String(error));
  app.exit(1);
});


