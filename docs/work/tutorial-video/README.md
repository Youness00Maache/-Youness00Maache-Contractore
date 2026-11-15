# Tutorial video tooling

Plan: `PLAN.md`. Chapters: `CHAPTERS.md`. Script format: `STORYBOARD_FORMAT.md`. Nothing here is part of the app build.

## One-time
```bash
cd docs/work/tutorial-video
npm install            # playwright-core only; uses the Chrome that is already installed
```

## Run the recording stack (three background processes)
```bash
# 1. fake demo backend (in-memory, demo data only)
node docs/work/tutorial-video/fake-backend/server.mjs 54329
# 2. the real app, pointed at it (port 3012; the normal dev server on 3010 is untouched)
VITE_SUPABASE_URL=http://127.0.0.1:54329 VITE_SUPABASE_ANON_KEY=demo-anon-key npx vite --port 3012 --strictPort --host localhost
# 3. a 10-second test recording -> out/spike.mp4
cd docs/work/tutorial-video && node record/spike.mjs
```
`GET http://127.0.0.1:54329/__reset` restores the seed data; `/__tables` lists row counts. Set `FAKE_BACKEND_LOG=1` to log writes.

## Check the scripts
```bash
cd docs/work/tutorial-video && node scripts/validate-chapters.mjs
```

## Voice (needs YOUR AI33 key; the assistant never sees it)
Put the key where only you can see it, either as a user environment variable `AI33_API_KEY`, or as one line
`AI33_API_KEY=...` in `docs/work/tutorial-video/.env.local` (git-ignored). Then:
```bash
cd docs/work/tutorial-video && node -e "import('./tts/ai33.mjs').then(async m=>console.log(await m.credits()))"
```
prints your credit balance (not the key). Framitor's own key lives in its worker `.env` file; copy that one line yourself.

Files: `fake-backend/` (server + demo data), `record/` (Chrome driver + screencast + encoder, spike), `tts/ai33.mjs` (AI33 client),
`chapters/` (scripts), `scripts/` (validator), Big output (audio, videos) goes to `%USERPROFILE%/contractordocs-tutorial-work` (override with `TUTORIAL_WORK_DIR`, see `config.mjs`): never inside the repo.

## Record one chapter (stack above must be running)
```bash
cd docs/work/tutorial-video
node tts/narrate.mjs en --chapters 03 --mock     # placeholder timing (no AI33 call); drop --mock for the real voice
curl http://127.0.0.1:54329/__reset              # fresh demo data
node record/chapter.mjs 03                       # -> <work dir>/out/chapters/03-jobs/{video.mp4,en.m4a,en.vtt,preview.mp4,chapter.json}
```
`chapter.json` lists every action that could not be performed (and `fail-*.jpg` shows the screen at that moment).
