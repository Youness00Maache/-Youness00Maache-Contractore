// List AI33 voices that advertise a language (no secrets printed):  node tts/voices.mjs <lang code> [provider=elevenlabs] [pages=3]
// The key is read by tts/ai33.mjs (AI33_API_KEY, .env.local, or the env file named in AI33_ENV_FILE).
import { listVoices } from './ai33.mjs';

const [lang = 'es', provider = 'elevenlabs', pages = '3'] = process.argv.slice(2);
const codes = (v) => {
  const raw = [v.language, v.locale, ...(Array.isArray(v.languages) ? v.languages.flatMap((l) => (typeof l === 'string' ? [l] : [l.language, l.locale])) : [])];
  return [...new Set(raw.filter(Boolean).map((x) => String(x).toLowerCase().replace('_', '-').split('-')[0]))];
};
let total = 0;
for (let page = 1; page <= Number(pages); page++) {
  const list = await listVoices(provider, page, 100);
  if (!list.length) break;
  total += list.length;
  for (const v of list) {
    const c = codes(v);
    if (!c.includes(lang)) continue;
    console.log(`${v.voice_id} | ${v.name} | ${v.gender || '?'} | ${c.length > 4 ? 'multilingual(' + c.length + ')' : c.join(',')} | ${String(v.description || '').slice(0, 70)}`);
  }
}
console.error(`scanned ${total} ${provider} voices`);
