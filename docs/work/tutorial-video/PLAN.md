# Tutorial video: plan (written 2026-11-15)

Owner request: ONE long tutorial video that explains everything in ContractorDocs, looks like a screen recording (motion graphics
only where the real app cannot be recorded), has chapters ("sections"), a voice-over made with the AI33 API (as in the Framitor
project) and subtitles in several languages, and lives in the app's tutorial/help area.

## What is already proven (spike, 2026-11-15)
- The REAL app (Vite dev server, port 3012) runs against a tiny fake Supabase (`fake-backend/server.mjs` + `seed.mjs`, port
  54329, in-memory, demo data only). Session = a fake token in localStorage; no real account, no secrets.
- Chrome (system Chrome through `playwright-core`) drives it like a person: smooth cursor, click ripples, typing, scrolling
  (`record/lib.mjs`), and a real-time screencast is encoded to H.264 (`record/spike.mjs`): 1280x720, 30 fps, ~216 kbps, i.e.
  ~100 MB per hour of video. No page errors on dashboard -> job page.
- AI33 recipe copied from Framitor into `tts/ai33.mjs` (see "AI33" below). Needs the owner's key to run.
- 30 chapter list + coverage map (`CHAPTERS.md`), script format (`STORYBOARD_FORMAT.md`), validator
  (`scripts/validate-chapters.mjs`), reference chapter (`chapters/03-jobs.mjs`).

## Pipeline (each stage is a script in this folder, all re-runnable, cached, nothing big in git)
1. **Scripts** `chapters/NN-id.mjs` (English narration + actions). Validate with `node scripts/validate-chapters.mjs`.
2. **Translations** `translations/<lang>.json`, key `<chapter>.<scene>.<sentence>` -> text. 10 languages = the 10 UI languages
   of the app (`utils/translations.ts`): English, Spanish, French, German, Italian, Portuguese, Chinese, Japanese, Korean,
   Russian. Control names stay in English in quotes (the video always shows the English interface). Sonnet helpers translate
   chapter by chapter into natural contractor wording; native-speaker review is recommended before wave 2 goes public.
3. **Voice** `tts/narrate.mjs` (to write): one AI33 job per scene per language (`with_transcript=true` returns an SRT with
   sentence times), cached by hash(text+voice+speed) under `cache/audio/`, then loudness-normalised with ffmpeg
   (`loudnorm=I=-16`). English voice: "Mark - The Podcaster" `elevenlabs_TZCbdntnleSl53jkcRsm` (Framitor measured it best for
   calm instructional reading: 0% word errors, 153 wpm; product default `elevenlabs_2O58da3udJ2JloNG1uP1` was second).
   Other languages: ElevenLabs voices are multilingual, so the same voice id is tried first and judged by a short audition
   (one paragraph per language, cheap), then a native voice per language if the accent is poor.
4. **Recording** `record/chapter.mjs` (to write): reads a chapter, runs each app scene against the fake backend (cursor, clicks,
   typing, scroll, highlight rings, camera zoom, lower-third captions) and records it; motion scenes are small HTML/CSS/SVG
   animations (`motion/<template>.html`, shared design) captured the same way. Phone scenes use a 390x844 viewport.
   Every action that cannot be performed is reported (so the script or the demo data is fixed), never silently skipped.
5. **Timing** Scene length = longest spoken length among the languages that get audio (+0.6 s), so ONE video serves all
   languages: shorter languages simply end earlier in the scene. Action `with: n` starts when sentence n starts in the
   ENGLISH audio (from the AI33 SRT). Other languages may drift a little inside a scene; scenes are kept short for that reason.
6. **Assembly** `build/assemble.mjs` (to write): per chapter a video-only MP4 (H.264, no audio), per language an audio file
   (AAC/Opus mono 32-48 kbps, scenes placed at their start times), per language a WebVTT file with the chapter's cues, and a
   `manifest.json` (chapters, start seconds, durations, titles in every language, file names, byte sizes).
7. **Publish** media goes to the host chosen by the owner (below); the app only holds `manifest.json`-driven code. Nothing
   bigger than a few hundred KB is committed to git (`.git` is 25 MB today; the media would be ~300 MB).
8. **Player** inside the app (below).

## Languages and voice
- Subtitles: all 10 languages for every chapter (WebVTT, never burned in; the default track follows the app language).
- Spoken audio: per language, chosen by the owner. English first, Spanish second; the rest can follow in a later wave
  (cost is small: AI33 ~ $5 per 1M credits ~ $0.02 per spoken minute, i.e. ~$2 per language for ~90 minutes, plus time).
- The interface in the video is English for every language (re-recording the whole app in 10 languages is not worth it).

## Hosting (owner decision)
Recommended: a PUBLIC Supabase Storage bucket `tutorial-media` (read-only for everyone, same project, no extra service).
- Size estimate (90 min): video ~100-150 MB (30 chapter files of 3-6 MB, under the 50 MB per-file limit), audio ~14 MB per
  language (10 languages ~140 MB), subtitles < 1 MB. Total ~250-300 MB (Free plan storage is 1 GB).
- Needs the owner's OK to create the bucket (storage change) and a one-time upload (done from the owner's dashboard session like
  the other deploys, or by the owner).
- The CSP (`vercel.json`) already allows `media-src https:` and `connect-src https://*.supabase.co`: NO header change needed.
Alternatives: (a) YouTube unlisted embed (`frame-src` already allows youtube-nocookie): easiest, but no per-language audio tracks
and the chapter UI is limited; (b) Vercel `public/` or git: NOT recommended (repo bloat, deployment size limits).
The player reads the media base URL from one constant, so the host can be changed without touching anything else.

