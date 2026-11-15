// Re-cuts the sentence windows of ALREADY generated narration at the real pauses (no new AI33 calls).
//   node tts/resnap.mjs [lang ...]        (default: en es)
import fs from 'node:fs';
import path from 'node:path';
import { CACHE } from '../config.mjs';
import { silences, snapSentences } from './snap.mjs';

const langs = process.argv.slice(2).length ? process.argv.slice(2) : ['en', 'es'];
let n = 0, moved = 0;
for (const L of langs) {
  const root = path.join(CACHE, 'audio', L);
  if (!fs.existsSync(root)) continue;
  for (const ch of fs.readdirSync(root)) for (const f of fs.readdirSync(path.join(root, ch)).filter((x) => x.endsWith('.json'))) {
    const jf = path.join(root, ch, f);
    const meta = JSON.parse(fs.readFileSync(jf, 'utf8'));
    if (meta.mock || !meta.file) continue;
    const before = JSON.stringify(meta.sentences);
    meta.sentences = snapSentences(meta.sentences, silences(path.join(root, ch, meta.file)));
    meta.snapped = true;
    fs.writeFileSync(jf, JSON.stringify(meta, null, 1));
    n++; if (JSON.stringify(meta.sentences) !== before) moved++;
  }
}
console.log(`re-cut ${n} scene(s), ${moved} changed`);
