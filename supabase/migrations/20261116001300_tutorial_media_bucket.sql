-- Applied 2026-11-15 with the owner's OK (created in the Supabase dashboard: Storage > New bucket; this file records the
-- same thing so a rebuilt project gets it too). Public, read-only for everyone through the public URL; uploads are done by
-- the owner from the dashboard, so NO insert/update/delete policies are created.
--
-- Holds the video course (see docs/work/tutorial-video/PLAN.md and lib/tutorialVideo.ts):
--   v1/manifest.json, v1/subtitles/<lang>.json, v1/ch/<NN-id>/video.mp4 and <lang>.m4a
-- Nothing private is ever stored here: the video shows made-up demo data only.
insert into storage.buckets (id, name, public, file_size_limit)
values ('tutorial-media', 'tutorial-media', true, 52428800)
on conflict (id) do nothing;
