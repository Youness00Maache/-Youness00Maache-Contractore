// Prints the English narration sentences (one JSON line per sentence: key = "<chapter>.<scene>.<index>") for translators.
//   node scripts/dump-say.mjs 01 02 ...        (chapter numbers; none = all)
//   node scripts/dump-say.mjs --titles 01 02   (chapter titles + summaries instead: keys "<chapter>.title" / "<chapter>.summary")
import { loadChapters } from '../tts/narrate.mjs';

const args = process.argv.slice(2);
const titles = args.includes('--titles');
const nums = args.filter((a) => /^\d+$/.test(a)).map((a) => a.padStart(2, '0'));
for (const c of await loadChapters(nums.length ? nums : null)) {
  if (titles) { console.log(JSON.stringify({ [`${c.id}.title`]: c.title })); console.log(JSON.stringify({ [`${c.id}.summary`]: c.summary })); continue; }
  for (const s of c.scenes) s.say.forEach((t, i) => console.log(JSON.stringify({ [`${c.id}.${s.id}.${i}`]: t })));
}
