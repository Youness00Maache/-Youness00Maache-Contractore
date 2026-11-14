/**
 * IndexNow: tells Bing, Yandex, Seznam, Naver and the other IndexNow engines that the site's URLs changed.
 * Run AFTER a production deploy (the key file and the new sitemap must be live):
 *
 *   npx tsx scripts/indexnow-ping.ts            # reads the live sitemap and submits every URL
 *   npx tsx scripts/indexnow-ping.ts --dry-run  # prints what would be sent, sends nothing
 *   npx tsx scripts/indexnow-ping.ts --sitemap=dist/sitemap.xml   # use a local sitemap file instead
 *
 * The key is public by design (https://www.indexnow.org/documentation): it is served at
 * https://www.contractordocs.app/<key>.txt from public/<key>.txt. To rotate it, add a new public/<key>.txt, change
 * INDEXNOW_KEY below, deploy, then delete the old file.
 * Exit code 1 when the key file is not live, the sitemap can't be read or the endpoint refuses the submission.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const INDEXNOW_KEY = '0c1123aa3adc22d3f1b108f8dc7539c7';
const HOST = 'www.contractordocs.app';
const ORIGIN = `https://${HOST}`;
const ENDPOINT = 'https://api.indexnow.org/indexnow';
const KEY_LOCATION = `${ORIGIN}/${INDEXNOW_KEY}.txt`;
/** IndexNow accepts up to 10,000 URLs per request. */
const BATCH = 10_000;
const HEADERS = { 'User-Agent': 'ContractorDocs-IndexNow/1.0' };

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const sitemapArg = args.find((a) => a.startsWith('--sitemap='))?.slice('--sitemap='.length);

const fail = (msg: string): never => {
  console.error(`[indexnow] ${msg}`);
  process.exit(1);
};

export const parseSitemap = (xml: string): string[] => [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1].replace(/&amp;/g, '&'));

async function readSitemap(): Promise<string> {
  if (sitemapArg && !/^https?:\/\//.test(sitemapArg)) {
    const file = path.resolve(sitemapArg);
    if (!existsSync(file)) fail(`sitemap file not found: ${file}`);
    return readFileSync(file, 'utf8');
  }
  const url = sitemapArg || `${ORIGIN}/sitemap.xml`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) fail(`GET ${url} -> HTTP ${res.status}`);
  return res.text();
}

async function main(): Promise<void> {
  const localKey = path.resolve('public', `${INDEXNOW_KEY}.txt`);
  if (!existsSync(localKey) || readFileSync(localKey, 'utf8').trim() !== INDEXNOW_KEY) {
    fail(`public/${INDEXNOW_KEY}.txt is missing or does not contain the key`);
  }

  const urls = [...new Set(parseSitemap(await readSitemap()))];
  if (!urls.length) fail('the sitemap has no <loc> URLs');
  const foreign = urls.filter((u) => new URL(u).host !== HOST);
  if (foreign.length) fail(`sitemap URLs on another host (IndexNow would refuse them): ${foreign.slice(0, 5).join(', ')}`);

  console.log(`[indexnow] ${urls.length} URLs for ${HOST} (key file ${KEY_LOCATION})`);
  if (dryRun) {
    for (const u of urls) console.log(`  ${u}`);
    console.log('[indexnow] --dry-run: nothing sent.');
    return;
  }

  // The engines fetch the key file to verify ownership; make sure it is live first.
  const keyRes = await fetch(KEY_LOCATION, { headers: HEADERS });
  const keyText = keyRes.ok ? (await keyRes.text()).trim() : '';
  if (keyText !== INDEXNOW_KEY) fail(`${KEY_LOCATION} is not live yet (HTTP ${keyRes.status}). Deploy first, then run this again.`);

  for (let i = 0; i < urls.length; i += BATCH) {
    const urlList = urls.slice(i, i + BATCH);
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { ...HEADERS, 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ host: HOST, key: INDEXNOW_KEY, keyLocation: KEY_LOCATION, urlList }),
    });
    const body = (await res.text()).trim();
    // 200 = accepted, 202 = accepted (key validation pending). 400 bad request, 403 key not valid,
    // 422 URLs don't belong to the host or the key doesn't match, 429 too many requests.
    if (res.status !== 200 && res.status !== 202) fail(`POST ${ENDPOINT} -> HTTP ${res.status} ${body.slice(0, 300)}`);
    console.log(`[indexnow] submitted ${urlList.length} URLs -> HTTP ${res.status}${body ? ` ${body.slice(0, 200)}` : ''}`);
  }
  console.log('[indexnow] done.');
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) await main();
