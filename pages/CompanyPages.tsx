import React from 'react';
import { Link } from 'react-router-dom';
import { Container, PageHero, ButtonLink, CtaBand, CheckList } from './components/ui.tsx';
import { Mail, CreditCard, ShieldCheck, Lock, Database, Sparkles, Send, Globe, ArrowRight, HelpCircle } from './components/icons.tsx';
import { SITE, SIGNUP_PATH } from '../content/site.ts';

const mailto = (subject: string) => `mailto:${SITE.email}?subject=${encodeURIComponent(subject)}`;

export const AboutPage: React.FC = () => (
  <>
    <PageHero
      eyebrow="About"
      title="Paperwork software for the people who build things"
      subtitle="ContractorDocs exists so contractors can spend their evenings on something other than invoices, estimates and reports."
      breadcrumbs={[{ name: 'Home', to: '/' }, { name: 'About' }]}
    />

    <section className="py-16 sm:py-20">
      <Container className="max-w-3xl">
        <div className="prose-cd">
          <h2>Why we built ContractorDocs</h2>
          <p>
            Running a contracting business means doing two jobs: the work on site, and the paperwork that gets you paid for it.
            Estimates, change orders, daily logs, invoices, receipts and warranties all have to be accurate, look professional and
            reach the client on time. Most of it happens at night, on a phone, after a full day on the tools.
          </p>
          <p>
            Generic invoicing apps are built for shops that sell products, not for jobs that change as they go. Word and spreadsheet
            templates break the moment a formula is off or a file is lost. We built ContractorDocs around the way contracting work
            actually flows: a job, a client, and every document that job needs, from the first estimate to the final warranty.
          </p>
          <h2>What we care about</h2>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {[
            { t: 'Numbers you can trust', d: 'Totals, tax, deposits and progress billing are calculated one way everywhere: on screen, in the PDF, in email and in the client portal.' },
            { t: 'You stay in control', d: 'The AI assistant writes drafts. You review and approve everything before it is saved or sent.' },
            { t: 'Your data is yours', d: 'Your documents belong to you. Export them as PDFs any time, and ask us to delete your account and data whenever you want.' },
            { t: 'Simple, fair pricing', d: 'A useful free plan and two low-cost paid plans. No setup fees, no long contracts, cancel anytime.' },
          ].map((c) => (
            <div key={c.t} className="rounded-2xl border border-border bg-card p-5 shadow-soft">
              <h3 className="font-bold text-foreground">{c.t}</h3>
              <p className="mt-1.5 text-[15px] leading-relaxed text-muted-foreground">{c.d}</p>
            </div>
          ))}
        </div>
        <div className="prose-cd mt-4">
          <h2>How ContractorDocs is built</h2>
          <p>We use established infrastructure providers for the parts that matter most:</p>
        </div>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {[
            { icon: Database, t: 'Supabase', d: 'Managed Postgres database, authentication and file storage.' },
            { icon: Globe, t: 'Vercel', d: 'Hosting and global delivery of the web app over HTTPS.' },
            { icon: Sparkles, t: 'Google Gemini', d: 'Large language model behind the AI assistant’s drafts.' },
            { icon: Send, t: 'Gmail API', d: 'Sends documents from your own Gmail address when you connect it.' },
            { icon: CreditCard, t: 'Secure payments', d: 'Subscriptions are paid through a secure checkout that handles tax and receipts.' },
            { icon: Lock, t: 'Security headers & encryption', d: 'TLS in transit, encrypted Gmail tokens, strict browser security policies.' },
          ].map((p) => (
            <li key={p.t} className="flex gap-3 rounded-2xl border border-border bg-card p-4">
              <span className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-brand-50 text-brand-700"><p.icon className="h-4 w-4" /></span>
              <span>
                <span className="block font-semibold text-foreground">{p.t}</span>
                <span className="block text-sm leading-relaxed text-muted-foreground">{p.d}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-8 text-[15px] text-muted-foreground">
          Read more on our <Link to="/security" className="font-semibold text-brand-700 underline underline-offset-4">Security</Link> and{' '}
          <Link to="/privacy" className="font-semibold text-brand-700 underline underline-offset-4">Privacy</Link> pages, or{' '}
          <Link to="/contact" className="font-semibold text-brand-700 underline underline-offset-4">get in touch</Link>.
        </p>
      </Container>
    </section>

    <CtaBand />
  </>
);

const TOPICS = [
  { icon: HelpCircle, title: 'Product help', text: 'Questions about documents, templates, the AI assistant or the client portal.', subject: 'Product question' },
  { icon: CreditCard, title: 'Billing', text: 'Plans, invoices, upgrades, cancellations and charges. Include the email on your account.', subject: 'Billing question' },
  { icon: ShieldCheck, title: 'Privacy & data requests', text: 'Access, export or deletion of your data, or questions about our Privacy Policy.', subject: 'Privacy / data request' },
  { icon: Lock, title: 'Security reports', text: 'Found a vulnerability? Tell us privately and give us a chance to fix it before disclosure.', subject: 'Security report' },
];

export const ContactPage: React.FC = () => (
  <>
    <PageHero
      eyebrow="Contact"
      title="Talk to a real person"
      subtitle="Email is the fastest way to reach us. We aim to reply within two business days."
      breadcrumbs={[{ name: 'Home', to: '/' }, { name: 'Contact' }]}
    >
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <a href={mailto('Hello from the website')} className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-brand-600 px-6 text-base font-semibold text-white shadow-sm hover:bg-brand-700">
          <Mail className="h-5 w-5" /> {SITE.email}
        </a>
      </div>
    </PageHero>

    <section className="py-16 sm:py-20">
      <Container className="max-w-5xl">
        <h2 className="font-display text-2xl font-extrabold tracking-[-0.01em] text-foreground">What can we help with?</h2>
        <ul className="mt-8 grid gap-4 sm:grid-cols-2">
          {TOPICS.map((t) => (
            <li key={t.title}>
              <a href={mailto(t.subject)} className="group flex h-full gap-4 rounded-2xl border border-border bg-card p-5 shadow-soft transition hover:border-brand-200 hover:shadow-card">
                <span className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-brand-50 text-brand-700"><t.icon className="h-5 w-5" /></span>
                <span>
                  <span className="block font-bold text-foreground group-hover:text-brand-700">{t.title}</span>
                  <span className="mt-1 block text-[15px] leading-relaxed text-muted-foreground">{t.text}</span>
                  <span className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-brand-700">Email us <ArrowRight className="h-3.5 w-3.5" /></span>
                </span>
              </a>
            </li>
          ))}
        </ul>

        <div className="mt-14 grid gap-8 lg:grid-cols-2">
          <div className="rounded-2xl border border-border bg-card p-6">
            <h2 className="text-lg font-bold text-foreground">To get a faster answer</h2>
            <CheckList
              className="mt-4"
              items={[
                'Write from the email address on your ContractorDocs account',
                'Include the document number or job name if your question is about one',
                'Add a screenshot of any error message',
                'Tell us which device and browser you are using',
              ]}
            />
          </div>
          <div className="rounded-2xl border border-border bg-card p-6">
            <h2 className="text-lg font-bold text-foreground">You might find the answer here</h2>
            <ul className="mt-4 space-y-2 text-[15px]">
              {[
                { to: '/pricing', label: 'Plans, limits and billing questions' },
                { to: '/features', label: 'Everything ContractorDocs can do' },
                { to: '/security', label: 'How we protect your data' },
                { to: '/privacy', label: 'Privacy Policy and data deletion' },
                { to: '/blog', label: 'Guides for contractor paperwork' },
              ].map((l) => (
                <li key={l.to}>
                  <Link to={l.to} className="inline-flex min-h-[40px] items-center gap-1.5 font-medium text-brand-700 hover:text-brand-800">
                    {l.label} <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Container>
    </section>

    <CtaBand title="Haven’t tried it yet?" text="Create a free account and send your first estimate today." primaryTo={SIGNUP_PATH} />
  </>
);
