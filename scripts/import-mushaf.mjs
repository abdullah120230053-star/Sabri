import { writeFile } from 'node:fs/promises';

const textUrl = 'https://tanzil.net/pub/download/index.php?quranType=uthmani&outType=txt-2&agree=true';
const metadataUrl = 'https://tanzil.net/res/text/metadata/quran-data.xml';
async function download(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error('Tanzil returned HTTP ' + response.status);
  return response.text();
}
const [original, metadata] = await Promise.all([textUrl, metadataUrl].map(download));
const verses = [...original.matchAll(/^(\d+)\|(\d+)\|(.*)$/gm)].map(([, surah, ayah, arabic]) => [Number(surah), Number(ayah), arabic]);
function readTags(name) {
  return Array.from(metadata.matchAll(new RegExp('<' + name + '\\s+([^>]+)/>', 'g')), ([, attributes]) =>
    Object.fromEntries(Array.from(attributes.matchAll(/(\w+)="([^"]*)"/g), ([, key, value]) => [key, value])));
}
const chapters = readTags('sura').map((row) => ({ number: Number(row.index), name: row.name, transliteration: row.tname, verses: Number(row.ayas) }));
const indices = new Map(verses.map(([surah, ayah], index) => [surah + ':' + ayah, index]));
function readBoundaries(name) {
  return readTags(name).map(({ index, sura, aya }, offset) => {
    const position = indices.get(sura + ':' + aya);
    if (position === undefined || Number(index) !== offset + 1) throw new Error('Invalid Tanzil ' + name + ' boundary.');
    return position;
  });
}
const boundaries = readBoundaries('page');
const juz = readBoundaries('juz');
const notice = original.split(/\r?\n/).filter((line) => line.startsWith('#')).join('\n');
if (verses.length !== 6236 || indices.size !== verses.length || chapters.length !== 114 ||
    boundaries.length !== 604 || boundaries[0] !== 0 || juz.length !== 30 ||
    boundaries.some((value, index) => index > 0 && value <= boundaries[index-1]) || !notice.includes('Tanzil'))
  throw new Error('The downloaded Mushaf data is incomplete.');
const pages = boundaries.map((start, index) => verses.slice(start, boundaries[index+1]));
const pageByPosition = (position) => boundaries.findLastIndex((start) => start <= position) + 1;
const starts = chapters.map((chapter) => ({ ...chapter, page: pageByPosition(indices.get(chapter.number + ':1')) }));
const data = { source: 'Tanzil Project', url: 'https://tanzil.net', notice, pages, chapters: starts, juzPages: juz.map(pageByPosition) };
await writeFile(new URL('../src/renderer/data/mushaf.json', import.meta.url), JSON.stringify(data) + '\n');
console.log('Imported 6,236 verses and 604 Madinah page divisions.');
