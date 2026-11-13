# Gmail sending: setup guide (owner actions)

ContractorDocs sends email **from the contractor's own Gmail address**. Everything runs in the
`gmail-auth` Supabase edge function:

- the browser asks the function for a Google sign-in URL (`auth_url`); the URL carries a signed, 10-minute,
  user-bound `state` value (CSRF protection);
- Google redirects to `https://<your-domain>/gmail-callback`; the app sends `code` + `state` to the function
  (`exchange`), which checks the state, exchanges the code, reads the verified Gmail address from the
  `id_token`, and stores the refresh token **AES-256-GCM encrypted** in `gmail_tokens` (service role only);
- every email is built (RFC 5322 / 2047 / 2231, UTF-8 safe, header-injection safe) and sent **server-side**
  (`send`). Access tokens are refreshed on the server. The browser never sees a Google token;
- the free plan's monthly email limit (`FREE_LIMITS.emails` = 10) is enforced in the function using
  `usage_events` (kind `email`);
- revoked or expired grants mark the account `needs_reconnect`; the UI shows a "Reconnect" button;
- "Disconnect" revokes the grant at Google and deletes the stored tokens.

Scopes requested: `openid`, `email`, `https://www.googleapis.com/auth/gmail.send`. The app **cannot read**
the user's mailbox (no `gmail.readonly`, `gmail.modify` or `mail.google.com` scope).

Below, replace `contractordocs.app` with your production domain if it differs.

---

## 1. Google Cloud console

Use the Google Cloud project that owns the OAuth client you will put in `GOOGLE_CLIENT_ID`.
(The old code hard-coded client `292965678575-p8smva2vfeguocsppjr45r05jsvhggjo`. You can keep that client
or create a new one. Using a **separate** client for Supabase "Sign in with Google" is cleaner.)

1. **APIs & Services → Library → Gmail API → Enable.**
   Without it every send fails (the app shows "Gmail sending is not enabled for this app yet").
2. **Google Auth Platform → Branding** (older consoles: "OAuth consent screen"):
   - App name: `ContractorDocs`; user support email; app logo (120×120 PNG, optional but it speeds up review).
   - App home page: `https://contractordocs.app`
   - Privacy policy: `https://contractordocs.app/privacy` (must contain the text in section 3)
   - Terms of service: `https://contractordocs.app/terms`
   - Authorized domains: `contractordocs.app` (add `supabase.co` only if this same client is also used
     for Supabase Google sign-in).
   - Developer contact email.
3. **Google Auth Platform → Audience:** User type **External**. Publishing status: press
   **"Publish app" → In production**.
   - While the app is in **Testing**, only the listed test users can connect, and Google expires their
     refresh tokens after **7 days** (users would see "Reconnect" every week).
4. **Google Auth Platform → Data access → Add or remove scopes:**
   - `openid`
   - `.../auth/userinfo.email` (shown as "See your primary Google Account email address")
   - `https://www.googleapis.com/auth/gmail.send` ("Send email on your behalf"), listed as a **sensitive** scope.
   Add nothing else; every extra scope lengthens verification.
5. **Google Auth Platform → Clients → Create client → Web application** (or edit the existing one):
   - **Authorized redirect URIs** (exact match: scheme, host, port and path, no trailing slash):
     - `https://contractordocs.app/gmail-callback`
     - `https://www.contractordocs.app/gmail-callback` (only if the app is ever served on `www`; better:
       redirect `www` to the apex domain in Vercel)
     - `http://localhost:3010/gmail-callback` (local dev)
     - `http://127.0.0.1:3010/gmail-callback` (local dev)
   - **Authorized JavaScript origins:** not needed for this server-side flow (harmless to add
     `https://contractordocs.app` and `http://localhost:3010`).
   - Copy the **Client ID** and **Client secret** for section 4.
   - Vercel preview URLs change per deployment and are not in the list, so Gmail can't be connected on
     previews. Test Gmail on production or locally.
6. **Verification (required for `gmail.send`).** `gmail.send` is a *sensitive* (not *restricted*) scope, so
   no paid CASA security assessment is needed, but Google must verify the app before the public can use it
   without the "Google hasn't verified this app" warning. Unverified apps with sensitive scopes are also
   capped at **100 users** in total.
   - Verify the domain in **Google Search Console** with the same Google account that owns the Cloud
     project (Branding page: "Verify ownership" for `contractordocs.app`).
   - The home page must describe the app and link to the privacy policy; the privacy policy must be on the
     same domain.
   - Google Auth Platform → **Verification Center → Prepare for verification / Submit**. You will need:
     - **Scope justification:** "ContractorDocs lets contractors email invoices, estimates and other documents
       they created in the app to their own clients from their own Gmail address. We use gmail.send only to
       send a message the user wrote and explicitly sends (or reviews and confirms in a batch). We never read,
       list, modify or delete mail."
     - **Demo video** (unlisted YouTube link, in English): show the browser address bar with the OAuth client
       ID during the Google consent screen, the consent screen listing "Send email on your behalf", then
       composing an email in Communication, attaching an estimate PDF, pressing Send, and the message in the
       Gmail "Sent" folder. Also show Disconnect.
     - Answer follow-up emails from the Google review team quickly; review usually takes a few days to a few weeks.
   - Until verification passes, users can still connect by clicking "Advanced → Go to ContractorDocs (unsafe)".

## 2. What changed for existing users

Gmail accounts linked with the old code are not migrated (their tokens were stored unencrypted, in the wrong
place, and often without the `email` scope). Every user must press **Connect Gmail** once. If Google does not
show the consent screen again and the app reports "Google did not grant offline access", the user removes
ContractorDocs at <https://myaccount.google.com/permissions> and connects again.

