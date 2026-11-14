import React, { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { Logo, LogoMark } from './Logo.tsx';
import { Container, ButtonLink } from './ui.tsx';
import { Menu, XIcon, Mail } from './icons.tsx';
import { SITE, SIGNUP_PATH, LOGIN_PATH } from '../../content/site.ts';
import { hasStoredSession } from '../routes.ts';
import { landingPagesOf } from '../../content/landing/registry.ts';

const NAV = [
  { to: '/features', label: 'Features' },
  { to: '/templates', label: 'Templates' },
  { to: '/pricing', label: 'Pricing' },
  { to: '/blog', label: 'Blog' },
];

const FOOTER_COLUMNS: { title: string; links: { to: string; label: string }[] }[] = [
  {
    title: 'Product',
    links: [
      { to: '/features', label: 'Features' },
      { to: '/pricing', label: 'Pricing' },
      { to: '/templates', label: 'Templates' },
      ...landingPagesOf('ai').map((p) => ({ to: p.path, label: p.label.charAt(0).toUpperCase() + p.label.slice(1) })),
      { to: '/invoice-generator', label: 'Free invoice generator' },
      { to: '/estimate-generator', label: 'Free estimate generator' },
      { to: '/help', label: 'Help center' },
    ],
  },
  {
    title: 'For your trade',
    links: landingPagesOf('trade').map((p) => ({ to: p.path, label: p.label })),
  },
  {
    title: 'Compare',
    links: landingPagesOf('compare').map((p) => ({ to: p.path, label: p.label })),
  },
  {
    title: 'Guides',
    links: [
      { to: '/blog/how-to-write-a-construction-invoice', label: 'Construction invoices' },
      { to: '/blog/construction-estimate-template', label: 'Pricing a job' },
      { to: '/blog/change-order-form-guide', label: 'Change orders' },
      { to: '/blog/daily-job-report-template', label: 'Daily job reports' },
      { to: '/blog', label: 'Blog' },
    ],
  },
  {
    title: 'Company',
    links: [
      { to: '/about', label: 'About' },
      { to: '/contact', label: 'Contact' },
      { to: '/security', label: 'Security' },
      { to: '/privacy', label: 'Privacy policy' },
      { to: '/terms', label: 'Terms of service' },
    ],
  },
];

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-lg px-3 py-2 text-[15px] font-medium transition-colors ${isActive ? 'text-brand-700' : 'text-foreground/70 hover:text-foreground'}`;

export const SiteHeader: React.FC = () => {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    setSignedIn(hasStoredSession());
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => { setOpen(false); }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <header
      className={`sticky top-0 z-40 w-full border-b transition-colors duration-200 ${
        scrolled || open ? 'border-border bg-background/90 backdrop-blur-lg' : 'border-transparent bg-background/0'
      }`}
    >
      <Container className="flex h-16 items-center justify-between gap-4">
        <Link to="/" className="flex min-h-[44px] items-center rounded-lg" aria-label="ContractorDocs home">
          <Logo />
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to} className={navLinkClass}>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          {signedIn ? (
            <ButtonLink to="/dashboard" variant="primary">Open dashboard</ButtonLink>
          ) : (
            <>
              <Link to={LOGIN_PATH} className="rounded-lg px-3 py-2 text-[15px] font-semibold text-foreground/80 hover:text-foreground">
                Log in
              </Link>
              <ButtonLink to={SIGNUP_PATH} variant="primary">Start free</ButtonLink>
            </>
          )}
        </div>

        <button
          type="button"
          className="-mr-2 inline-flex h-11 w-11 items-center justify-center rounded-xl text-foreground hover:bg-muted md:hidden"
          aria-expanded={open}
          aria-controls="mobile-menu"
          aria-label={open ? 'Close menu' : 'Open menu'}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <XIcon className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </Container>

      {open ? (
        <div id="mobile-menu" className="border-t border-border bg-background md:hidden">
          <Container className="py-4">
            <nav aria-label="Mobile" className="flex flex-col">
              {NAV.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `flex min-h-[48px] items-center rounded-xl px-3 text-base font-semibold ${isActive ? 'bg-brand-50 text-brand-700' : 'text-foreground hover:bg-muted'}`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-4">
              {signedIn ? (
                <ButtonLink to="/dashboard" variant="primary" className="col-span-2">Open dashboard</ButtonLink>
              ) : (
                <>
                  <ButtonLink to={LOGIN_PATH} variant="outline">Log in</ButtonLink>
                  <ButtonLink to={SIGNUP_PATH} variant="primary">Start free</ButtonLink>
                </>
              )}
            </div>
          </Container>
        </div>
      ) : null}
    </header>
  );
};

export const SiteFooter: React.FC = () => (
  <footer className="border-t border-border bg-card">
    <Container className="py-14">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,3.4fr)] lg:gap-12">
        <div className="max-w-sm">
          <Link to="/" className="inline-flex items-center" aria-label="ContractorDocs home">
            <Logo />
          </Link>
          <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">
            Invoices, estimates, work orders, change orders and daily reports for contractors. Create, send, sign and get paid from one place.
          </p>
          <a href={`mailto:${SITE.email}`} className="mt-4 inline-flex min-h-[44px] items-center gap-2 text-[15px] font-medium text-foreground hover:text-brand-700">
            <Mail className="h-4 w-4" /> {SITE.email}
          </a>
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-3 lg:grid-cols-5">
          {FOOTER_COLUMNS.map((col) => (
            <div key={col.title}>
              <h2 className="text-sm font-semibold text-foreground">{col.title}</h2>
              <ul className="mt-3 space-y-1">
                {col.links.map((link) => (
                  <li key={link.to}>
                    <Link to={link.to} className="inline-flex min-h-[36px] items-center text-[15px] text-muted-foreground hover:text-foreground">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-12 flex flex-col gap-3 border-t border-border pt-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-center gap-2">
          <LogoMark className="h-5 w-5" /> © {SITE.year} ContractorDocs. All rights reserved.
        </p>
      </div>
    </Container>
  </footer>
);

export const SiteLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="flex min-h-screen flex-col bg-background text-foreground">
    <a
      href="#main"
      className="sr-only z-50 rounded-lg bg-brand-600 px-4 py-2 font-semibold text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
    >
      Skip to content
    </a>
    <SiteHeader />
    <main id="main" className="flex-1">
      {children}
    </main>
    <SiteFooter />
  </div>
);

export default SiteLayout;
