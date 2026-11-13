# ContractorDocs: go-live checklist

Production database: Supabase project **ContractoreAI** (`mrpvmszmedsjgmdyohli`).

## Already done (by Claude, 2026-11-13)
- Database tables, security rules, storage buckets and functions loaded into ContractoreAI (19 tables, all with RLS).
- Supabase Auth URL configuration: Site URL `https://www.contractordocs.app`; redirects `https://www.contractordocs.app/**`,
  `https://contractordocs.app/**`, `http://localhost:3010/**`.
- All 5 server functions deployed (`master-ai-router`, `kelviq-checkout`, `kelviq-webhook` (JWT off), `gmail-auth`, `delete-account`).
- Function settings: `SITE_URL`, `KELVIQ_ENV`, `KELVIQ_PRODUCT_ID`, `GEMINI_MODEL`.
- Kelviq: ContractorDocs product + Premium/Premium + AI plans (live), webhook endpoint
  `https://mrpvmszmedsjgmdyohli.supabase.co/functions/v1/kelviq-webhook` with 14 events.
- Vercel env vars: `VITE_SUPABASE_URL`, `VITE_SITE_URL`, `VITE_KELVIQ_ENV`, `VITE_KELVIQ_PRODUCT_ID`, `VITE_SUPPORT_EMAIL`.
- Search Console: properties added for `contractordocs.app` and `https://www.contractordocs.app/` (verification file is in the site).
- All code committed locally on `my-branch` (commit `d02e3dc`).

## Left for you (Claude is not allowed to copy passwords, API keys or secrets)

### 1. Paste the secret keys into Supabase (5 min)
Open https://supabase.com/dashboard/project/mrpvmszmedsjgmdyohli/functions/secrets and add:

| Name | Where to get the value |
|---|---|
| `KELVIQ_WEBHOOK_SECRET` | The Kelviq tab Claude left open ("Endpoint added", starts with `kq_whsec_`). If you closed it: Kelviq → Settings → Webhooks → endpoint → regenerate secret. |
| `KELVIQ_SERVER_API_KEY` | https://app.kelviq.com/settings/api-keys (Live) → Server API Key |
| `GEMINI_API_KEY` | https://aistudio.google.com/apikey → Create API key (and **delete the old key** that was in `list_models.js`) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google Cloud Console OAuth client (see `docs/work/GMAIL_SETUP.md`); only needed for Gmail sending |
| `TOKEN_ENCRYPTION_KEY` | Any random 32+ character string (e.g. run `openssl rand -base64 32`); keep a copy. Only needed for Gmail. |

### 2. One value in Vercel (1 min)
Vercel → project *youness00-maache-contractore* → Settings → Environment Variables → add
`VITE_SUPABASE_ANON_KEY` = Supabase → Project Settings → API Keys → **anon / publishable** key (Production + Preview).

### 3. Publish the code (2 min)
This computer's GitHub login (`YounessMaache`) can't push to `Youness00Maache/-Youness00Maache-Contractore`. Either:
- run `gh auth login` and sign in as **Youness00Maache**, then tell Claude "push" (Claude pushes, opens the PR and merges it), or
- on GitHub (as Youness00Maache) → repo → Settings → Collaborators → add `YounessMaache` with write access.

Merging into `main` makes Vercel deploy the new site automatically.

### 4. DNS for Search Console (2 min)
Namecheap → `contractordocs.app` → Advanced DNS → add **TXT**, host `@`, value
`google-site-verification=5SlJQTlsq6Y_-ZjwIUyUrL1cN3ggRy8FkwYTJSZIOfU`. After the deploy, tell Claude to verify and submit the sitemap.

### 5. Optional
- Google sign-in: Supabase → Authentication → Sign In / Providers → Google (client id + secret).
- Custom SMTP sender for auth emails (Supabase → Authentication → Emails), the built-in one is rate-limited.
- Kelviq org name is **Framitor** (shown at checkout): rename in Kelviq → Settings → Organization if you want.

## About the old data
The previous database (`iauteblvljppwzsxloyd`, "supabase-yellow-elephant", created through Vercel's Supabase
integration) no longer exists: its address stopped resolving before this work started, and Vercel shows no databases.
No notice email was found. Its users, clients and documents can only come back if Supabase support can restore it:
email support@supabase.com with the project ref `iauteblvljppwzsxloyd` and ask whether a backup exists. If they send a
backup, Claude can import it: the migrations already include an importer for the old schema.