## 3. Privacy policy: required wording (MARKETING owns `/privacy`)

Google checks that the policy (a) says what Google user data the app accesses, (b) how it is used, stored,
shared and deleted, and (c) contains the **Limited Use** statement. Add a section like this (adjust the
company name if needed):

> **Google user data (Gmail)**
>
> If you connect a Gmail account, ContractorDocs asks Google for your email address and for permission to
> send email on your behalf (`gmail.send`). We use this access only to send the emails you write or approve in
> ContractorDocs (for example an invoice or estimate to your client) from your own Gmail address. We cannot read,
> search, modify or delete the emails in your mailbox.
>
> We store your Gmail address and an encrypted access credential so we can send email when you ask us to. We do
> not store copies of the emails you send, beyond what Gmail keeps in your own "Sent" folder. We do not sell this
> data, do not use it for advertising, and do not use it to train AI models. No ContractorDocs employee reads
> it, except with your explicit permission for support, when required for security, or to comply with the law.
>
> You can disconnect Gmail at any time in ContractorDocs (Communication → your account → Disconnect), which
> deletes the stored credential and revokes our access. You can also revoke access at
> https://myaccount.google.com/permissions. If you delete your ContractorDocs account, we delete your Gmail
> connection with it.
>
> ContractorDocs' use and transfer to any other app of information received from Google APIs will adhere to the
> [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy),
> including the Limited Use requirements.

The last paragraph must appear essentially verbatim and link to the policy.

## 4. Supabase secrets

Set these for the `gmail-auth` function (Dashboard → Edge Functions → Secrets, or the CLI):

| Secret | Value |
|---|---|
| `GOOGLE_CLIENT_ID` | OAuth client ID from section 1.5 |
| `GOOGLE_CLIENT_SECRET` | OAuth client secret from section 1.5 |
| `SITE_URL` | `https://contractordocs.app` (no trailing slash). Used for the redirect URI and the CORS allow-list. |
| `TOKEN_ENCRYPTION_KEY` | 32 random bytes, base64: `openssl rand -base64 32`. **Back it up** in your password manager. If it is lost or changed, every stored Gmail connection becomes unreadable and users must reconnect. It also signs the OAuth `state`. |
| `FREE_EMAIL_LIMIT` | Optional, default `10`. Keep equal to `FREE_LIMITS.emails` in `lib/plans.ts`. |

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically.

```bash
npx supabase secrets set --project-ref <project-ref> \
  GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... \
  SITE_URL=https://contractordocs.app TOKEN_ENCRYPTION_KEY="$(openssl rand -base64 32)"
npx supabase functions deploy gmail-auth --project-ref <project-ref>   # keep JWT verification ON (default)
```

**Local development:** put the same keys in `supabase/functions/.env` (git-ignored) with
`SITE_URL=http://localhost:3010` and serve functions with
`npx supabase functions serve --env-file supabase/functions/.env`. Google only accepts the localhost redirect
URIs listed in section 1.5.

**Supabase Auth** (unrelated to Gmail sending, but needed for login and password reset): Authentication → URL
configuration → Site URL `https://contractordocs.app`; additional redirect URLs `https://contractordocs.app/**`
and `http://localhost:3010/**`.

## 5. Smoke test after deploying

1. Communication → **Connect Gmail** → Google shows "ContractorDocs" and "Send email on your behalf" → Allow.
2. The callback page says "Gmail connected" and returns to Communication; the account pill shows the address.
   In the database, `gmail_tokens.refresh_token_encrypted` starts with `v1.` and contains no readable token.
3. Send yourself an email with subject `Facture n° 42 — é ✓`, attaching an estimate you have not opened in
   this session. The subject renders correctly and the PDF has its line items and totals.
4. Revoke the app at <https://myaccount.google.com/permissions>, then send again: the app shows "Reconnect" and
   the account row has `status = 'needs_reconnect'`. Reconnect fixes it.
5. On a free account, the 11th email in a month shows the upgrade prompt (HTTP 402 `PLAN_LIMIT`).
6. Disconnect: the account disappears in the app and in <https://myaccount.google.com/permissions>.

## 6. Troubleshooting

| What the user sees / function code | Cause | Fix |
|---|---|---|
| Google page "Error 400: redirect_uri_mismatch" | The callback URL is not in the client's redirect URI list | Add the exact URL from section 1.5 |
| "Gmail is not set up on the server yet" (`NOT_CONFIGURED`) | A secret from section 4 is missing or `TOKEN_ENCRYPTION_KEY` is invalid | Set the secrets and redeploy |
| "Gmail sending is not enabled for this app yet" (`GMAIL_API_DISABLED`) | Gmail API disabled in the Cloud project | Section 1.1 |
| "Please allow Send email on your behalf" (`SCOPE_MISSING`) | The user unticked the Gmail checkbox | Connect again and keep the box ticked |
| "Google did not grant offline access" (`NO_REFRESH_TOKEN`) | Google reused an old grant without a refresh token | Remove the app at myaccount.google.com/permissions, connect again |
| "Reconnect" after about a week (`RECONNECT_REQUIRED`) | App still in **Testing** mode | Publish to production (section 1.3) |
| "This Google sign-in expired…" (`BAD_STATE`) | Callback opened more than 10 minutes later, or by another logged-in user | Start again from Communication |
| "Google access was revoked or expired" (`RECONNECT_REQUIRED`) | User revoked access or changed their Google password | Reconnect |
| "Gmail is limiting how fast this account can send" (`GMAIL_RATE_LIMIT`) | Gmail per-user sending limits (about 500 per day for consumer accounts, 2,000 for Workspace) | Wait and retry |
