import { useEffect, useState } from 'react';
import { HashRouter, NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Bell, BookOpen, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, ClipboardList, GraduationCap, LayoutGrid, Moon, PanelLeft, Search, Settings, Timer, WifiOff } from 'lucide-react';
import { active, type State } from '../shared/schema';
import { Dashboard, ImportPlaceholder } from './dashboard';
import { FocusCard, FocusPage, useFocusSound } from './focus';
import { PrayersPage } from './prayers';
import { SchedulePage } from './schedule';
import { Onboarding, SettingsPage } from './settings';
import { TasksPage } from './tasks';
import { changeSettings, useSabri } from './store';
import { applyTheme, selectedTheme, themes } from './themes';
import { Empty, IconButton, Modal, Toast } from './ui';

const links = [
  { label:'Workspace', pages:[
    { to:'/',text:'Overview',icon:LayoutGrid },{ to:'/schedule',text:'Schedule',icon:CalendarDays },{ to:'/tasks',text:'Tasks',icon:ClipboardList },{ to:'/focus',text:'Focus timer',icon:Timer },
  ] },
  { label:'Wellbeing', pages:[{ to:'/prayers',text:'Prayer times',icon:Moon }] },
  { label:'Tools', pages:[{ to:'/import',text:'University data',icon:GraduationCap },{ to:'/settings',text:'Settings',icon:Settings }] },
] as const;
const shortcuts = ['/','/schedule','/prayers','/tasks','/focus','/stats','/calendar','/courses','/notes'];

