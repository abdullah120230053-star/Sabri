import type { RecordFor, State } from '../shared/schema';

const studio = {
  background: '#f7f7fb', surface: '#ffffff', sidebar: '#ffffff', header: '#ffffff', 'surface-hover': '#f3f1fa',
  text: '#232139', 'text-secondary': '#59566e', 'text-inverse': '#ffffff', primary: '#6243bb', 'primary-hover': '#54349f',
  secondary: '#eae4fb', accent: '#825ec6', success: '#177051', warning: '#9a530f', error: '#ab3859', info: '#3b60a6',
  border: '#e9e6f1', 'border-strong': '#8c849d', 'border-focus': '#7654c4', 'prayer-active': '#346f63', 'prayer-completed': '#21805c',
  'pomodoro-work': '#6846c1', 'pomodoro-break': '#21805c', 'hero-from': '#eae4fb', 'hero-to': '#f2ecfe',
  'hero-text': '#2e2250', 'hero-muted': '#514176', 'hero-art': '#9a80d8', 'hero-art-bright': '#c6b5ed',
  'soft-mint': '#e3f4ee', 'soft-orange': '#fbefe4', 'soft-blue': '#e7edfc', 'soft-rose': '#fbe8ee',
  'subject-1': '#7355c8', 'subject-2': '#258574', 'subject-3': '#b36236', 'subject-4': '#4265ba', 'subject-5': '#a74d79', 'subject-6': '#63764b'
};
type Tokens = typeof studio;
const dark: Tokens = { ...studio, background:'#0d1117', surface:'#161b22', sidebar:'#121720', header:'#121720', 'surface-hover':'#222b38', text:'#f0f6fc', 'text-secondary':'#aeb9c8', 'text-inverse':'#0d1117', primary:'#7db9ff', 'primary-hover':'#a1cbff', secondary:'#223752', accent:'#d2a8ff', success:'#82e0b0', warning:'#ffc184', error:'#ff9eb0', info:'#a7c9ff', border:'#2e3848', 'border-strong':'#7d8999', 'border-focus':'#8ebaff', 'prayer-active':'#80dfc1', 'prayer-completed':'#82e0b0', 'pomodoro-work':'#9dc7ff', 'pomodoro-break':'#82e0b0', 'hero-from':'#1c2d4d', 'hero-to':'#25233c', 'hero-text':'#f0f6fc', 'hero-muted':'#c6d3ec', 'hero-art':'#5783be', 'hero-art-bright':'#8da9e3', 'soft-mint':'#19372e', 'soft-orange':'#402a25', 'soft-blue':'#223554', 'soft-rose':'#3d283e', 'subject-1':'#b8a4ff', 'subject-2':'#82dfca', 'subject-3':'#ffab8c', 'subject-4':'#a9c6ff', 'subject-5':'#fba8cd', 'subject-6':'#b6d089' };
type Theme = { id: string; name: string; symbol: string; colors: Tokens; radius: number; skin: string; pattern: string; font: 'inter' | 'manrope' | 'arabic'; shadow: 'none' | 'soft' | 'strong' };
function themed(id: string, name: string, symbol: string, radius: number, skin: string, pattern: string, overrides: Partial<Tokens>): Theme {
  const colors = { ...dark, ...overrides };
  colors['pomodoro-work'] = overrides.primary ?? colors.primary;
  colors['primary-hover'] = overrides.primary ?? colors.primary;
  return { id, name, symbol, colors, radius, skin, pattern, font: 'manrope', shadow: 'soft' };
}
export const themes: Theme[] = [
  { id:'light', name:'Clean Light', symbol:'☀️', colors:studio, radius:16, skin:'ring', pattern:'none', font:'manrope', shadow:'soft' },
  themed('dark','Midnight','🌙',12,'ring','none',{}),
  themed('f1','Formula 1','🏁',5,'lap','grid',{background:'#1a1a2e',surface:'#22243a',sidebar:'#171728',header:'#171728',primary:'#fc534c','text-inverse':'#160503',secondary:'#42242c',accent:'#66e4d3','hero-from':'#3b1c2a','hero-to':'#211a32','hero-art':'#eb5861','hero-art-bright':'#ac5769'}),
  themed('cyberpunk','Cyberpunk','🌆',3,'neon','grid',{background:'#0a0a0f',surface:'#1c1a2f',sidebar:'#101019',header:'#101019',primary:'#ff84c6','text-inverse':'#170817',secondary:'#492240',accent:'#74ffe9','hero-from':'#37133c','hero-to':'#191e42','hero-art':'#e15dab','hero-art-bright':'#54d2ee'}),
  themed('nature','Forest','🌿',18,'tree','diagonal',{background:'#16291c',surface:'#233d2b',sidebar:'#192e21',header:'#192e21',primary:'#93e7a8','text-inverse':'#0b2214',secondary:'#31523b',accent:'#e7c981','hero-from':'#294d35','hero-to':'#363823','hero-art':'#75a980','hero-art-bright':'#a7bf76'}),
  themed('football','Stadium','⚽',8,'scoreboard','grid',{background:'#0c1821',surface:'#1b2838',sidebar:'#11212d',header:'#11212d',primary:'#70f0a5','text-inverse':'#08221c',secondary:'#214338',accent:'#ffe78a','hero-from':'#214834','hero-to':'#172e38','hero-art':'#58b982','hero-art-bright':'#8bd7ac'}),
  themed('anime','Manga','🎌',20,'manga','dots',{background:'#1a1025',surface:'#30213e',sidebar:'#241831',header:'#241831',primary:'#ff9fbd','text-inverse':'#250e1d',secondary:'#502c49',accent:'#dcb4ff','hero-from':'#512747','hero-to':'#2b2148','hero-art':'#db7ba6','hero-art-bright':'#bda1e5'}),
  themed('islamic','Calligraphy','🕌',12,'geometric','diagonal',{background:'#1c1917',surface:'#2b2620',sidebar:'#211d19',header:'#211d19',primary:'#ebc275','text-inverse':'#291d08',secondary:'#443823',accent:'#82dbb8','prayer-active':'#83e2b7','prayer-completed':'#ebc275','hero-from':'#453825','hero-to':'#28271b','hero-art':'#be9a56','hero-art-bright':'#dbc387'}),
];
export function selectedTheme(state: State): Theme {
  const custom = state.themes.find((item) => item.id === state.settings.theme && !item.deletedAt);
  if (custom) return makeTheme(custom);
  return themes.find((item) => item.id === state.settings.theme) ?? themes[0]!;
}
export function makeTheme(custom: RecordFor<'themes'>) {
  const parent = themes.find((item) => item.id === custom.parent) ?? themes[0]!;
  return { ...parent, id:custom.id, name:custom.name, colors:{ ...parent.colors, ...custom.colors }, radius:custom.radius, font:custom.font, pattern:custom.pattern, shadow:custom.shadow };
}
export function applyTheme(theme: Theme, root = document.documentElement) {
  for (const [key, value] of Object.entries(theme.colors)) root.style.setProperty('--' + key, value);
  root.dataset.theme = theme.id;
  root.dataset.skin = theme.skin;
  root.dataset.pattern = theme.pattern;
  root.style.colorScheme = theme.colors.background === studio.background ? 'light' : 'dark';
  root.style.setProperty('--radius', theme.radius + 'px');
  root.style.setProperty('--shadow', theme.shadow === 'strong' ? '0 8px 26px color-mix(in srgb, var(--text) 16%, transparent)' : theme.shadow === 'none' ? 'none' : '0 2px 6px color-mix(in srgb, var(--text) 4%, transparent)');
  root.style.setProperty('--font-heading', ({ manrope:'Manrope Variable', inter:'Inter Variable', arabic:'Noto Sans Arabic Variable' })[theme.font]);
}
export function contrast(a: string, b: string) {
  const luminance = (hex: string) => {
    const values = hex.slice(1).match(/../g)?.map((pair) => {
      const val = parseInt(pair, 16) / 255;
      return val <= 0.04045 ? val / 12.92 : ((val + 0.055) / 1.055) ** 2.4;
    }) ?? [];
    return (values[0] ?? 0) * 0.2126 + (values[1] ?? 0) * 0.7152 + (values[2] ?? 0) * 0.0722;
  };
  const [light, shade] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light! + 0.05) / (shade! + 0.05);
}
export function accessibleTheme(theme: Theme) {
  const { colors } = theme;
  return contrast(colors.text, colors.background) >= 4.5 && contrast(colors.text, colors.surface) >= 4.5 &&
    contrast(colors['text-secondary'], colors.surface) >= 4.5 && contrast(colors['text-inverse'], colors.primary) >= 4.5 &&
    contrast(colors['hero-text'], colors['hero-from']) >= 4.5 && contrast(colors['hero-muted'], colors['hero-to']) >= 4.5 &&
    contrast(colors['border-strong'], colors.surface) >= 3;
}

