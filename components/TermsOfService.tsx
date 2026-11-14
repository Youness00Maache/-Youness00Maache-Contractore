import React from 'react';
import { Link } from 'react-router-dom';
import { LegalDocument, type LegalSection } from '../pages/components/LegalDocument.tsx';
import { SITE } from '../content/site.ts';
import { FREE_LIMITS } from '../lib/plans.ts';

interface Props {
  /** Legacy: when rendered standalone by the app, shows a back bar. */
  onBack?: () => void;
}

const Email = () => <a href={`mailto:${SITE.email}`}>{SITE.email}</a>;

export const TERMS_SECTIONS: LegalSection[] = [
  {
    id: 'agreement',
    title: 'Agreement',
    body: (
      <p>
        These Terms of Service (“Terms”) govern your use of ContractorDocs, including the website and web application (the “Service”).
        By creating an account or using the Service you agree to these Terms and to our <Link to="/privacy">Privacy Policy</Link>. If you use
        the Service for a business, you accept these Terms on behalf of that business.
      </p>
    ),
  },
  {
    id: 'the-service',
    title: 'The Service',
    body: (
      <p>
        ContractorDocs lets you create, store, send and share business documents such as invoices, estimates, work orders, change orders
        and reports; collect approvals and signatures from your clients; send email through a Gmail account you connect; and use an
        optional AI assistant. We may improve, change or discontinue features over time; if we remove a major paid feature we will give you
        reasonable notice.
      </p>
    ),
  },
  {
    id: 'accounts',
    title: 'Your account',
    body: (
      <ul>
        <li>You must be at least 18 years old and able to form a binding contract.</li>
        <li>Give accurate information and keep your login details secure. You are responsible for activity under your account.</li>
        <li>Tell us right away at <Email /> if you suspect unauthorized access.</li>
      </ul>
    ),
  },
  {
    id: 'plans-billing',
    title: 'Plans, billing and cancellation',
    body: (
      <>
        <p>
          <strong>Free plan.</strong> The Free plan is free of charge and includes monthly usage limits (currently {FREE_LIMITS.jobs} new jobs per month,
          {' '}{FREE_LIMITS.clients} new clients per month, {FREE_LIMITS.docs} documents per job per month, {FREE_LIMITS.emails} emails per month and {FREE_LIMITS.ai} AI
          requests per month). Limits are shown on the <Link to="/pricing">pricing page</Link> and may change with notice.
        </p>
        <p>
          <strong>Paid plans.</strong> Premium and Premium + AI are subscriptions billed monthly or yearly in advance. Prices are listed on the
          pricing page in US dollars; taxes may be added at checkout.
        </p>
        <p>
          <strong>Payments.</strong> Purchases are processed by our payment provider, which handles payment, applicable sales tax or VAT,
          invoices and receipts, and whose own terms apply to the payment transaction.
        </p>
        <p>
          <strong>Renewal and cancellation.</strong> Subscriptions renew automatically at the end of each billing period until cancelled. You can
          cancel at any time from Settings; cancellation takes effect at the end of the current period, you keep paid features until then, and
          your account then moves to the Free plan. Your documents are not deleted when you downgrade.
        </p>
        <p>
          <strong>Price changes and our price promise.</strong> If we raise prices, existing subscribers keep the price they pay at the time of the
          change for 12 months from the change, as long as the subscription stays active. We will tell you by email before any change takes
          effect; after the 12 months, the new price applies from your next billing period.
        </p>
        <p>
          <strong>Refunds.</strong> Except where required by law, payments are non-refundable and we don’t provide credits for partial periods. If
          you believe you were charged in error, contact <Email /> and we will review it with you; approved refunds are issued to your original payment method.
        </p>
      </>
    ),
  },
  {
    id: 'acceptable-use',
    title: 'Acceptable use',
    body: (
      <>
        <p>You agree not to:</p>
        <ul>
          <li>use the Service for anything illegal, fraudulent or deceptive, including fake invoices or documents meant to mislead;</li>
          <li>send spam or unsolicited bulk email through a connected Gmail account;</li>
          <li>upload content you don’t have the right to use, or content that is harmful, abusive or infringes others’ rights;</li>
          <li>try to access other users’ data, probe or break our security, or overload or disrupt the Service;</li>
          <li>resell, copy or reverse engineer the Service, or use automated means to access it except through features we provide.</li>
        </ul>
        <p>Forum content must be respectful and on topic. We may remove content or suspend accounts that break these rules.</p>
      </>
    ),
  },
  {
    id: 'your-content',
    title: 'Your content',
    body: (
      <>
        <p>
          You own the content you put into ContractorDocs, including your documents and client information. You give us a limited licence to
          host, store, process, display and transmit it only as needed to provide the Service to you (for example to generate PDFs, send emails
          you request, show documents in the client portal, or run the AI assistant when you use it).
        </p>
        <p>
          You are responsible for your content and for having the right to share your clients’ information with us. When you share a portal or
          approval link, anyone with the link can view the documents it shows.
        </p>
      </>
    ),
  },
  {
    id: 'ai-assistant',
    title: 'AI assistant',
    body: (
      <p>
        The AI assistant generates drafts automatically and can make mistakes, including wrong prices, quantities, dates or wording. Always
        review AI-generated content before you save, send or rely on it. You are responsible for the documents you send.
      </p>
    ),
  },
  {
    id: 'not-advice',
    title: 'Templates are not legal, tax or financial advice',
    body: (
      <p>
        ContractorDocs is not a law firm, accountant or financial adviser. Templates, guides and blog articles are general information.
        Requirements for contracts, invoices, lien waivers, warranties, licensing, taxes and e-signatures vary by location and situation.
        You are responsible for making sure your documents meet the rules that apply to you; consult a qualified professional when in doubt.
      </p>
    ),
  },
  {
    id: 'third-party',
    title: 'Third-party services',
    body: (
      <p>
        Some features depend on third-party services such as Google (Sign-In, Gmail and Gemini) and our payment provider. Your use of those services is also
        subject to their terms. We are not responsible for third-party services, and features that rely on them may change if those services
        change.
      </p>
    ),
  },
  {
    id: 'termination',
    title: 'Suspension and termination',
    body: (
      <p>
        You can stop using the Service and delete your account at any time. We may suspend or close accounts that break these Terms, create
        risk or legal exposure for us or others, or remain unpaid. Where reasonable, we will give notice and a chance to export your documents
        first.
      </p>
    ),
  },
  {
    id: 'disclaimers',
    title: 'Disclaimers',
    body: (
      <p>
        The Service is provided “as is” and “as available”. To the extent permitted by law, we disclaim all warranties, express or implied,
        including merchantability, fitness for a particular purpose and non-infringement. We do not guarantee that the Service will be
        uninterrupted or error-free, or that documents will be accepted by any client, court or authority. Keep your own copies of important
        documents.
      </p>
    ),
  },
  {
    id: 'liability',
    title: 'Limitation of liability',
    body: (
      <p>
        To the extent permitted by law, ContractorDocs will not be liable for indirect, incidental, special, consequential or punitive damages,
        or for lost profits, revenue, data or goodwill. Our total liability for any claim relating to the Service is limited to the amount you
        paid us in the 12 months before the claim, or US $50 if you have not paid anything. Some jurisdictions don’t allow these limits, so they
        may not apply to you.
      </p>
    ),
  },
  {
    id: 'indemnity',
    title: 'Indemnity',
    body: (
      <p>
        You agree to defend and indemnify ContractorDocs against claims arising from your content, your documents and dealings with your
        clients, or your breach of these Terms, to the extent permitted by law.
      </p>
    ),
  },
  {
    id: 'changes',
    title: 'Changes to these Terms',
    body: (
      <p>
        We may update these Terms from time to time. We will change the “Last updated” date and, for material changes, notify you by email or in
        the app before they take effect. If you keep using the Service after changes take effect, you accept the updated Terms.
      </p>
    ),
  },
  {
    id: 'contact',
    title: 'Contact',
    body: <p>Questions about these Terms: <Email />.</p>,
  },
];

const TermsOfService: React.FC<Props> = ({ onBack }) => (
  <LegalDocument
    title="Terms of Service"
    updated={SITE.legalUpdated}
    intro={<p>The rules for using ContractorDocs, written to be readable. Please read them before you sign up.</p>}
    sections={TERMS_SECTIONS}
    onBack={onBack}
  />
);

export default TermsOfService;
