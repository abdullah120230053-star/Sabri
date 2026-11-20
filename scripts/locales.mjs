import { readFile, readdir, writeFile } from 'node:fs/promises';
const folder = new URL('../src/renderer/', import.meta.url);
const en = {};
for (const file of await readdir(folder)) {
  if (!/\.tsx?$/.test(file)) continue;
  const text = await readFile(new URL(file, folder), 'utf8');
  for (const [, key] of text.matchAll(/\b(?:t|i18n\.t)\('([^'\n]+)'/g)) en[key] = key;
}
const enFile = new URL('locales/en.json', folder);
const existing = JSON.parse(await readFile(enFile,'utf8'));
await writeFile(enFile, JSON.stringify(Object.fromEntries(Object.entries({ ...en, ...existing }).sort(([a],[b]) => a.localeCompare(b))), null, 2) + '\n');

