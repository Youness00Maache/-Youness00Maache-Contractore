// AI33 text-to-speech client, written to match how the Framitor project calls it
// (Framitor: worker/app/providers.py create_ai33_voice_job / wait_for_ai33 / list_ai33_voices).
//
//   Base URL     https://api.ai33.pro            (override with AI33_BASE_URL)
//   Auth header  xi-api-key: <key>               the key comes ONLY from the AI33_API_KEY environment variable;
//                                                this file never prints, logs or stores it
//   Voices       GET  /v3/voices?provider=elevenlabs&page=1&page_size=100     -> { data: [{ voice_id, name, ... }] }
//   Speak        POST /v3/text-to-speech (multipart form: text, voice_id, speed 0.5-1.5, with_transcript, file_name)
//                                                                              -> { task_id }
//   Poll         GET  /v1/task/<task_id> every ~3 s until status is done/completed/success
//                                                                              -> audio_url (nested), srt_url
//   Credits      GET  /v1/credits
//   voice ids are provider-prefixed (elevenlabs_..., edge_..., kokoro_...); 429/503 are retried with backoff.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// The key may also live in docs/work/tutorial-video/.env.local (one line: AI33_API_KEY=...). That file is git-ignored,
// is created by the OWNER, and is only read here; the value is never printed.
try {
  const envFile = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env.local');
  if (!process.env.AI33_API_KEY && fs.existsSync(envFile)) {
    for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*(AI33_API_KEY|AI33_BASE_URL)\s*=\s*(.*?)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    }
  }
} catch { /* ignore */ }
const BASE = (process.env.AI33_BASE_URL || 'https://api.ai33.pro').replace(/\/$/, '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function headers() {
  const key = process.env.AI33_API_KEY;
  if (!key) throw new Error('AI33_API_KEY is not set in the environment. Set it yourself (never paste it in chat or commit it).');
  return { 'xi-api-key': key, 'user-agent': 'tutorial-video-tool/1.0' };
}

async function request(method, path, body) {
  let res;
  for (let attempt = 0; attempt < 6; attempt++) {
    res = await fetch(BASE + path, { method, headers: headers(), body });
    if (res.status !== 429 && res.status !== 503) return res;
    const ra = Number(res.headers.get('retry-after'));
    await sleep((Number.isFinite(ra) && ra > 0 ? ra * 1000 : Math.min(30000, 2 ** attempt * 1000)) + Math.random() * 300);
  }
  return res;
}
const nested = (obj, key) => {
  if (!obj || typeof obj !== 'object') return '';
  if (typeof obj[key] === 'string' && obj[key]) return obj[key];
  for (const v of Object.values(obj)) { const f = nested(v, key); if (f) return f; }
  return '';
};
const prefixed = (id) => (/^(elevenlabs_|minimax_|clone_|edge_|kokoro_|vbee_|fishaudio_)/.test(id) ? id : `elevenlabs_${id}`);

export async function credits() {
  const res = await request('GET', '/v1/credits');
  if (!res.ok) throw new Error(`AI33 credits: HTTP ${res.status}`);
  return res.json();
}

export async function listVoices(provider = 'elevenlabs', page = 1, pageSize = 100, search = '') {
  const q = new URLSearchParams({ provider, page: String(page), page_size: String(pageSize) });
  if (search) q.set('search', search);
  const res = await request('GET', `/v3/voices?${q}`);
  if (!res.ok) throw new Error(`AI33 voices: HTTP ${res.status}`);
  const j = await res.json();
  return Array.isArray(j.data) ? j.data : [];
}

/**
 * Speak `text` with `voiceId`; returns { mp3: Buffer, srt: string }. Throws a readable error (never includes the key).
 * Handles what Framitor learned the hard way (see AI33 doc): a task that stays "doing" at 0% for 6+ minutes is submitted again
 * (up to 3 times); a transcript that never finishes is dropped after a while (the audio is still used; timing then falls back
 * to proportional); the transcript download needs the key header; the audio CDN is retried.
 */
export async function speak(text, voiceId, { speed = 1.0, fileName = 'narration.mp3', timeoutMs = 30 * 60 * 1000 } = {}) {
  const submit = async () => {
    const form = new FormData();
    form.append('text', text);
    form.append('voice_id', prefixed(voiceId));
    form.append('speed', String(Math.min(1.5, Math.max(0.5, speed))));
    form.append('with_transcript', 'true');
    form.append('file_name', fileName);
    const created = await request('POST', '/v3/text-to-speech', form);
    if (created.status === 401 || created.status === 403) throw new Error('AI33 rejected the API key or account access.');
    if (created.status === 402) throw new Error('AI33 has insufficient credits.');
    if (!created.ok) throw new Error(`AI33 rejected the voice request (${created.status}): ${(await created.text()).slice(0, 200)}`);
    const made = await created.json();
    const id = made.task_id || made.id;
    if (!id) throw new Error('AI33 did not return a task id.');
    return id;
  };
  const poll = async (task) => {
    const res = await request('GET', `/v1/task/${task}`);
    if (res.status === 401 || res.status === 403) throw new Error('AI33 rejected the API key while checking the voice job.');
    if (res.status >= 500 || [408, 425, 429].includes(res.status)) throw new Error(`transient ${res.status}`);
    return res.json();
  };
  const download = async (url, withKey) => {
    for (let i = 0; i < 4; i++) {
      try { const r = await fetch(url, withKey ? { headers: headers() } : undefined); if (r.ok) return r; } catch { /* retry */ }
      await sleep(2000 * (i + 1));
    }
    throw new Error('Could not download a result file from AI33.');
  };

  let task = await submit();
  let submittedAt = Date.now(), resubmits = 0, failures = 0, doneAt = 0;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    let payload;
    try { payload = await poll(task); failures = 0; }
    catch (e) {
      if (String(e.message).includes('rejected the API key')) throw e;
      if (++failures > 8) throw new Error(`AI33 status polling failed repeatedly: ${e.message}`);
      await sleep(Math.min(30000, 3000 * failures));
      continue;
    }
    const status = String(payload.status || '').toLowerCase();
    if (['done', 'completed', 'success'].includes(status)) {
      const audioUrl = nested(payload, 'audio_url') || nested(payload, 'result_audio_url');
      if (!audioUrl) throw new Error('AI33 finished without an audio URL.');
      const srtUrl = nested(payload, 'srt_url') || nested(payload, 'transcript_url');
      const tstatus = String(nested(payload, 'transcript_status') || '').toLowerCase();
      if (!srtUrl && tstatus === 'processing') {
        if (!doneAt) doneAt = Date.now();
        if (Date.now() - doneAt < 90000) { await sleep(3000); continue; } // give the transcript a little longer, then go without
      }
      const mp3 = Buffer.from(await (await download(audioUrl, false)).arrayBuffer());
      let srt = '';
      if (srtUrl) { try { srt = await (await download(srtUrl, true)).text(); } catch { /* proportional timing is the fallback */ } }
      return { mp3, srt };
    }
    if (['error', 'failed', 'cancelled', 'canceled'].includes(status)) throw new Error(nested(payload, 'error_message') || nested(payload, 'message') || 'AI33 voice generation failed.');
    const progress = Number(payload.progress || 0);
    if (!progress && Date.now() - submittedAt > 6 * 60 * 1000) { // accepted but never started
      if (++resubmits > 3) throw new Error('AI33 accepted the task but never started it (tried 4 times).');
      task = await submit(); submittedAt = Date.now();
      continue;
    }
    await sleep(3000);
  }
  throw new Error('AI33 voice generation timed out.');
}
