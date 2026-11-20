import { mkdir,rm } from 'node:fs/promises';
import { join } from 'node:path';
import { nextPrayer } from '../shared/prayer';
import { clock } from '../shared/time';
import { remaining } from '../shared/timer';
import type { State } from '../shared/schema';
import { atomicWrite, Storage } from './storage';

export function startHmBar(storage: Storage, directory: string) {
  const target = join(directory,'hm-bar.json');
  let queue: Promise<void> = Promise.resolve();
  let lastWrite = 0;
  let active = false;
  const refresh = (state: State,force = false) => {
    const now = Date.now();
    if (!state.settings.hmBar && !active && !force) return;
    if (!force && now-lastWrite<15000) return;
    lastWrite = now;
    active = state.settings.hmBar;
    const enabled = active;
    queue = queue.then(async () => {
      if (!enabled) { await rm(target,{ force:true });return; }
      const prayer = nextPrayer(new Date(now),state.settings);
      const { timer } = state;
      await mkdir(directory,{ recursive:true });
      await atomicWrite(target,JSON.stringify({
        version:1,updatedAt:now,
        timer:{ status:timer.status,phase:timer.phase,remainingMs:remaining(timer,now),endsAt:timer.endsAt },
        nextPrayer:prayer ? { name:prayer.name,time:prayer.time,display:clock(prayer.time,state.settings) } : null
      }));
    }).catch((error: unknown) => console.error('HM-Bar integration failed',error));
  };
  refresh(storage.state,true);
  const unsubscribe = storage.subscribe((state) => refresh(state,true));
  const pulse = setInterval(() => refresh(storage.state),15000);
  return async () => {
    unsubscribe();
    clearInterval(pulse);
    await queue;
    await rm(target,{ force:true }).catch(() => undefined);
  };
}