function SearchDialog({ close }: { close(): void }) {
  const { t } = useTranslation(),navigate = useNavigate();
  const data = useSabri((s) => s.data),[query,setQuery] = useState('');
  const content = [
    ...links.flatMap((group) => group.pages.map((page) => ({ label:t(page.text),to:page.to,tag:t('Page') }))),
    ...active(data.schedule).map((item) => ({ label:item.title,to:'/schedule',tag:t('Schedule') })),
    ...active(data.tasks).map((item) => ({ label:item.title,to:'/tasks',tag:t('Tasks') })),
    ...active(data.courses).map((item) => ({ label:item.name,to:'/courses',tag:t('Courses') })),
    ...active(data.notes).map((item) => ({ label:item.title,to:'/notes',tag:t('Notes') })),
    ...active(data.calendar).map((item) => ({ label:item.title,to:'/calendar',tag:t('Calendar') })),
  ].filter((item) => item.label.toLowerCase().includes(query.trim().toLowerCase())).slice(0,14);
  return <Modal title={t('Search')} close={close}>
    <input type="search" autoFocus className="full-width" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('Search anything…')} aria-label={t('Search anything…')}/>
    <div className="search-results">{content.length ? content.map((item,index) => <button type="button" className="data-row" key={item.to+index} onClick={() => { navigate(item.to);close(); }}><Search size={16}/><span className="grow">{item.label}</span><span className="pill">{item.tag}</span><ChevronRight size={15}/></button>) : <Empty compact icon={Search} title={t('No results')}/>}</div>
  </Modal>;
}
function Sidebar({ data }: { data: State }) {
  const { t,i18n } = useTranslation(),collapsed = data.settings.sidebarCollapsed,rtl = i18n.dir() === 'rtl';
  return <aside className={'sidebar '+(collapsed ? 'is-collapsed':'')}>
    <NavLink className="brand" to="/" aria-label={t('Go to overview')}><span className="brand-icon"><BookOpen size={21} strokeWidth={2.15}/></span><div><strong>Sabri</strong><span lang="ar">صبري</span></div></NavLink>
    <nav aria-label={t('Workspace')} className="sidebar nav-body">{links.map((group) => <div className="nav-group" key={group.label}><div className="nav-label">{t(group.label)}</div>{group.pages.map(({ to,text,icon:Icon }) => <NavLink end to={to} key={to} title={t(text)} aria-label={t(text)}><Icon size={19} strokeWidth={1.8}/><span>{t(text)}</span></NavLink>)}</div>)}</nav>
    <div className="sidebar-footer"><div className="offline"><WifiOff size={16}/><span>{t('Local workspace')}</span></div><IconButton label={t('Toggle sidebar')} icon={collapsed ? PanelLeft : rtl ? ChevronRight : ChevronLeft} onClick={() => { void changeSettings({ sidebarCollapsed:!collapsed }); }}/></div>
  </aside>;
}
function Shell() {
  const { t } = useTranslation(),where = useLocation(),go = useNavigate();
  const data = useSabri((s) => s.data);
  const [search,setSearch] = useState(false),[notices,setNotices] = useState(false),[showOnboarding,setShowOnboarding] = useState(!data.settings.onboarded);
  const activePage = links.flatMap((group) => [...group.pages]).find((item) => item.to === where.pathname);
  const theme = selectedTheme(data);
  useFocusSound();
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const letter = event.key.toLowerCase();
      if (letter==='k' || letter==='f') { event.preventDefault();setSearch(true); }
      if (letter==='t' && !event.shiftKey) { event.preventDefault();go('/tasks?new=1'); }
      if (letter==='t' && event.shiftKey) { event.preventDefault();const list = themes.map((item) => item.id);void changeSettings({ theme:list[(list.indexOf(data.settings.theme)+1)%list.length]! }); }
      if (letter===',') { event.preventDefault();go('/settings'); }
      if (letter==='p') { event.preventDefault();void window.sabri.print(); }
      const page = Number(letter);
      if (page >= 1 && page <= shortcuts.length) { event.preventDefault();go(shortcuts[page-1]!); }
    };
    window.addEventListener('keydown',key);
    return () => window.removeEventListener('keydown',key);
  },[go,data.settings.theme]);
  return <div className={'shell '+(data.settings.sidebarCollapsed ? 'shell-collapsed':'')}>
    <Sidebar data={data}/>
    <div className="workspace">
      <header className="topbar"><div className="topbar-title"><span>{t('Workspace')}</span><ChevronRight size={13} className="dir-arrow"/><strong>{t(activePage?.text ?? 'Overview')}</strong></div>
        <div className="topbar-tools"><button className="search-control" type="button" onClick={() => setSearch(true)}><Search size={17}/><span>{t('Search anything…')}</span><kbd>Ctrl K</kbd></button>
          <label className="theme-select" title={t('Theme')}><span>{theme.symbol}</span><select aria-label={t('Theme')} value={data.settings.theme} onChange={(e) => { void changeSettings({ theme:e.target.value }); }}>{[...themes,...active(data.themes)].map((item) => <option key={item.id} value={item.id}>{t(item.name)}</option>)}</select><ChevronDown size={13}/></label>
          <IconButton label={t('Notifications')} icon={Bell} onClick={() => setNotices(true)}/>
          <button className="profile" type="button" title={t('Settings')} aria-label={t('Settings')} onClick={() => go('/settings')}>S</button>
        </div>
      </header>
      <main id="content" className="workspace-content" key={where.pathname}><Routes>
        <Route path="/" element={<Dashboard/>}/><Route path="/schedule" element={<SchedulePage/>}/><Route path="/tasks" element={<TasksPage/>}/><Route path="/focus" element={<FocusPage/>}/><Route path="/prayers" element={<PrayersPage/>}/><Route path="/import" element={<ImportPlaceholder/>}/><Route path="/settings" element={<SettingsPage/>}/><Route path="*" element={<Navigate to="/" replace/>}/>
      </Routes></main>
    </div>
    {showOnboarding && <Onboarding close={() => setShowOnboarding(false)}/>}
    {search && <SearchDialog close={() => setSearch(false)}/>}
    {notices && <Modal title={t('Notifications')} close={() => setNotices(false)}>{data.notices.length ? data.notices.slice(-35).reverse().map((item) => <div className="data-row" key={item.id}><Bell size={16}/><span className="grow"><strong>{item.title}</strong>{item.body && <small>{item.body}</small>}</span><small>{new Date(item.createdAt).toLocaleString(data.settings.language)}</small></div>) : <Empty icon={Bell} title={t('No notifications yet')}/>}</Modal>}
    <Toast/>
  </div>;
}
function Contents() {
  const { t,i18n } = useTranslation(),data = useSabri((s) => s.data),loaded = useSabri((s) => s.loaded);
  const reload = useSabri((s) => s.reload),receive = useSabri((s) => s.receive);
  const location = useLocation();
  useEffect(() => { const listen = window.sabri.changed(receive);void reload();return listen; },[reload,receive]);
  useEffect(() => applyTheme(selectedTheme(data)),[data.settings.theme,data.themes]);
  useEffect(() => {
    void i18n.changeLanguage(data.settings.language);
    document.documentElement.lang = data.settings.language;
    document.documentElement.dir = data.settings.language === 'ar' ? 'rtl':'ltr';
  },[data.settings.language,i18n]);
  if (!loaded) return <div className="opening"><span className="brand-icon"><BookOpen size={23}/></span>{t('Loading Sabri…')}</div>;
  return location.pathname === '/mini' ? <main className="mini"><FocusCard mini/></main> : <Shell/>;
}
export default function App() { return <HashRouter><Contents/></HashRouter>; }


