import React from 'react';
import { Link } from 'react-router-dom';
import { LegalDocument, type LegalSection } from '../pages/components/LegalDocument.tsx';
import { SITE } from '../content/site.ts';

interface Props {
  /** Legacy: when rendered standalone by the app, shows a back bar. */
  onBack?: () => void;
}

const Email = () => <a href={`mailto:${SITE.email}`}>{SITE.email}</a>;

export const SECURITY_SECTIONS: LegalSection[] = [
  {
    id: 'infrastructure',
    title: 'Infrastructure',
    body: (
      <>
        <p>
          ContractorDocs runs on established cloud providers. The app is served by Vercel over HTTPS. Your data lives in a managed PostgreSQL
          database, authentication service and file storage provided by Supabase, which encrypts stored data at rest and keeps backups.
        </p>
        <p>Payments are processed by our payment provider, so card details are entered on its secure checkout and never touch our servers.</p>
      </>
    ),
  },
  {
    id: 'encryption',
    title: 'Encryption',
    body: (
      <ul>
        <li><strong>In transit:</strong> all traffic to the app and our APIs uses TLS (HTTPS). We send HTTP Strict Transport Security so browsers always use HTTPS.</li>
        <li><strong>At rest:</strong> the database and file storage are encrypted at rest by our infrastructure provider.</li>
        <li><strong>Gmail tokens:</strong> access and refresh tokens for connected Gmail accounts are additionally encrypted by our server code before they are stored, and the database tables that hold them can’t be read from the browser at all.</li>
      </ul>
    ),
  },
  {
    id: 'access-control',
    title: 'Access control and data isolation',
    body: (
      <>
        <ul>
          <li>Every table that holds your data uses row-level security, so a signed-in user can only read and change their own rows.</li>
          <li>Subscription and usage fields can only be changed by our server after a verified payment event, never from the browser.</li>
          <li>Server functions check the caller’s session before doing anything on their behalf, and payment webhooks are verified by signature.</li>
          <li>Passwords are handled by our authentication provider and stored only as secure hashes. You can also sign in with Google.</li>
        </ul>
        <p>
          <strong>Client links.</strong> Client-portal and approval links contain long random tokens. Anyone with a link can see the documents it
          shows, so share links only with the right people. Portal links show client-facing documents only, never internal ones such as
          expense logs or purchase orders, and you can regenerate a link to invalidate the old one.
        </p>
        <p>
          <strong>Uploaded images.</strong> Images that appear on documents or in the forum (for example your logo or job photos) are stored
          under hard-to-guess URLs that can be opened without signing in, so they display in PDFs, emails and the client portal. Avoid
          uploading images that contain sensitive personal information.
        </p>
      </>
    ),
  },
  {
    id: 'google',
    title: 'Google and Gmail permissions',
    body: (
      <p>
        When you connect Gmail we ask only for permission to send email on your behalf and to know which address you connected
        (<code>gmail.send</code>, <code>openid</code>, <code>email</code>). We cannot read, search or delete your email. Emails are sent by our server
        only when you send them in the app. You can disconnect at any time. See the{' '}
        <Link to="/privacy">Privacy Policy</Link> for our Google API Services User Data Policy and Limited Use commitments.
      </p>
    ),
  },
  {
    id: 'application',
    title: 'Application security',
    body: (
      <ul>
        <li>A strict Content Security Policy and other security headers (X-Content-Type-Options, Referrer-Policy, Permissions-Policy, frame protections) limit what can run on our pages.</li>
        <li>Values placed into document templates and emails are escaped or sanitized to prevent script injection.</li>
        <li>App code is bundled at build time. The only external code is the optional receipt-scanning (OCR) engine, a pinned open-source version loaded from a public CDN only when you scan a receipt.</li>
        <li>Secrets such as API keys live in server-side environment variables, never in the browser.</li>
      </ul>
    ),
  },
  {
    id: 'ai',
    title: 'AI requests',
    body: (
      <p>
        AI requests go through our server, which checks your session and plan before calling Google’s Gemini API, so our AI key is never
        exposed. Only the context needed for your request is sent. Read more in the <Link to="/privacy">Privacy Policy</Link>.
      </p>
    ),
  },
  {
    id: 'your-part',
    title: 'What you can do',
    body: (
      <ul>
        <li>Use a strong, unique password, or sign in with Google and enable 2-step verification on your Google account.</li>
        <li>Sign out on shared devices.</li>
        <li>Share portal links only with the intended client, and regenerate a link if it was sent to the wrong person.</li>
        <li>Export important documents as PDFs and keep your own records.</li>
      </ul>
    ),
  },
  {
    id: 'reporting',
    title: 'Reporting a vulnerability',
    body: (
      <p>
        If you believe you’ve found a security issue, please email <Email /> with the subject “Security report” and enough detail to reproduce it.
        Please give us a reasonable chance to fix the issue before sharing it publicly, and don’t access or change other users’ data while testing.
        We appreciate responsible disclosure.
      </p>
    ),
  },
];

const Security: React.FC<Props> = ({ onBack }) => (
  <LegalDocument
    title="Security"
    updated={SITE.legalUpdated}
    intro={<p>How we protect your account, your documents and your clients’ information, and what you can do to help.</p>}
    sections={SECURITY_SECTIONS}
    onBack={onBack}
  />
);

export default Security;
