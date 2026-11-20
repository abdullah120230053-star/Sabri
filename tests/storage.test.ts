import { afterEach, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { Storage } from '../src/main/storage';
import { stamp, taskSchema } from '../src/shared/schema';

const dirs: string[] = [];
afterEach(async () => { for (const path of dirs.splice(0)) await rm(path,{ recursive:true,force:true }); });
const workspace = async () => {
  const dir = await mkdtemp(join(tmpdir(),'sabri-unit-'));
  dirs.push(dir);
  const storage = new Storage(dir);
  await storage.load();
  return { storage,dir };
};
it('serializes concurrent patches and ignores a killed staging write',async () => {
  const { storage,dir } = await workspace();
  await Promise.all(['One','Two'].map((title) => storage.patch({ changes:[{ collection:'tasks',value:taskSchema.parse({ ...stamp(),title }) }] })));
  const killed = spawnSync(process.execPath,['-e',"require('fs').writeFileSync(process.argv[1], '{'); process.kill(process.pid, 'SIGKILL');",join(dir,'state.json.'+crypto.randomUUID()+'.tmp')]);
  expect(killed.status).not.toBe(0);
  const restarted = new Storage(dir);
  expect((await restarted.load()).tasks.map((task) => task.title)).toEqual(['One','Two']);
  expect(JSON.parse(await readFile(join(dir,'state.json'),'utf8')).revision).toBe(2);
  expect(await restarted.listBackups()).toHaveLength(1);
});
it('restores a valid daily backup when the active file is corrupt',async () => {
  const { dir } = await workspace();
  await writeFile(join(dir,'state.json'),'corrupt');
  const recovered = new Storage(dir);
  expect((await recovered.load()).schemaVersion).toBe(1);
  expect(recovered.recoveredFrom).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});

