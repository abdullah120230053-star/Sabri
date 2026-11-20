type Point = { text: string; x: number; y: number; width: number };
function rowsFrom(points: Point[],rtl: boolean) {
  const lines: Point[][] = [];
  for (const point of points.sort((a,b) => b.y-a.y)) {
    const line = lines.at(-1);
    if (line?.[0] && Math.abs(line[0].y-point.y) <= 4) line.push(point);
    else lines.push([point]);
  }
  return lines.map((points) => {
    points.sort((a,b) => a.x-b.x);
    const cells: string[] = [];
    let previous: Point | undefined;
    for (const point of points) {
      if (previous && point.x - (previous.x+previous.width) <= 13) cells[cells.length-1] += ' '+point.text;
      else cells.push(point.text);
      previous = point;
    }
    return (rtl ? cells.reverse():cells).join('\t');
  }).join('\n');
}
export async function pdfText(input: Uint8Array) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({ data:new Uint8Array(input),useSystemFonts:true,stopAtErrors:true });
  try {
    const document = await task.promise;
    if (document.numPages > 60) throw new Error('The PDF exceeds the 60-page import limit.');
    const result: string[] = [];
    for (let num=1;num<=document.numPages;num++) {
      const page = await document.getPage(num);
      const { items } = await page.getTextContent();
      const points = items.flatMap((item) => {
        if (!('str' in item) || !item.str.trim()) return [];
        return [{ text:item.str.trim(),x:Number(item.transform[4]),y:Number(item.transform[5]),width:item.width }];
      });
      const rtl = items.filter((item) => 'dir' in item && item.dir==='rtl').length > points.length / 2;
      result.push(rowsFrom(points,rtl));
      page.cleanup();
    }
    return result.join('\n');
  } finally { await task.destroy(); }
}

