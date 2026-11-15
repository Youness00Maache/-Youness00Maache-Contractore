/**
 * Video course ("Help & tutorials" > Video course): the manifest that describes the chapters, the 10 languages, and the
 * viewer's saved place. Pure helpers, no React, no Supabase, so scripts/video-course-check.ts can test them.
 *
 * The media itself (chapter videos, per-language voice-over, subtitle bundles) is NOT in this repository. It is published to
 * a public storage folder (default: the `tutorial-media` bucket) and described by `<base>/manifest.json`. When that file is
 * missing the course simply does not show.
 */

export type VideoLang = 'en' | 'es' | 'fr' | 'de' | 'it' | 'pt' | 'zh' | 'ja' | 'ko' | 'ru';

export const VIDEO_LANGS: ReadonlyArray<{ code: VideoLang; appName: string; native: string }> = [
  { code: 'en', appName: 'English', native: 'English' },
  { code: 'es', appName: 'Spanish', native: 'Español' },
  { code: 'fr', appName: 'French', native: 'Français' },
  { code: 'de', appName: 'German', native: 'Deutsch' },
  { code: 'it', appName: 'Italian', native: 'Italiano' },
  { code: 'pt', appName: 'Portuguese', native: 'Português' },
  { code: 'zh', appName: 'Chinese', native: '中文' },
  { code: 'ja', appName: 'Japanese', native: '日本語' },
  { code: 'ko', appName: 'Korean', native: '한국어' },
  { code: 'ru', appName: 'Russian', native: 'Русский' },
];

/** The app's language name (profile.language: "Spanish") -> the code used by the course. Unknown -> English. */
export const videoLangFromApp = (appName: string | null | undefined): VideoLang =>
  VIDEO_LANGS.find((l) => l.appName.toLowerCase() === String(appName || '').toLowerCase())?.code ?? 'en';

export const videoLangNative = (code: VideoLang): string => VIDEO_LANGS.find((l) => l.code === code)?.native ?? code;

export interface VideoChapter {
  id: string;
  number: number;
  /** titles / one-line summaries by language code; English is always present */
  title: Partial<Record<VideoLang, string>> & { en: string };
  summary: Partial<Record<VideoLang, string>>;
  /** seconds */
  duration: number;
  /** paths relative to the media base */
  video: string;
  /** a small JPEG data URI (or relative path) shown before play */
  poster?: string;
  /** voice-over files per language (only languages that have a voice) */
  audio: Partial<Record<VideoLang, string>>;
  /** help guide ids this chapter covers (for "Watch the video" links on the guides) */
  guides: string[];
}

export interface VideoManifest {
  version: 1;
  chapters: VideoChapter[];
  /** subtitle bundle per language: relative path of a JSON { [chapterId]: Cue[] } */
  subtitles: Partial<Record<VideoLang, string>>;
}

/** [startSeconds, endSeconds, text] */
export type Cue = [number, number, string];
export type SubtitleBundle = Record<string, Cue[]>;

const env: Record<string, string | undefined> = (((import.meta as unknown as { env?: Record<string, string | undefined> }).env) || {});
export const VIDEO_MEDIA_BASE = (env.VITE_TUTORIAL_MEDIA_BASE?.trim() || 'https://iauteblvljppwzsxloyd.supabase.co/storage/v1/object/public/tutorial-media/v1').replace(/\/+$/, '');

export const mediaUrl = (rel: string, base: string = VIDEO_MEDIA_BASE): string => (/^(https?:|data:|blob:)/.test(rel) ? rel : `${base}/${rel.replace(/^\/+/, '')}`);

