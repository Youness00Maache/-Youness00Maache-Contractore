// Tiny timeline helper for the motion scenes: at(seconds, fn) runs fn that many seconds after the page loaded.
// The scene length comes as ?d=<seconds>. cue(f) = the second at which the narration reaches fraction f (0..1) of its text
// (the voice starts 0.45 s into a scene and ends 0.3 s before the scene does), so the pages follow the real voice length.
(function () {
  const q = new URLSearchParams(location.search);
  const D = Number(q.get('d')) || 20;
  const t0 = performance.now();
  const timers = [];
  window.kit = {
    D,
    cue(f) { return 0.45 + f * Math.max(1, D - 0.75); },
    at(t, fn) { timers.push(setTimeout(fn, Math.max(0, t * 1000 - (performance.now() - t0)))); },
    atf(f, fn) { this.at(this.cue(f), fn); },
    on(el, t) { this.at(t, () => el && el.classList.add('on')); },
    off(el, t) { this.at(t, () => el && el.classList.remove('on')); },
    onf(el, f) { this.on(el, this.cue(f)); },
    offf(el, f) { this.off(el, this.cue(f)); },
    $: (s) => document.querySelector(s),
    $$: (s) => Array.from(document.querySelectorAll(s)),
    tapAt(x, y, t) { this.at(t, () => { let d = document.getElementById('__tap'); if (!d) { d = document.createElement('div'); d.id = '__tap'; d.className = 'tap'; document.body.appendChild(d); } d.style.left = x + 'px'; d.style.top = y + 'px'; d.classList.remove('go'); void d.offsetWidth; d.classList.add('go'); }); },
    tapf(x, y, f) { this.tapAt(x, y, this.cue(f)); },
    type(el, text, t, dur) { this.at(t, () => { const n = text.length; for (let i = 1; i <= n; i++) setTimeout(() => { el.textContent = text.slice(0, i); }, (dur * 1000 * i) / n); }); },
    /** show one .view, hide the others */
    view(id, t) { this.at(t, () => { document.querySelectorAll('.view').forEach((v) => v.classList.toggle('on', v.id === id)); }); },
    viewf(id, f) { this.view(id, this.cue(f)); },
  };
  window.__done = false;
  setTimeout(() => { window.__done = true; }, D * 1000);
})();
