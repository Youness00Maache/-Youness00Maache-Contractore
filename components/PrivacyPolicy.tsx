import React from 'react';
import { Link } from 'react-router-dom';
import { LegalDocument, type LegalSection } from '../pages/components/LegalDocument.tsx';
import { SITE } from '../content/site.ts';

interface Props {
  /** Legacy: when rendered standalone by the app, shows a back bar. */
  onBack?: () => void;
}

const Email = () => <a href={`mailto:${SITE.email}`}>{SITE.email}</a>;

export const PRIVACY_SECTIONS: LegalSection[] = [
  {
    id: 'who-we-are',
    title: 'Who we are',
    body: (
      <>
        <p>
          ContractorDocs (“ContractorDocs”, “we”, “us”) provides a web application at {SITE.url.replace('https://', '')} that helps contractors create,
          send and manage business documents. This policy explains what personal information we collect, how we use it, who we share it
          with and the choices you have. It applies to our website and the ContractorDocs app.
        </p>
        <p>Questions or requests about privacy: <Email />.</p>
      </>
    ),
  },
  {
    id: 'information-we-collect',
    title: 'Information we collect',
    body: (
      <>
        <p><strong>Account information.</strong> Your email address, name and password (stored only as a secure hash by our authentication provider) or, if you sign in with Google, your name, email address and profile picture from your Google account.</p>
        <p><strong>Business profile.</strong> Details you add for your documents, such as company name, address, phone number, website, license number, logo and signature.</p>
        <p><strong>Content you create.</strong> Jobs, clients and their contact details, documents (invoices, estimates, reports and the rest), line items, prices, notes, photos, receipts, inventory and price-book items, calendar entries and email templates. You decide what you enter. When you add information about your own clients, you are responsible for having the right to share it with us.</p>
        <p><strong>Client portal activity.</strong> When your client approves, declines or signs a document through a portal or approval link, we store the signature image, the signer’s name, the decision and the time, together with the document.</p>
        <p><strong>Community forum.</strong> Posts, comments, votes and images you publish in the forum, along with your display name and profile picture.</p>
        <p><strong>Billing information.</strong> Payments are handled by our payment provider. We receive your plan, billing period, subscription status and a customer reference. We do not receive or store your full card number.</p>
        <p><strong>Usage and technical data.</strong> Counts we need to apply plan limits (for example jobs created, emails sent and AI requests per month), and standard technical logs from our hosting and database providers, such as IP address, browser type, and request times, used for security and troubleshooting.</p>
        <p><strong>Communications.</strong> Messages you send us, for example support emails.</p>
        <p>We do not use advertising cookies or third-party ad trackers. The app uses your browser’s local storage to keep you signed in and remember preferences such as your theme.</p>
      </>
    ),
  },
  {
    id: 'how-we-use',
    title: 'How we use your information',
    body: (
      <>
        <ul>
          <li>To provide the service: store your data, generate documents and PDFs, and show them to you and to the clients you share them with.</li>
          <li>To send emails you ask us to send, from your connected Gmail account.</li>
          <li>To run the AI assistant when you use it (see section 5).</li>
          <li>To manage your subscription and apply plan limits.</li>
          <li>To send service messages, such as sign-up confirmation, password resets and important account or billing notices.</li>
          <li>To keep the service secure, prevent abuse and fix problems.</li>
          <li>To answer your questions and support requests.</li>
          <li>To understand, in aggregate, which features are used so we can improve the product.</li>
        </ul>
        <p>We do not sell your personal information, and we do not use your content for advertising.</p>
      </>
    ),
  },
  {
    id: 'google-user-data',
    title: 'Google user data and the Limited Use policy',
    body: (
      <>
        <p>
          ContractorDocs’ use and transfer to any other app of information received from Google APIs will adhere to the{' '}
          <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer">Google API Services User Data Policy</a>, including the Limited Use requirements.
        </p>
        <p><strong>Google Sign-In.</strong> If you sign in with Google, we receive your name, email address and profile picture to create and identify your account.</p>
        <p><strong>Gmail sending.</strong> If you choose to connect a Gmail account, we request the <code>openid</code>, <code>email</code> and <code className="break-all">https://www.googleapis.com/auth/gmail.send</code> permissions. We use them only to identify which Gmail address you connected and to send the emails you create or approve in ContractorDocs (for example an invoice with its PDF attached), from that address. We cannot read, search, delete or manage the messages in your mailbox.</p>
        <p>Specifically, for data obtained through Google APIs:</p>
        <ul>
          <li>We use it only to provide and improve the user-facing features described above.</li>
          <li>We do not transfer it to others except as needed to provide those features, to comply with applicable law, or as part of a merger or acquisition with your notice.</li>
          <li>We do not use or transfer it for serving advertisements, including retargeting or personalized ads.</li>
          <li>We do not sell it, and we do not use it to determine creditworthiness or for lending purposes.</li>
          <li>We do not allow humans to read it unless you give us permission (for example for support), it is needed for security purposes such as investigating abuse, or it is required by law.</li>
          <li>We do not use it to develop, improve or train generalized artificial intelligence or machine-learning models.</li>
        </ul>
        <p>Gmail access and refresh tokens are encrypted and stored on our servers; they are never shown to other users. You can disconnect Gmail at any time in ContractorDocs, or revoke access from your Google Account’s security settings, and we then delete the stored tokens for that account.</p>
      </>
    ),
  },
  {
    id: 'ai-processing',
    title: 'AI processing',
    body: (
      <>
        <p>
          The AI assistant is optional. When you use it, the request you type or dictate, together with the context needed to answer it
          (for example the job, client name, price-book items or document you are working on), is sent to Google’s Gemini API, which
          generates a draft and returns it to us. Google processes this data as our service provider under its API terms.
        </p>
        <ul>
          <li>AI drafts are suggestions. You review and edit them before anything is saved or sent.</li>
          <li>We do not use your content to train our own AI models.</li>
          <li>Voice dictation is converted to text by your browser’s built-in speech recognition (some browsers use their vendor’s online speech service for this) before the text is sent as a request.</li>
          <li>Data received through Gmail permissions is not sent to the AI assistant.</li>
        </ul>
        <p>If you do not want any of your content processed by an AI provider, simply don’t use the AI assistant; every feature can be used manually.</p>
      </>
    ),
  },
  {
    id: 'sharing',
    title: 'Who we share information with',
    body: (
      <>
        <p>We use a small number of service providers (“sub-processors”) to run ContractorDocs. They may process personal information only on our instructions and for these purposes:</p>
        <div className="not-prose relative my-6 overflow-x-auto rounded-xl border border-border">
          <table className="!my-0 w-full min-w-[480px] text-left text-[15px]">
            <thead className="bg-muted/70"><tr><th className="px-4 py-3">Provider</th><th className="px-4 py-3">Purpose</th></tr></thead>
            <tbody>
              <tr><td className="px-4 py-3 font-semibold">Supabase</td><td className="px-4 py-3">Database, authentication, file storage and server functions</td></tr>
              <tr><td className="px-4 py-3 font-semibold">Vercel</td><td className="px-4 py-3">Website and app hosting</td></tr>
              <tr><td className="px-4 py-3 font-semibold">Google</td><td className="px-4 py-3">Google Sign-In, Gmail sending (Gmail API) and the AI assistant (Gemini API)</td></tr>
              <tr><td className="px-4 py-3 font-semibold">Payment provider</td><td className="px-4 py-3">Checkout, payment processing, tax and receipts</td></tr>
            </tbody>
          </table>
        </div>
        <p><strong>People you share with.</strong> When you email a document or share a client-portal or approval link, the recipient and anyone they forward the link to can see that document. Portal links only show documents that are meant for clients.</p>
        <p><strong>Forum.</strong> Forum posts and comments, with your display name and profile picture, are visible to other signed-in ContractorDocs users.</p>
        <p><strong>Legal reasons.</strong> We may disclose information if required by law, to enforce our Terms, or to protect the rights, property or safety of our users or others.</p>
        <p><strong>Business transfers.</strong> If ContractorDocs is involved in a merger, acquisition or sale of assets, information may be transferred as part of that transaction; we will notify you before your information becomes subject to a different privacy policy.</p>
      </>
    ),
  },
  {
    id: 'retention-deletion',
    title: 'Data retention and deletion',
    body: (
      <>
        <p>We keep your information for as long as your account is open. You can edit or delete individual jobs, clients and documents at any time.</p>
        <p>
          <strong>Deleting your account.</strong> You can delete your account from Settings → Account. This cancels any active subscription
          and permanently deletes your account, your content and the files you uploaded. If you can’t access that option, email{' '}
          <Email /> from your account’s email address and we will delete your data within 30 days.
        </p>
        <p>Copies may remain in encrypted backups for a limited period before they are overwritten. Our payment provider keeps its own payment and tax records as required by law, and we may keep limited records where we are legally required to.</p>
      </>
    ),
  },
  {
    id: 'security',
    title: 'Security',
    body: (
      <p>
        We protect your information with encryption in transit, per-account access controls in our database, encrypted storage of
        Gmail tokens and restricted server-side access to sensitive data. No system is perfectly secure, so please use a strong password
        and keep your email account secure. Read more on our <Link to="/security">Security page</Link>.
      </p>
    ),
  },
  {
    id: 'your-rights',
    title: 'Your rights and choices',
    body: (
      <>
        <p>Depending on where you live (for example in the EU, UK or certain US states), you may have the right to access, correct, delete or export your personal information, to object to or restrict some processing, and to withdraw consent. You can do most of this yourself in the app. For anything else, email <Email />; we may need to verify your identity before acting on a request.</p>
        <p>You also have the right to complain to your local data-protection authority. We do not sell or “share” personal information for cross-context behavioral advertising.</p>
      </>
    ),
  },
  {
    id: 'international',
    title: 'International transfers',
    body: <p>Our providers may process data in the United States and other countries. Where required, we rely on appropriate safeguards offered by those providers, such as standard contractual clauses.</p>,
  },
  {
    id: 'children',
    title: 'Children',
    body: <p>ContractorDocs is a business tool and is not directed to children. You must be at least 18 years old to create an account. We do not knowingly collect information from children.</p>,
  },
  {
    id: 'changes',
    title: 'Changes to this policy',
    body: <p>We may update this policy as the product changes. We will change the “Last updated” date above and, for significant changes, notify you by email or in the app before they take effect.</p>,
  },
  {
    id: 'contact',
    title: 'Contact us',
    body: <p>Email <Email /> with any question about this policy or your data.</p>,
  },
];

const PrivacyPolicy: React.FC<Props> = ({ onBack }) => (
  <LegalDocument
    title="Privacy Policy"
    updated={SITE.legalUpdated}
    intro={<p>Your business data is yours. This policy explains, in plain language, what we collect, why, and the control you have over it.</p>}
    sections={PRIVACY_SECTIONS}
    onBack={onBack}
  />
);

export default PrivacyPolicy;
