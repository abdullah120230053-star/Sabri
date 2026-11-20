import { app, BrowserWindow, dialog, globalShortcut, ipcMain, Menu, nativeImage, net, protocol, session, Tray, type IpcMainInvokeEvent } from 'electron';
import { extname, join } from 'node:path';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { atomicWrite, backupId, migrate, readText, Storage } from './storage';
import { active, date, patchSchema, settingsSchema, themeSchema, timerActionSchema, stamp } from '../shared/schema';
import { computePrayers, nextPrayer } from '../shared/prayer';
import { clock } from '../shared/time';
import { moveTimer, remaining, timerLabel } from '../shared/timer';
import { runScheduler } from './notifications';
import { importRequest, feedPreviewRequest, refreshRequest, commitImportRequest, formatSchema } from '../shared/imports';
import { parseTable } from './import-table';
import { parseIcs, exportIcs } from './import-ics';
import { pdfText } from './import-pdf';
import { CalendarFeeds } from './import-service';
import { startHmBar } from './hm-bar';
import { Companion } from './companion';
import { phoneDeviceUpdate,syncStartOptions } from '../shared/phone';
import { approximateLocation,prayerComparison } from './prayer-online';
import { editPrayer,prayerEditSchema } from '../shared/prayer-record';
import { configureUpdater } from './updater';

protocol.registerSchemesAsPrivileged([{ scheme:'sabri-media',privileges:{ standard:true,secure:true,stream:true,supportFetchAPI:true } }]);
app.setName('Sabri');
app.setAppUserModelId('com.sabri.app');
if (process.env.SABRI_TEST_DATA) app.setPath('userData', process.env.SABRI_TEST_DATA);
const singleton = app.requestSingleInstanceLock();
if (!singleton) app.quit();

