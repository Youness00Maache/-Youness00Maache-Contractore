/**
 * Video course player (Help & tutorials > Video course): one long video in chapters, like YouTube chapters.
 * - one muted <video> per chapter + a separate <audio> for the chosen voice-over language, kept in step (so every language
 *   shares one video file); captions are drawn here from the subtitle bundle (10 languages), on by default;
 * - chapter list with "Next section", watched progress, speed, caption language, voice language, transcript (click to seek),
 *   keyboard shortcuts, fullscreen, remembers the last place; works on a phone (the list moves under the video).
 * Lazy-loaded by HelpCenter, and only when the manifest exists (lib/tutorialVideo.ts).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  VIDEO_LANGS, chapterForGuide, cueIndexAt, formatClock, loadSubtitles, mediaUrl, readProgress, videoLangFromApp, videoLangNative, writeProgress,
  type Cue, type SubtitleBundle, type VideoChapter, type VideoLang, type VideoManifest, type VideoProgress,
} from '../../lib/tutorialVideo.ts';

export interface VideoRequest { chapterId: string; t?: number; autoplay?: boolean; nonce: number }

const SPEEDS = [0.75, 1, 1.25, 1.5, 2];
const pickTitle = (c: VideoChapter, lang: VideoLang) => c.title[lang] || c.title.en;
const pickSummary = (c: VideoChapter, lang: VideoLang) => c.summary[lang] || c.summary.en || '';

/** A small popup menu opened by a labelled pill button. */
const PillMenu: React.FC<{
  label: string; value: string; open: boolean; onToggle: () => void; onClose: () => void; children: React.ReactNode; title: string;
}> = ({ label, value, open, onToggle, onClose, children, title }) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { onClose(); } };
    document.addEventListener('mousedown', away); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open, onClose]);
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={onToggle} aria-haspopup="menu" aria-expanded={open} title={title}
        className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-xs font-semibold text-foreground hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
        <span className="text-muted-foreground">{label}</span><span>{value}</span>
      </button>
      {open && (
        <div role="menu" aria-label={title} className="absolute bottom-11 right-0 z-30 max-h-72 min-w-[10rem] overflow-y-auto rounded-xl border border-border bg-card p-1 shadow-xl">
          {children}
        </div>
      )}
    </div>
  );
};
const MenuItem: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode; disabled?: boolean }> = ({ active, onClick, children, disabled }) => (
  <button type="button" role="menuitemradio" aria-checked={active} disabled={disabled} onClick={onClick}
    className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-muted disabled:opacity-40 ${active ? 'font-semibold text-primary' : 'text-foreground'}`}>
    <span>{children}</span>{active && <span aria-hidden="true">✓</span>}
  </button>
);

const VideoCourse: React.FC<{ manifest: VideoManifest; appLanguage?: string | null; request?: VideoRequest | null }> = ({ manifest, appLanguage, request }) => {
  const chapters = manifest.chapters;
  const uiLang = videoLangFromApp(appLanguage);
  const initial = useMemo<VideoProgress>(() => readProgress(), []);
  const audioLangs = useMemo(() => VIDEO_LANGS.filter((l) => chapters.some((c) => c.audio[l.code])).map((l) => l.code), [chapters]);
  const subLangs = useMemo(() => VIDEO_LANGS.filter((l) => manifest.subtitles[l.code]).map((l) => l.code), [manifest]);

  const startIdx = Math.max(0, chapters.findIndex((c) => c.id === initial.chapter));
  const [idx, setIdx] = useState(startIdx);
  const [speed, setSpeed] = useState(initial.speed);
  const [sub, setSub] = useState<VideoLang | 'off'>(initial.sub ?? (subLangs.includes(uiLang) ? uiLang : subLangs.includes('en') ? 'en' : 'off'));
  const [audio, setAudio] = useState<VideoLang | 'off'>(initial.audio ?? (audioLangs.includes(uiLang) ? uiLang : audioLangs.includes('en') ? 'en' : 'off'));
  const [playing, setPlaying] = useState(false);
  const [now, setNow] = useState(initial.chapter && chapters[startIdx]?.id === initial.chapter ? initial.t : 0);
  const [dur, setDur] = useState(chapters[startIdx]?.duration || 0);
  const [watched, setWatched] = useState<Record<string, number>>(initial.watched);
  const [bundle, setBundle] = useState<SubtitleBundle>({});
  const [menu, setMenu] = useState<null | 'speed' | 'cc' | 'voice'>(null);
  const [transcript, setTranscript] = useState(false);
  const [volume, setVolume] = useState(1);
  const [videoError, setVideoError] = useState(false);
  const [audioMissing, setAudioMissing] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [fs, setFs] = useState(false);

  const boxRef = useRef<HTMLDivElement>(null);
  const vRef = useRef<HTMLVideoElement>(null);
  const aRef = useRef<HTMLAudioElement>(null);
  const seekTo = useRef<number | null>(initial.chapter && chapters[startIdx]?.id === initial.chapter ? initial.t : null);
  const wantPlay = useRef(false);
  const chapter = chapters[idx];
  const audioUrl = audio !== 'off' && chapter?.audio[audio] ? mediaUrl(chapter.audio[audio] as string) : null;

  // subtitles for the chosen language
  useEffect(() => {
    let live = true;
    if (sub === 'off') { setBundle({}); return; }
    void loadSubtitles(manifest, sub).then((b) => { if (live) setBundle(b); });
    return () => { live = false; };
  }, [manifest, sub]);
  const cues: Cue[] = bundle[chapter?.id] || [];
  const cueIdx = cueIndexAt(cues, now);

  // load the chapter
  useEffect(() => {
    const v = vRef.current; if (!v || !chapter) return;
    setVideoError(false); setCountdown(null);
    v.src = mediaUrl(chapter.video);
    v.load();
    v.playbackRate = speed;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapter?.id]);
  useEffect(() => {
    const a = aRef.current; if (!a) return;
    setAudioMissing(false);
    if (audioUrl) { a.src = audioUrl; a.load(); a.playbackRate = speed; a.currentTime = vRef.current?.currentTime || 0; if (wantPlay.current && playing) void a.play().catch(() => {}); }
    else { a.removeAttribute('src'); a.load(); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioUrl]);
  useEffect(() => { if (vRef.current) vRef.current.playbackRate = speed; if (aRef.current) aRef.current.playbackRate = speed; }, [speed]);
  useEffect(() => { if (aRef.current) aRef.current.volume = volume; }, [volume]);

  const play = useCallback(() => {
    const v = vRef.current; if (!v) return;
    wantPlay.current = true;
    void v.play().catch(() => { setPlaying(false); });
    if (aRef.current && audioUrl) void aRef.current.play().catch(() => {});
  }, [audioUrl]);
  const pause = useCallback(() => { wantPlay.current = false; vRef.current?.pause(); aRef.current?.pause(); }, []);
  const toggle = useCallback(() => { if (vRef.current?.paused) play(); else pause(); }, [play, pause]);
  const seek = useCallback((t: number) => {
    const v = vRef.current; if (!v) return;
    const next = Math.min(Math.max(0, t), (v.duration || chapter?.duration || 0));
    v.currentTime = next; if (aRef.current && audioUrl) aRef.current.currentTime = next; setNow(next);
  }, [audioUrl, chapter?.duration]);
  const goto = useCallback((i: number, at = 0, autoplay = false) => {
    if (i < 0 || i >= chapters.length) return;
    seekTo.current = at > 0 ? at : null; wantPlay.current = autoplay; setNow(at); setDur(chapters[i].duration); setIdx(i); setCountdown(null);
  }, [chapters]);

  // video events -> state (audio follows the video)
  useEffect(() => {
    const v = vRef.current; if (!v) return;
    const onMeta = () => {
      setDur(v.duration || chapter.duration);
      if (seekTo.current != null) { v.currentTime = Math.min(seekTo.current, Math.max(0, (v.duration || 0) - 0.5)); if (aRef.current) aRef.current.currentTime = v.currentTime; seekTo.current = null; }
      if (wantPlay.current) play();
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => { setPlaying(false); };
    const onTime = () => {
      const t = v.currentTime; setNow(t);
      const a = aRef.current;
      if (a && audioUrl && !a.paused && Math.abs(a.currentTime - t) > 0.35) a.currentTime = t; // keep the voice in step
      setWatched((w) => (t > (w[chapter.id] || 0) ? { ...w, [chapter.id]: t } : w));
    };
    const onWaiting = () => { aRef.current?.pause(); };
    const onPlaying = () => { if (aRef.current && audioUrl && wantPlay.current) void aRef.current.play().catch(() => {}); };
    const onEnded = () => {
      setPlaying(false); aRef.current?.pause();
      setWatched((w) => ({ ...w, [chapter.id]: chapter.duration }));
      if (idx < chapters.length - 1) setCountdown(6);
    };
    const onErr = () => setVideoError(true);
    v.addEventListener('loadedmetadata', onMeta); v.addEventListener('play', onPlay); v.addEventListener('pause', onPause);
    v.addEventListener('timeupdate', onTime); v.addEventListener('waiting', onWaiting); v.addEventListener('playing', onPlaying);
    v.addEventListener('ended', onEnded); v.addEventListener('error', onErr);
    return () => {
      v.removeEventListener('loadedmetadata', onMeta); v.removeEventListener('play', onPlay); v.removeEventListener('pause', onPause);
      v.removeEventListener('timeupdate', onTime); v.removeEventListener('waiting', onWaiting); v.removeEventListener('playing', onPlaying);
      v.removeEventListener('ended', onEnded); v.removeEventListener('error', onErr);
    };
  }, [chapter, chapters.length, idx, audioUrl, play]);
  useEffect(() => { const a = aRef.current; if (!a) return; const e = () => setAudioMissing(true); a.addEventListener('error', e); return () => a.removeEventListener('error', e); }, [audioUrl]);

  // "next section" countdown
  useEffect(() => {
    if (countdown == null) return;
    if (countdown <= 0) { goto(idx + 1, 0, true); return; }
    const t = window.setTimeout(() => setCountdown((c) => (c == null ? c : c - 1)), 1000);
    return () => window.clearTimeout(t);
  }, [countdown, idx, goto]);

  // a "watch this chapter" request from the guides / a deep link
  useEffect(() => {
    if (!request) return;
    const i = chapters.findIndex((c) => c.id === request.chapterId);
    if (i >= 0) { goto(i, request.t || 0, !!request.autoplay); boxRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request?.nonce]);

  // remember the place and the choices
  useEffect(() => {
    const save = () => writeProgress({ chapter: chapter?.id ?? null, t: vRef.current?.currentTime ?? now, speed, sub, audio, watched });
    const timer = window.setInterval(save, 3000);
    window.addEventListener('pagehide', save);
    return () => { window.clearInterval(timer); window.removeEventListener('pagehide', save); save(); };
  }, [chapter?.id, speed, sub, audio, watched, now]);

  useEffect(() => { const f = () => setFs(document.fullscreenElement === boxRef.current); document.addEventListener('fullscreenchange', f); return () => document.removeEventListener('fullscreenchange', f); }, []);
  const toggleFs = () => { if (document.fullscreenElement) void document.exitFullscreen(); else void boxRef.current?.requestFullscreen?.(); };

  const onKey = (e: React.KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' && (e.target as HTMLInputElement).type !== 'range') return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === ' ' || k === 'k') { if (tag === 'BUTTON' && k === ' ') return; e.preventDefault(); toggle(); }
    else if (k === 'arrowleft') { if (tag === 'INPUT') return; e.preventDefault(); seek(now - 5); }
    else if (k === 'arrowright') { if (tag === 'INPUT') return; e.preventDefault(); seek(now + 5); }
    else if (k === 'j') seek(now - 10);
    else if (k === 'l') seek(now + 10);
    else if (k === 'n') goto(idx + 1, 0, playing);
    else if (k === 'p') goto(idx - 1, 0, playing);
    else if (k === 'c') setSub((s) => (s === 'off' ? (subLangs.includes(uiLang) ? uiLang : subLangs[0] || 'off') : 'off'));
    else if (k === 'f') toggleFs();
  };

  if (!chapter) return null;
  const doneCount = chapters.filter((c) => (watched[c.id] || 0) >= c.duration - 3).length;
  const caption = sub !== 'off' && cueIdx >= 0 ? cues[cueIdx][2] : '';
  const subName = sub === 'off' ? 'Off' : videoLangNative(sub);
  const audioName = audio === 'off' ? 'Off' : videoLangNative(audio);
  const titleLang: VideoLang = uiLang;

  return (
    <section id="video-course" aria-label="Video course" className="rounded-2xl border border-border bg-card" ref={boxRef} onKeyDown={onKey}>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-1 px-4 pt-4 sm:px-5">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">Video course</h2>
          <p className="text-sm text-muted-foreground">Everything in ContractorDocs, one section at a time. Jump to any section, or just press play.</p>
        </div>
        <p className="text-xs font-medium text-muted-foreground" aria-live="polite">{doneCount} of {chapters.length} sections watched</p>
      </div>

      <div className={`grid gap-4 p-4 sm:p-5 ${fs ? '' : 'lg:grid-cols-[minmax(0,1fr)_19rem]'}`}>
        <div className="min-w-0">
          <div className="relative aspect-video overflow-hidden rounded-xl bg-black">
            <video ref={vRef} className="h-full w-full" muted playsInline preload="metadata" poster={chapter.poster ? mediaUrl(chapter.poster) : undefined}
              onClick={toggle} aria-label={pickTitle(chapter, titleLang)} />
            <audio ref={aRef} preload="auto" />
            {!playing && !videoError && (
              <button type="button" onClick={play} aria-label={`Play: ${pickTitle(chapter, titleLang)}`}
                className="absolute inset-0 flex items-center justify-center bg-black/25 text-white transition hover:bg-black/35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/95 text-black shadow-lg"><svg viewBox="0 0 24 24" className="ml-1 h-7 w-7" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg></span>
              </button>
            )}
            {caption && (
              <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center px-3" aria-hidden="true">
                <span className={`max-w-[92%] rounded-md bg-black/75 px-3 py-1.5 text-center font-medium leading-snug text-white ${fs ? 'text-xl' : 'text-sm sm:text-base'}`}>{caption}</span>
              </div>
            )}
            {videoError && <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-6 text-center text-sm text-white">This section could not be loaded. Check your connection and try again.</div>}
            {countdown != null && idx < chapters.length - 1 && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/75 p-4 text-center text-white">
                <p className="text-xs uppercase tracking-widest text-white/70">Next section in {countdown}</p>
                <p className="max-w-md text-lg font-semibold">{chapters[idx + 1].number}. {pickTitle(chapters[idx + 1], titleLang)}</p>
                <div className="flex gap-2">
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => goto(idx + 1, 0, true)}>Play now</button>
                  <button type="button" className="btn btn-outline btn-sm border-white/40 text-white hover:bg-white/10" onClick={() => setCountdown(null)}>Stay here</button>
                </div>
              </div>
            )}
          </div>

          <div className="mt-2 flex items-center gap-3">
            <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">{formatClock(now)}</span>
            <input type="range" min={0} max={Math.max(1, dur)} step={0.1} value={Math.min(now, dur)} onChange={(e) => seek(Number(e.target.value))}
              aria-label="Seek" aria-valuetext={`${formatClock(now)} of ${formatClock(dur)}`} className="h-1.5 flex-1 cursor-pointer accent-primary" />
            <span className="w-10 text-xs tabular-nums text-muted-foreground">{formatClock(dur)}</span>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button type="button" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'} className="btn btn-primary btn-sm h-9 min-w-[5.5rem]">{playing ? 'Pause' : 'Play'}</button>
            <button type="button" onClick={() => goto(idx - 1, 0, playing)} disabled={idx === 0} aria-label="Previous section" className="btn btn-outline btn-sm h-9">Prev</button>
            <button type="button" onClick={() => goto(idx + 1, 0, playing)} disabled={idx === chapters.length - 1} aria-label="Next section" className="btn btn-outline btn-sm h-9">Next section</button>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="sr-only">Voice volume</span>Vol
                <input type="range" min={0} max={1} step={0.05} value={volume} onChange={(e) => setVolume(Number(e.target.value))} aria-label="Voice volume" className="h-1.5 w-16 accent-primary" />
              </label>
              <PillMenu label="Speed" value={`${speed}×`} title="Playback speed" open={menu === 'speed'} onToggle={() => setMenu(menu === 'speed' ? null : 'speed')} onClose={() => setMenu(null)}>
                {SPEEDS.map((s) => <MenuItem key={s} active={s === speed} onClick={() => { setSpeed(s); setMenu(null); }}>{s}×</MenuItem>)}
              </PillMenu>
              <PillMenu label="Captions" value={subName} title="Caption language" open={menu === 'cc'} onToggle={() => setMenu(menu === 'cc' ? null : 'cc')} onClose={() => setMenu(null)}>
                <MenuItem active={sub === 'off'} onClick={() => { setSub('off'); setMenu(null); }}>Off</MenuItem>
                {subLangs.map((l) => <MenuItem key={l} active={sub === l} onClick={() => { setSub(l); setMenu(null); }}>{videoLangNative(l)}</MenuItem>)}
              </PillMenu>
              {audioLangs.length > 0 && (
                <PillMenu label="Voice" value={audioName} title="Voice-over language" open={menu === 'voice'} onToggle={() => setMenu(menu === 'voice' ? null : 'voice')} onClose={() => setMenu(null)}>
                  <MenuItem active={audio === 'off'} onClick={() => { setAudio('off'); setMenu(null); }}>Off (captions only)</MenuItem>
                  {audioLangs.map((l) => <MenuItem key={l} active={audio === l} onClick={() => { setAudio(l); setMenu(null); }}>{videoLangNative(l)}</MenuItem>)}
                </PillMenu>
              )}
              <button type="button" onClick={toggleFs} aria-label={fs ? 'Exit full screen' : 'Full screen'} className="inline-flex h-9 items-center rounded-full border border-border bg-card px-3 text-xs font-semibold hover:bg-muted">{fs ? 'Exit full screen' : 'Full screen'}</button>
            </div>
          </div>
          {audio !== 'off' && audioMissing && <p className="mt-2 text-xs text-muted-foreground">There is no voice-over in {audioName} for this section yet. Captions are on instead.</p>}

          <div className="mt-3">
            <h3 className="text-base font-semibold text-foreground"><span className="tabular-nums text-muted-foreground">{chapter.number}.</span> {pickTitle(chapter, titleLang)}</h3>
            {pickSummary(chapter, titleLang) && <p className="mt-0.5 text-sm text-muted-foreground">{pickSummary(chapter, titleLang)}</p>}
            <button type="button" className="mt-2 text-xs font-semibold text-primary hover:underline" aria-expanded={transcript} onClick={() => setTranscript((v) => !v)}>
              {transcript ? 'Hide transcript' : 'Show transcript'}
            </button>
            {transcript && (
              <ol className="mt-2 max-h-56 space-y-0.5 overflow-y-auto rounded-xl border border-border p-2 text-sm" aria-label="Transcript">
                {cues.length === 0 && <li className="px-2 py-1 text-muted-foreground">{sub === 'off' ? 'Turn captions on to read the transcript.' : 'No transcript for this section yet.'}</li>}
                {cues.map((c, i) => (
                  <li key={i}>
                    <button type="button" onClick={() => seek(c[0])} className={`flex w-full gap-3 rounded-lg px-2 py-1 text-left hover:bg-muted ${i === cueIdx ? 'bg-muted font-semibold' : ''}`}>
                      <span className="w-10 shrink-0 text-xs tabular-nums text-muted-foreground">{formatClock(c[0])}</span><span>{c[2]}</span>
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>

        {!fs && (
          <nav aria-label="Sections" className="min-w-0 lg:max-h-[34rem] lg:overflow-y-auto lg:pr-1">
            <ol className="divide-y divide-border rounded-xl border border-border">
              {chapters.map((c, i) => {
                const frac = Math.min(1, (watched[c.id] || 0) / Math.max(1, c.duration));
                const active = i === idx;
                return (
                  <li key={c.id}>
                    <button type="button" onClick={() => goto(i, 0, true)} aria-current={active ? 'true' : undefined}
                      className={`group relative flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${active ? 'bg-muted' : ''}`}>
                      {active && <span className="absolute inset-y-0 left-0 w-1 bg-primary" aria-hidden="true" />}
                      <span className="mt-0.5 w-5 shrink-0 text-right text-xs font-semibold tabular-nums text-muted-foreground">{c.number}</span>
                      <span className="min-w-0 flex-1">
                        <span className={`block text-sm leading-snug ${active ? 'font-semibold text-foreground' : 'text-foreground'}`}>{pickTitle(c, titleLang)}</span>
                        <span className="mt-1 flex items-center gap-2">
                          <span className="h-0.5 flex-1 overflow-hidden rounded bg-border" aria-hidden="true"><span className="block h-full bg-primary" style={{ width: `${frac * 100}%` }} /></span>
                          <span className="text-[11px] tabular-nums text-muted-foreground">{formatClock(c.duration)}</span>
                        </span>
                        {frac >= 0.97 && <span className="sr-only">Watched</span>}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
            <p className="mt-2 px-1 text-xs text-muted-foreground">More sections are added as they are finished. Shortcuts: Space play, ← → 5 s, J L 10 s, N next, P previous, C captions, F full screen.</p>
          </nav>
        )}
      </div>
    </section>
  );
};

export default VideoCourse;
export { chapterForGuide };
