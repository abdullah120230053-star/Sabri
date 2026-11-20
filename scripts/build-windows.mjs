import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cli=fileURLToPath(new URL('../node_modules/electron-builder/cli.js',import.meta.url));
const options=['--win','--publish','never'];
const feed=process.env.SABRI_UPDATE_FEED;
if (feed) {
  const url=new URL(feed);
  const publisher=process.env.SABRI_UPDATE_PUBLISHER?.trim();
  if (url.protocol!=='https:' || url.username || url.password || url.search || url.hash || !publisher)
    throw new Error('Configure an HTTPS update feed and the certificate publisher name.');
  if (!process.env.CSC_LINK && !process.env.WIN_CSC_LINK && !process.env.CSC_NAME)
    throw new Error('An update-enabled distribution needs Windows publisher signing.');
  options.push('--config.publish.provider=generic','--config.publish.url='+url.href,'--config.win.publisherName='+publisher);
}
const result=spawnSync(process.execPath,[cli,...options],{ stdio:'inherit' });
if (result.error) throw result.error;
process.exitCode=result.status ?? 1;
