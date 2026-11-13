# ContractorDocs: go-live checklist

Production database: the ORIGINAL Supabase project **supabase-yellow-elephant** (`iauteblvljppwzsxloyd`), in the
Vercel-managed Supabase organization "Maach's projects". It holds all real data (13 users, 14 clients, 9 jobs,
53 documents, 34 files). ContractoreAI (`mrpvmszmedsjgmdyohli`) is NOT used.

## Already done
- Dry run of the full upgrade on the real data passed (every row imported) and was rolled back: nothing changed yet.
- Original project: new functions `kelviq-checkout`, `kelviq-webhook` (JWT verification off) and `delete-account`
  deployed; settings `SITE_URL`, `KELVIQ_ENV`, `KELVIQ_PRODUCT_ID`, `GEMINI_MODEL` added. Existing secrets
  `GEMINI_API_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` are reused as they are.
- Original project Auth: Site URL `https://www.contractordocs.app`; redirect URLs kept and added
  `https://www.contractordocs.app/**`, `https://contractordocs.app/**`, `http://localhost:3010/**`.
- Kelviq: product + plans live; webhook endpoint now
  `https://iauteblvljppwzsxloyd.supabase.co/functions/v1/kelviq-webhook` (14 events).
- Vercel env: `VITE_SUPABASE_URL` = original project, `VITE_SITE_URL`, `VITE_KELVIQ_ENV`, `VITE_KELVIQ_PRODUCT_ID`,
  `VITE_SUPPORT_EMAIL`. The app also defaults to the original project + its public anon key.
- Code committed on `my-branch` (commits d02e3dc, 806faae, 3398b2f).

## Left for you
1. **GitHub push access**: this computer is logged in as `YounessMaache` (read-only on the repo). Either run
   `gh auth login` as **Youness00Maache**, or add `YounessMaache` as a collaborator with write access.
2. **Kelviq secrets** on the original project (Supabase → Edge Functions → Secrets):
   `KELVIQ_WEBHOOK_SECRET` (the endpoint's `kq_whsec_…` secret; regenerate it in Kelviq if it's lost) and
   `KELVIQ_SERVER_API_KEY` (Kelviq → Settings → API keys, Live). Until then checkout still works through the static
   Kelviq link, but plan upgrades aren't applied automatically.
3. **Rotate the old Gemini key** that was in `list_models.js` if it's the same key as `GEMINI_API_KEY`.
4. **Namecheap TXT** for Search Console: host `@`, value
   `google-site-verification=5SlJQTlsq6Y_-ZjwIUyUrL1cN3ggRy8FkwYTJSZIOfU`.

## Switchover (done together, once push works)
1. Run the upgrade SQL on the original database (old tables are moved intact into `legacy_backup`, data copied into
   the new tables).
2. Done: the new site uses new functions `ai-assistant` and `gmail` (deployed 2026-11-13). The old `master-ai-router`,
   `gmail-auth` and `paypal-webhook` are left untouched for the old site; remove them only after the new site is live.
3. Push `my-branch`, merge into `main` → Vercel deploys the new site.
4. Verify the live site, then verify Search Console and submit the sitemap.

Users sign in again once after the switch (new session storage). Gmail accounts need reconnecting once.

## Cleanup (ask first)
ContractoreAI got the new schema by mistake and isn't needed; Textlinker was paused only to free a slot for it.
Both are under the other Supabase login (younessmaach77's org).
