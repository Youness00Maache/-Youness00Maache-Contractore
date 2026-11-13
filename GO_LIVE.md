# ContractorDocs: go-live checklist (owner actions)

Everything in the code is done and tested locally. The steps below need **you**, because they involve your passwords,
secret keys, or approving a deploy. Do them in this order. Each step says how long it takes.

Your production database is the Supabase project **ContractoreAI** (`mrpvmszmedsjgmdyohli`), already resumed.

---

## 1. Security first (2 min)
- **Rotate the Gemini API key** that was stored in plain text in the old `list_models.js` (now deleted):
  Google AI Studio → API keys → delete the old key → create a new one. Keep the new key for step 4.

## 2. Database tables (1 min of your time)
- Sign in again at https://supabase.com/dashboard in Chrome (your session expired), then tell Claude
  "signed in". Claude loads the tested database (`supabase/migrations/*`) into ContractoreAI for you.
  *(Alternative: run `npx supabase link --project-ref mrpvmszmedsjgmdyohli` and `npx supabase db push` yourself.)*

## 3. Supabase CLI login (1 min)
In a terminal in this project folder:
```bash
npx supabase login
```
```bash
npx supabase link --project-ref mrpvmszmedsjgmdyohli
```
(`link` may ask for the database password: Supabase Dashboard → Project Settings → Database → Reset password if you don't know it.)

## 4. Secrets for the server functions (5 min)
Get these values first:
- **Kelviq server API key**: https://app.kelviq.com/settings/api-keys (Live mode) → *Server API Key*.
- **Kelviq webhook secret**: https://app.kelviq.com/settings/webhooks/new → URL
  `https://mrpvmszmedsjgmdyohli.supabase.co/functions/v1/kelviq-webhook`, events: `checkout.completed`,
  `subscription.created`, `subscription.updated`, `subscription.plan_changed`, `subscription.cancelled`,
  `subscription.paused`, `subscription.resumed`, `invoice.paid`, `invoice.payment_failed`, `order.refunded`
  → save → copy the signing secret (`kq_whsec_…`).
- **Gemini API key**: the new one from step 1.
- **Google OAuth client id + secret** (for "Sign in with Google" and Gmail sending): see `docs/work/GMAIL_SETUP.md`.

Then run (replace the `<...>` parts):
```bash
npx supabase secrets set SITE_URL=https://www.contractordocs.app KELVIQ_ENV=live KELVIQ_PRODUCT_ID=45575a06-3bbc-4fe3-9151-ebfc34d19332 GEMINI_MODEL=gemini-flash-latest KELVIQ_SERVER_API_KEY=<kelviq-server-key> KELVIQ_WEBHOOK_SECRET=<kq_whsec_...> GEMINI_API_KEY=<gemini-key> GOOGLE_CLIENT_ID=<google-client-id> GOOGLE_CLIENT_SECRET=<google-client-secret> TOKEN_ENCRYPTION_KEY=<output of: openssl rand -base64 32>
```
Keep a copy of `TOKEN_ENCRYPTION_KEY` somewhere safe (if it's lost, everyone has to reconnect Gmail).

## 5. Deploy the server functions (2 min)
```bash
npx supabase functions deploy
```
(Deploys `master-ai-router`, `kelviq-checkout`, `kelviq-webhook`, `gmail-auth`, `delete-account` with the
settings in `supabase/config.toml`.) Then in Kelviq → Webhooks → your endpoint → **Send test event** → it should show 200.

## 6. Supabase Auth settings (3 min)
Supabase Dashboard → Authentication:
- **URL Configuration** → Site URL `https://www.contractordocs.app`; Redirect URLs:
  `https://www.contractordocs.app/**`, `https://contractordocs.app/**`.
- **Sign In / Providers → Google**: enable, paste the Google client id + secret.
- **Emails → SMTP**: set a custom sender (the built-in one is limited to a few emails per hour).

## 7. Vercel environment variables (3 min)
Vercel → project **youness00-maache-contractore** → Settings → Environment Variables (Production):
| Name | Value |
|---|---|
| `VITE_SUPABASE_URL` | `https://mrpvmszmedsjgmdyohli.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Supabase Dashboard → Project Settings → API → *anon / publishable* key |
| `VITE_SITE_URL` | `https://www.contractordocs.app` |
| `VITE_KELVIQ_ENV` | `live` |
| `VITE_KELVIQ_PRODUCT_ID` | `45575a06-3bbc-4fe3-9151-ebfc34d19332` |
| `VITE_SUPPORT_EMAIL` | your support address |

## 8. Publish the new site (tell Claude "deploy")
Vercel deploys from GitHub `main`. Claude can commit this work, push it, and open a pull request into `main` when you say so.

## 9. After the first deploy (Claude can do these with you)
- Search Console: verify `https://www.contractordocs.app/` (file `google58a3bf2c7e0ed45b.html` is already in the site)
  and submit `https://www.contractordocs.app/sitemap.xml`.
- Namecheap → `contractordocs.app` → Advanced DNS → add a **TXT** record, host `@`, value
  `google-site-verification=5SlJQTlsq6Y_-ZjwIUyUrL1cN3ggRy8FkwYTJSZIOfU` (verifies the whole domain in Search Console).
- Google Cloud: publish the OAuth consent screen ("In production") and request verification for `gmail.send`
  (`docs/work/GMAIL_SETUP.md`).
- Kelviq branding: your Kelviq organization is named **Framitor**, so checkout and receipts show that name. Rename it in
  Kelviq → Settings → Organization (or ask Kelviq support for a second organization) if you want "ContractorDocs" there.
- Textlinker is paused (free plan allows 2 active Supabase projects). Upgrading Supabase to Pro lets you run both.
