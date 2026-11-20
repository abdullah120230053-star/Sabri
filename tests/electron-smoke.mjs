import { _electron as electron } from 'playwright';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';

const data = await mkdtemp(join(tmpdir(),'sabri-smoke-'));
let win;
try {
  win = await electron.launch({ executablePath:process.env.SABRI_TEST_EXECUTABLE || undefined, args:process.env.SABRI_TEST_EXECUTABLE ? [] : [resolve('.')],env:{ ...process.env,SABRI_TEST_DATA:data } });
  const page = await win.firstWindow();
  page.on('pageerror',(error) => console.error(error));
  page.on('console',(entry) => { if (entry.type() === 'error') console.error(entry.text()); });
  await page.getByRole('button',{ name:'Skip setup' }).click();
  await page.getByRole('heading',{ name:'Make time for what matters.' }).waitFor();
  await page.getByRole('link',{ name:'Tasks',exact:true }).click();
  await page.getByRole('textbox',{ name:'Add a task' }).fill('Review circuits !high');
  await page.getByRole('textbox',{ name:'Add a task' }).press('Enter');
  await page.getByRole('button',{ name:'Complete task Review circuits' }).click();
  await page.getByRole('button',{ name:'Reopen task Review circuits' }).waitFor();
  await page.getByRole('link',{ name:'Schedule',exact:true }).click();
  await page.getByRole('button',{ name:'Add class',exact:true }).click();
  await page.getByRole('textbox',{ name:'Title' }).fill('Circuits lecture');
  await page.getByRole('button',{ name:'Save',exact:true }).click();
  await page.getByRole('button',{ name:'List',exact:true }).click();
  await page.getByRole('button',{ name:/Circuits lecture/ }).waitFor();
  await page.getByRole('link',{ name:'Focus timer',exact:true }).click();
  await page.getByRole('button',{ name:'Start focus',exact:true }).click();
  await page.getByRole('button',{ name:'Pause',exact:true }).waitFor();
  await page.getByRole('button',{ name:'Pause',exact:true }).click();
  await page.getByRole('combobox',{ name:'Theme',exact:true }).selectOption('nature');
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'nature');
  await page.getByRole('link',{ name:'Prayer times',exact:true }).click();
  await page.getByRole('button',{ name:'Fajr · Complete' }).click();
  assert.equal(await page.getByRole('button',{ name:'Fajr · Pending' }).getAttribute('aria-pressed'),'true');
  await page.getByRole('combobox',{ name:'Theme',exact:true }).selectOption('light');
  await page.getByRole('link',{ name:'Overview',exact:true }).click();
  await page.screenshot({ path:resolve('release/dashboard-smoke.png'),fullPage:true });
  console.log('Electron smoke passed');
} finally {
  await win?.close();
  await rm(data,{ recursive:true,force:true });
}

