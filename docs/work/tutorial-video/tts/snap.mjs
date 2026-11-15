// Sentence cut points that never fall inside a word: each boundary between two sentences moves to the middle of the nearest
// real pause in the audio (ffmpeg silencedetect). Used for exact captions and for placing every sentence on its own.
import { spawnSync } from 'node:child_process';

export function silences(file, noiseDb = -34, minDur = 0.12) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', `silencedetect=noise=${noiseDb}dB:d=${minDur}`, '-f', 'null', '-'], { encoding: 'utf8' });
  const res = []; let cur = null;
  for (const line of String(r.stderr || '').split('\n')) {
    let m = line.match(/silence_start:\s*(-?[\d.]+)/);
    if (m) { cur = { start: Math.max(0, Number(m[1])) }; continue; }
    m = line.match(/silence_end:\s*([\d.]+)/);
    if (m && cur) { cur.end = Number(m[1]); res.push(cur); cur = null; }
  }
  return res;
}

/** sentences: [{start,end}] (seconds, contiguous). Returns the same shape with inner boundaries snapped to pauses (+-0.8 s). */
export function snapSentences(sentences, silenceList, tol = 0.8) {
  if (sentences.length < 2) return sentences;
  const cuts = [0];
  for (let k = 1; k < sentences.length; k++) {
    const b = sentences[k].start;
    let best = null, bestD = tol;
    for (const s of silenceList) {
      const c = (s.start + s.end) / 2;
      const d = Math.abs(c - b);
      if (d < bestD && c > cuts[cuts.length - 1] + 0.3) { best = c; bestD = d; }
    }
    cuts.push(best ?? b);
  }
  const total = sentences[sentences.length - 1].end;
  return sentences.map((_, k) => ({ start: +cuts[k].toFixed(3), end: +(k + 1 < cuts.length ? cuts[k + 1] : total).toFixed(3) }));
}
