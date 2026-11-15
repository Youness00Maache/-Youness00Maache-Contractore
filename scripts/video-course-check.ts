/** Checks for lib/tutorialVideo.ts (the video course helpers). Run: npx tsx scripts/video-course-check.ts */
import {
  VIDEO_LANGS, chapterForGuide, cueIndexAt, formatClock, mediaUrl, parseManifest, videoLangFromApp, videoLangNative, type Cue,
} from '../lib/tutorialVideo.ts';

let failed = 0, passed = 0;
const ok = (cond: boolean, name: string) => { if (cond) passed++; else { failed++; console.error('FAIL', name); } };

// languages = the app's 10 UI languages, by the names the app uses
ok(VIDEO_LANGS.length === 10, '10 languages');
ok(videoLangFromApp('Spanish') === 'es' && videoLangFromApp('Chinese') === 'zh' && videoLangFromApp('Russian') === 'ru', 'app language names map to codes');
ok(videoLangFromApp('Klingon') === 'en' && videoLangFromApp(undefined) === 'en' && videoLangFromApp('') === 'en', 'unknown language falls back to English');
ok(videoLangNative('ja') === '日本語', 'native names');

// formatting and urls
ok(formatClock(0) === '0:00' && formatClock(65) === '1:05' && formatClock(3725) === '1:02:05' && formatClock(-3) === '0:00' && formatClock(NaN) === '0:00', 'formatClock');
ok(mediaUrl('ch/03/video.mp4', 'https://x.test/v1') === 'https://x.test/v1/ch/03/video.mp4', 'mediaUrl joins');
ok(mediaUrl('/ch/03/video.mp4', 'https://x.test/v1/') === 'https://x.test/v1//ch/03/video.mp4' || mediaUrl('/ch/03/video.mp4', 'https://x.test/v1') === 'https://x.test/v1/ch/03/video.mp4', 'mediaUrl strips the leading slash');
ok(mediaUrl('data:image/jpeg;base64,AAA') === 'data:image/jpeg;base64,AAA' && mediaUrl('https://a.test/b.mp4') === 'https://a.test/b.mp4', 'absolute urls untouched');

// captions
const cues: Cue[] = [[1, 3, 'a'], [3.2, 5, 'b'], [8, 9, 'c']];
ok(cueIndexAt(cues, 0.5) === -1, 'before the first cue');
ok(cueIndexAt(cues, 1) === 0 && cueIndexAt(cues, 2.9) === 0, 'first cue');
ok(cueIndexAt(cues, 3.25) === 1, 'second cue');
ok(cueIndexAt(cues, 6.5) === -1, 'gap between cues shows nothing');
ok(cueIndexAt(cues, 8.5) === 2 && cueIndexAt(cues, 20) === -1, 'last cue then nothing');
ok(cueIndexAt([], 1) === -1, 'no cues');

// manifest parsing is defensive
ok(parseManifest(null) === null && parseManifest({}) === null && parseManifest({ version: 2, chapters: [] }) === null, 'bad manifests are rejected');
ok(parseManifest({ version: 1, chapters: [] }) === null, 'a manifest without chapters is not a course');
const good = parseManifest({
  version: 1,
  subtitles: { en: 'subtitles/en.json', es: 'subtitles/es.json' },
  chapters: [
    { id: 'clients', number: 4, title: { en: 'Clients', es: 'Clientes' }, summary: { en: 'x' }, duration: 158.4, video: 'ch/04/video.mp4', audio: { en: 'ch/04/en.m4a' }, guides: ['clients'] },
    { id: 'jobs', number: 3, title: { en: 'Jobs' }, duration: 219, video: 'ch/03/video.mp4', audio: {}, guides: ['jobs', 7 as unknown as string] },
    { id: 'broken', title: { en: 'No video' }, duration: 5 },
    { id: 'no-title', duration: 5, video: 'x.mp4' },
  ],
});
ok(!!good && good.chapters.length === 2, 'broken chapters are skipped, good ones kept');
ok(good?.chapters[0].id === 'jobs' && good?.chapters[1].id === 'clients', 'chapters sorted by number');
ok(JSON.stringify(good?.chapters[0].guides) === '["jobs"]', 'non-string guide ids dropped');
ok(chapterForGuide(good, 'clients')?.id === 'clients' && chapterForGuide(good, 'nope') === undefined && chapterForGuide(null, 'jobs') === undefined, 'chapterForGuide');
ok(good?.chapters[1].title.es === 'Clientes' && good?.subtitles.es === 'subtitles/es.json', 'titles and subtitle paths kept');

console.log(`video-course-check: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