let main: BrowserWindow | undefined;
let floating: BrowserWindow | undefined;
let capture: BrowserWindow | undefined;
let quitting = false;
let tray: Tray | undefined;
const words = {
  en: { show: 'Open Sabri', start: 'Start focus', pause: 'Pause timer', exit: 'Quit', backup: 'Import backup?', detail: 'This replaces the current data. Sabri keeps a backup of the previous data.', replace: 'Replace data', cancel: 'Cancel' },
  ar: { show: 'افتح صبري', start: 'ابدأ التركيز', pause: 'أوقف المؤقت مؤقتًا', exit: 'خروج', backup: 'استيراد النسخة الاحتياطية؟', detail: 'سيتم استبدال البيانات الحالية مع حفظ نسخة احتياطية منها.', replace: 'استبدال البيانات', cancel: 'إلغاء' },
};
const files = () => app.isPackaged ? join(process.resourcesPath, 'resources') : join(app.getAppPath(), 'resources');
const focusIntent = (args: string[]) => args.some((arg) => /^sabri:\/\/focus\/?$/i.test(arg));
const renderer = (hash = '') => {
  const development = process.env.ELECTRON_RENDERER_URL;
  return development ? new URL(hash, development).href : pathToFileURL(join(__dirname, '../renderer/index.html')).href + hash;
};
function windowFor(mode?: 'mini'|'capture') {
  const quick=!!mode;
  const win = new BrowserWindow({
    width: mode==='capture' ? 475 : quick ? 355 : 1390, height: mode==='capture' ? 480 : quick ? 365 : 960, minWidth: quick ? 300 : 720, minHeight: quick ? 250 : 550,
    show: false, autoHideMenuBar: true, alwaysOnTop: quick, backgroundColor: '#f7f7fb', title: 'Sabri', icon: join(files(), 'icon.png'),
    webPreferences: { preload: join(__dirname, '../preload/index.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.once('ready-to-show', () => win.show());
  void win.loadURL(renderer(mode ? '#/'+mode : focusIntent(process.argv) ? '#/focus' : ''));
  return win;
}
function show() {
  if (!main || main.isDestroyed()) main = windowFor();
  main.show();
  main.focus();
}
function assertIpc(event: IpcMainInvokeEvent) {
  const trusted = [main, floating, capture].some((window) => window && !window.isDestroyed() && window.webContents.id === event.sender.id);
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
  const closeHmBar = startHmBar(storage,app.getPath('userData'));
  const companion = new Companion(storage,join(__dirname,'../companion'));
  await companion.load().catch((error: unknown) => console.error('Could not read paired devices',error));
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
  const updater=configureUpdater();
  register('app:updates:check',noArgs,updater.check);
  register('app:updates:download',noArgs,updater.download);
  register('app:updates:install',noArgs,updater.install);
  protocol.handle('sabri-media',(request) => {
    const url = new URL(request.url);
    const filename = /^\/([a-f0-9-]{36}\.(?:mp3|wav|ogg|m4a|flac))$/i.exec(url.pathname)?.[1];
    if (url.hostname!=='sounds' || !filename || request.method!=='GET') return new Response(null,{ status:404 });
    return net.fetch(pathToFileURL(storage.soundPath(filename)).href,{ headers:request.headers });
  });
  register('theme:import',noArgs,async (_value,event) => {
    const file=await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender)!,{ properties:['openFile'],filters:[{ name:'Sabri theme',extensions:['json'] }] });
    if (file.canceled || !file.filePaths[0]) return null;
    return themeSchema.parse(JSON.parse(await readText(file.filePaths[0],65536)));
  });
  register('theme:export',themeSchema,async (theme,event) => {
    const file=await dialog.showSaveDialog(BrowserWindow.fromWebContents(event.sender)!,{ defaultPath:'sabri-theme.json',filters:[{ name:'Sabri theme',extensions:['json'] }] });
    if (file.canceled || !file.filePath) return false;
    await atomicWrite(file.filePath,JSON.stringify(theme,null,2));
    return true;
  });
  register('sound:choose',noArgs,async (_value,event) => {
    const result=await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender)!,{ properties:['openFile'],filters:[{ name:'Audio',extensions:['mp3','wav','ogg','m4a','flac'] }] });
    return result.canceled || !result.filePaths[0] ? null : storage.addSound(result.filePaths[0]);
  });
  register('sync:info',noArgs,() => companion.info());
  register('sync:start',syncStartOptions,({ port,pin,secure }) => companion.start(port,pin,undefined,secure));
  register('sync:certificate',noArgs,async (_value,event)=>{
    const file=await dialog.showSaveDialog(BrowserWindow.fromWebContents(event.sender)!,{ defaultPath:'Sabri-WiFi.cer',filters:[{ name:'Sabri Wi-Fi certificate',extensions:['cer'] }] });
    if (file.canceled || !file.filePath) return null;
    const root=await companion.certificates.certificate();
    await writeFile(file.filePath,root.bytes);
    return { fingerprint:root.fingerprint };
  });
  register('sync:test-alert',noArgs,async ()=>{
    if (!companion.info().running || !companion.info().devices.length) return false;
    await storage.update((state)=>{
      const ar=state.settings.language==='ar';
      const notice={ ...stamp(),title:ar?'إشعار تجريبي من صبري':'Sabri test alert',body:ar?'هاتفك متصل بصبري.':'Your phone is connected to Sabri.',kind:'test',reference:crypto.randomUUID() };
      return { ...state,notices:[...state.notices,notice].slice(-250) };
    });
    return true;
  });
  register('sync:stop',noArgs,() => companion.stop());
  register('sync:pair',noArgs,() => companion.pair());
  register('sync:device',phoneDeviceUpdate,({ id,name,canEdit }) => companion.update(id,name,canEdit));
  register('sync:revoke',z.uuid(),(id) => companion.revoke(id));
  const feeds = new CalendarFeeds(storage);
  const checkFeeds = setInterval(() => { void feeds.poll(); },60000);
  register('import:preview', importRequest, async (input,event) => {
    let raw = input.text;
    let format = input.format;
    if (raw === undefined) {
      const selected = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender)!, {
        properties:['openFile'],filters:[{ name:'Timetable files',extensions:['pdf','ics','csv','tsv','txt','html','htm'] }]
      });
      const file = selected.filePaths[0];
      if (!file || selected.canceled) return null;
      const extension = extname(file).toLowerCase().slice(1);
      format = formatSchema.parse(extension === 'txt' || extension === 'tsv' ? 'text' : extension === 'htm' ? 'html' : extension);
      if (format === 'pdf') {
        if ((await stat(file)).size > 20_000_000) throw new Error('PDF is too large.');
        raw = await pdfText(await readFile(file));
      } else raw = await readText(file,8_000_000);
    }
    return format === 'ics' ? parseIcs(raw,storage.state.settings.location.timezone) : parseTable(raw,format,input.mapping);
  });
  register('ics:preview',feedPreviewRequest,({ url }) => feeds.preview(url));
  register('ics:pending',noArgs,() => feeds.listPending());
  register('ics:sync',refreshRequest,({ id }) => feeds.takePending(id) ?? feeds.refresh(id));
  register('import:commit',commitImportRequest,(input) => feeds.commit(input));
  register('schedule:png',z.instanceof(Uint8Array).refine((data)=>data.length>=8 && data.length<=15_000_000 && data[0]===137 && data[1]===80 && data[2]===78 && data[3]===71),async (data,event) => {
    const selection=await dialog.showSaveDialog(BrowserWindow.fromWebContents(event.sender)!,{ defaultPath:'sabri-week.png',filters:[{ name:'PNG image',extensions:['png'] }] });
    if (selection.canceled || !selection.filePath) return false;
    await writeFile(selection.filePath,data);
    return true;
  });
  register('ics:export',z.enum(['schedule','calendar','csv']),async (scope,event) => {
    const format = scope === 'csv' ? 'csv' : 'ics';
    const selection = await dialog.showSaveDialog(BrowserWindow.fromWebContents(event.sender)!,{ defaultPath:'sabri-'+scope+'.'+format,filters:[{ name:format.toUpperCase(),extensions:[format] }] });
    if (!selection.filePath || selection.canceled) return false;
    const csvCell = (value: string|number) => '"' + String(value).replace(/^[=+@-]/,"'$&").replaceAll('"','""') + '"';
    const csv = () => 'Title,Day,Start,End,Room,Code,Instructor\r\n' + active(storage.state.schedule).map((item) => [item.title,item.dayOfWeek,item.start,item.end,item.location,item.courseCode,item.instructor].map(csvCell).join(',')).join('\r\n');
    await atomicWrite(selection.filePath,scope === 'csv' ? '\uFEFF'+csv() : exportIcs(storage.state,scope));
    return true;
  });
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
  register('prayer:check',prayerEditSchema,(input) => storage.update((state)=>editPrayer(state,input)));
  register('prayer:verify',date,(key) => prayerComparison(key,storage.state.settings));
  register('system:location',noArgs,() => approximateLocation());
  register('prayer:compute', z.object({ key: date, settings: settingsSchema }), ({ key, settings }) => computePrayers(key, settings));
  register('window:mini-timer', noArgs, () => {
    if (!floating || floating.isDestroyed()) floating = windowFor('mini');
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
  globalShortcut.register('CommandOrControl+Alt+N',() => {
    if (!capture || capture.isDestroyed()) capture=windowFor('capture');
    else { capture.show();capture.focus(); }
  });
  app.on('activate', show);
  const launchIntent = (args: string[]) => {
    if (focusIntent(args)) main?.webContents.send('app:shortcut','focus');
  };
  app.on('second-instance',(_event,args) => { show();launchIntent(args); });

  app.on('open-url',(event,url) => { event.preventDefault();show();launchIntent([url]); });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
  app.on('before-quit', (event) => {
    if (quitting) return;
    event.preventDefault();
    quitting = true;
    stopScheduler();
    clearInterval(checkFeeds);
    globalShortcut.unregisterAll();
    tray?.destroy();
    void Promise.allSettled([storage.drain(),closeHmBar(),companion.stop()]).finally(() => app.quit());
  });
}).catch((error: unknown) => {
  dialog.showErrorBox('Sabri', error instanceof Error ? error.message : String(error));
  app.exit(1);
});