/** Defensive parse: a malformed manifest must never break the Help page. */
export function parseManifest(raw: unknown): VideoManifest | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.version !== 1 || !Array.isArray(r.chapters)) return null;
  const chapters: VideoChapter[] = [];
  for (const c of r.chapters as Array<Record<string, unknown>>) {
    if (!c || typeof c.id !== 'string' || typeof c.video !== 'string' || typeof c.duration !== 'number') continue;
    const title = (c.title && typeof c.title === 'object' ? c.title : {}) as Record<string, string>;
    if (typeof title.en !== 'string') continue;
    chapters.push({
      id: c.id,
      number: typeof c.number === 'number' ? c.number : chapters.length + 1,
      title: title as VideoChapter['title'],
      summary: (c.summary && typeof c.summary === 'object' ? c.summary : {}) as VideoChapter['summary'],
      duration: c.duration,
      video: c.video,
      poster: typeof c.poster === 'string' ? c.poster : undefined,
      audio: (c.audio && typeof c.audio === 'object' ? c.audio : {}) as VideoChapter['audio'],
      guides: Array.isArray(c.guides) ? (c.guides as unknown[]).filter((g): g is string => typeof g === 'string') : [],
    });
  }
  if (!chapters.length) return null;
  chapters.sort((a, b) => a.number - b.number);
  return { version: 1, chapters, subtitles: (r.subtitles && typeof r.subtitles === 'object' ? r.subtitles : {}) as VideoManifest['subtitles'] };
}

let manifestPromise: Promise<VideoManifest | null> | null = null;
/** Fetches the manifest once per page load; null when the course is not published (yet). */
export function loadManifest(base: string = VIDEO_MEDIA_BASE): Promise<VideoManifest | null> {
  if (!manifestPromise) {
    // no fetch options: any custom cache mode can force a cross-origin pre-check; a 5-minute stamp keeps updates fresh instead
    manifestPromise = fetch(`${base}/manifest.json?v=${Math.floor(Date.now() / 300000)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then(parseManifest)
      .catch(() => null);
  }
  return manifestPromise;
}

const bundles = new Map<string, Promise<SubtitleBundle>>();
export function loadSubtitles(manifest: VideoManifest, lang: VideoLang, base: string = VIDEO_MEDIA_BASE): Promise<SubtitleBundle> {
  const rel = manifest.subtitles[lang];
  if (!rel) return Promise.resolve({});
  const url = mediaUrl(rel, base);
  let p = bundles.get(url);
  if (!p) {
    p = fetch(url).then((r) => (r.ok ? r.json() : {})).then((j) => (j && typeof j === 'object' ? (j as SubtitleBundle) : {})).catch(() => ({}));
    bundles.set(url, p);
  }
  return p;
}

/** The cue showing at time t (cues are sorted by start); -1 when none. */
export function cueIndexAt(cues: ReadonlyArray<Cue>, t: number): number {
  let lo = 0, hi = cues.length - 1, found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cues[mid][0] <= t) { found = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return found >= 0 && t < cues[found][1] + 0.15 ? found : -1;
}

export const formatClock = (sec: number): string => {
  const s = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
};

/** The viewer's saved place and choices (this browser only). */
export interface VideoProgress {
  chapter: string | null;
  t: number;
  speed: number;
  sub: VideoLang | 'off' | null;
  audio: VideoLang | 'off' | null;
  /** furthest second watched per chapter id */
  watched: Record<string, number>;
}
const KEY = 'cd.video.v1';
export const emptyProgress = (): VideoProgress => ({ chapter: null, t: 0, speed: 1, sub: null, audio: null, watched: {} });

export function readProgress(): VideoProgress {
  try {
    const raw = JSON.parse(window.localStorage.getItem(KEY) || 'null');
    if (!raw || typeof raw !== 'object') return emptyProgress();
    return {
      chapter: typeof raw.chapter === 'string' ? raw.chapter : null,
      t: Number.isFinite(raw.t) ? Math.max(0, raw.t) : 0,
      speed: [0.75, 1, 1.25, 1.5, 2].includes(raw.speed) ? raw.speed : 1,
      sub: raw.sub === 'off' || VIDEO_LANGS.some((l) => l.code === raw.sub) ? raw.sub : null,
      audio: raw.audio === 'off' || VIDEO_LANGS.some((l) => l.code === raw.audio) ? raw.audio : null,
      watched: raw.watched && typeof raw.watched === 'object' ? raw.watched : {},
    };
  } catch { return emptyProgress(); }
}
export function writeProgress(p: VideoProgress): void {
  try { window.localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* storage blocked: the course still works */ }
}

/** The chapter that covers a help guide (for "Watch the video" on a guide), if any. */
export const chapterForGuide = (manifest: VideoManifest | null, guideId: string): VideoChapter | undefined =>
  manifest?.chapters.find((c) => c.guides.includes(guideId));