## Player (in the app)
- Where: top of the Help & tutorials page (`/tutorials`, `components/help/HelpCenter.tsx`) as "Video course", plus a deep link
  `/tutorials?video=<chapter-id>&t=<seconds>`; each in-app "How it works" guide gets a "Watch this chapter" link. A public
  share page (marketing route, prerendered, in the sitemap) can be added if the owner wants to share it outside the app;
  `scripts/seo-check.mjs` must keep passing.
- Features: chapter list with titles + durations + "Next section"/"Previous", progress bar with chapter ticks, play/pause,
  speed (0.75-2x), captions on by default in the app language, subtitle-language picker (10), audio-language picker (only the
  languages that have audio), remembers the last chapter + position (localStorage), keyboard (space, arrows, C for captions,
  N for next), fullscreen, works on a phone (chapter list under the video), accessible (labels, focus order, transcript
  panel with click-to-seek).
- Implementation: native `<video muted>` + a separate `<audio>` for the chosen language kept in sync (re-seek when drift
  > 0.25 s; pauses together when buffering), `<track>` elements or a small VTT parser for captions. If a language has no audio
  the video plays silent with captions. Lazy-loaded chunk so the app bundle does not grow for people who never open it.
- Never mentions Kelviq / "merchant of record" (check the subtitles with `scripts/validate-chapters.mjs` + a grep on translations).

## Waves (so something useful ships early and usage stays low)
- Wave 0 (this session): plan, scripts, spike, AI33 client. DONE when the helpers finish the scripts.
- Wave 1: translations for ES (and subtitles for the rest), voice for chapters 01-11 in the chosen languages, recording of
  01-11, the player + manifest, publish + deploy (`ai-assistant` only if help guides change). ~34 min of video.
- Wave 2: chapters 12-22. Wave 3: chapters 23-30. Each wave: record -> check -> publish media -> manifest update. The player
  already handles missing chapters ("coming soon").

## Cost and pacing
Account usage on 2026-11-15: 5-hour 13%, weekly 49% (the standing rule says stop at 50% weekly; the owner explicitly asked
for this video, so work continues but in small steps, checked with `get_usage`). Heavy steps (recording, voice, rendering) run
in the background and cost no tokens while they run. Token-heavy steps: scripts (done by Sonnet helpers), translations
(~9 languages x 14k words: do per chapter with Sonnet helpers, 2 at a time), debugging app scenes (the main cost: ~30 chapters).

## Status after the first session (2026-11-15)
- DONE: 30 English chapter scripts (223 scenes, 13,817 words ~ 92 min, validator clean, every help guide covered);
  recorder `record/chapter.mjs` (label-based actions, pacing to narration, highlight rings, captions, VTT, audio mix) and
  `tts/narrate.mjs` (AI33, cached, `--mock` for silent placeholder). Chapter 3 recorded end to end: 220 s, 2.3 MB, 20 of 26
  actions found on the first try (the rest are script fixes: e.g. "Mark as temporary client" only shows for a new client,
  "More actions" label, the job opened after "Create job" is not the new one -> check the fake backend insert).
- NOT done: translations, real voice (needs the key), recordings of the other 29 chapters, motion templates (only
  `motion/month-limit.html`), the in-app player, media hosting, deploy.
- DISK: drive C: has only ~0.9 GB free. The recorder therefore streams frames straight into ffmpeg (no frame files) and keeps
  its output in `%USERPROFILE%\contractordocs-tutorial-work` (override: `TUTORIAL_WORK_DIR`), NEVER inside the repo (Vite's file
  watcher made the dev server ~600x slower when 14,000 frames were written under the project). Finished media is small
  (~0.6 MB per minute of video), but audio for 10 languages and the final assembly need a few GB of free space: free some disk.

## Risks
- Demo backend coverage: screens that call tables/RPCs/edge functions the fake backend does not know show empty states.
  Fix per chapter by seeding the data the script lists in `demoData` (the validator collects them).
- AI scenes: the `ai-assistant` function is faked with canned, realistic answers (never calls any model).
- Offline chapter: recorded with Chrome's offline mode against the real offline queue (works with the fake backend).
- Real storage uploads (photos, plans) are faked: uploads succeed, demo images are served from the harness.
- iOS Safari with two media elements: test on a real phone; fallback = per-language muxed MP4 for the chapters that fail.
- AI33 availability ("busy" 503s are retried with backoff); the account needs credits.

## AI33 (how Framitor calls it, reproduced in `tts/ai33.mjs`)
Base `https://api.ai33.pro`, header `xi-api-key: <key>`. Voices `GET /v3/voices?provider=elevenlabs&page=1&page_size=100`
(providers: elevenlabs, minimax, edge, kokoro, fishaudio, vbee; ids are provider-prefixed). Speak `POST /v3/text-to-speech`
(multipart: text, voice_id, speed 0.5-1.5, with_transcript=true, file_name) -> `task_id`; poll `GET /v1/task/<id>` every 3 s until
done -> `audio_url` + `srt_url`. Credits `GET /v1/credits`. 429/503 = retry with backoff. THE KEY: only from the environment
variable `AI33_API_KEY` or the git-ignored file `docs/work/tutorial-video/.env.local` (one line `AI33_API_KEY=...`), created by
the OWNER. It is never printed, logged, committed or asked for in chat. (Framitor itself keeps its key in its worker `.env` /
encrypted gateway; this session does not read those files.)
