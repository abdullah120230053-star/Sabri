import { mkdir, writeFile } from 'node:fs/promises';

const base = 'https://tanzil.net';
const arabicSource = base + '/pub/download/index.php?quranType=uthmani&outType=txt-2&agree=true';
const translationSource = base + '/trans/en.pickthall';
const metadataSource = base + '/res/text/metadata/quran-data.xml';
const download = async (url) => {
  const response = await fetch(url,{ signal:AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error('Source returned HTTP '+response.status);
  return response.text();
};
const toMap = (data) => new Map(data.split(/\r?\n/).flatMap((line) => {
  const match=/^(\d+)\|(\d+)\|(.*)$/.exec(line);
  return match ? [[match[1]+':'+match[2],match[3]]]:[];
}));
const [original,english,metadata] = await Promise.all([arabicSource,translationSource,metadataSource].map(download));
const arabic=toMap(original),translation=toMap(english);
if (arabic.size<6200 || translation.size<6200) throw new Error('Unexpected Tanzil source format.');
const names=new Map([...metadata.matchAll(/<sura\s+index="(\d+)"[^>]*\btname="([^"]+)"/g)].map((match)=>[match[1],match[2]]));
const ranges = [[1,1,7],[2,152,157],[2,255,257],[2,284,286],[3,8,9],[3,189,195],[13,27,29],[16,125,128],[17,23,27],[20,25,36],[21,83,84],[24,35,36],[25,63,77],[29,69,69],[31,12,19],[39,53,55],[40,60,61],[49,10,13],[53,38,42],[55,1,13],[65,2,4],[73,1,8],[89,27,30],[93,1,11],[94,1,8],[97,1,5],[103,1,3],[112,1,4]];
const verses=[];
for (let part=0;verses.length<100;part++) for (const [surah,first,last] of ranges) {
  if (first+part>last || verses.length===100) continue;
  const ayah=first+part,reference=surah+':'+ayah;
  if (!arabic.has(reference) || !translation.has(reference) || !names.has(String(surah))) throw new Error('Missing source data for '+reference);
  verses.push({ arabic:arabic.get(reference),translation:translation.get(reference),surah:names.get(String(surah)),ayah,reference });
}
verses.sort((a,b)=>a.reference.localeCompare(b.reference,'en',{ numeric:true }));
const copyright=original.split(/\r?\n/).filter((line)=>line.startsWith('#')).join('\n');
const out=new URL('../src/renderer/data/',import.meta.url);
await mkdir(out,{ recursive:true });
await writeFile(new URL('quran-verses.json',out),JSON.stringify({ source:'Tanzil Project',license:'CC BY 3.0 (verbatim)',url:'https://tanzil.net',translation:'Marmaduke Pickthall',translationSource,notice:copyright,verses },null,2)+'\n');
console.log('Imported '+verses.length+' verified verses verbatim.');
