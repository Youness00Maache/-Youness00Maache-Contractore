import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { LogoMark, Logo } from './Logo.tsx';
import { InvoicePaper } from './Mockups.tsx';
import { ArrowLeft, Check, Eye, EyeOff, GoogleG } from './icons.tsx';

/**
 * Split-screen layout for Login / Signup / UpdatePassword: brand panel on desktop, clean card on mobile.
 * Uses design tokens, so it also looks right when the app is in dark mode.
 */
export const AuthShell: React.FC<{
  title: string;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  aside?: { heading: string; points: string[] };
}> = ({ title, subtitle, children, footer, aside }) => {
  const panel = aside || {
    heading: 'Professional contractor paperwork in minutes',
    points: [
      'Invoices, estimates, change orders and daily reports',
      'Clients approve and sign online',
      'Send PDFs from your own Gmail',
      'See what every job really earns',
    ],
  };
  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="relative hidden w-[46%] max-w-[680px] flex-col justify-between overflow-hidden bg-brand-700 p-10 text-white lg:flex xl:p-14">
        <div aria-hidden="true" className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-brand-400/40 blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-40 -left-24 h-96 w-96 rounded-full bg-amber-400/20 blur-3xl" />
        <Link to="/" className="relative inline-flex w-fit items-center gap-2.5 rounded-lg" aria-label="ContractorDocs home">
          <LogoMark className="h-9 w-9" />
          <span className="font-display text-xl font-extrabold tracking-[-0.01em]">ContractorDocs</span>
        </Link>
        <div className="relative">
          <h2 className="max-w-md font-display text-4xl font-extrabold leading-tight tracking-[-0.01em]">{panel.heading}</h2>
          <ul className="mt-8 space-y-3.5">
            {panel.points.map((p) => (
              <li key={p} className="flex items-center gap-3 text-[16px] text-brand-50">
                <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-white/15"><Check className="h-3.5 w-3.5" strokeWidth={3} /></span>
                {p}
              </li>
            ))}
          </ul>
          <div className="mt-10 max-w-md rotate-[-2deg] opacity-95" aria-hidden="true">
            <InvoicePaper compact />
          </div>
        </div>
        <p className="relative text-sm text-brand-200">© 2026 ContractorDocs · <Link to="/privacy" className="underline-offset-4 hover:underline">Privacy</Link> · <Link to="/terms" className="underline-offset-4 hover:underline">Terms</Link></p>
      </aside>

      <main className="flex flex-1 flex-col">
        <div className="flex items-center justify-between px-4 py-4 sm:px-8">
          <Link to="/" className="lg:invisible" aria-label="ContractorDocs home"><Logo markClassName="h-8 w-8" /></Link>
          <Link to="/" className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Home
          </Link>
        </div>
        <div className="flex flex-1 items-start justify-center px-4 pb-12 pt-4 sm:items-center sm:px-8">
          <div className="w-full max-w-[420px]">
            <div className="rounded-3xl border border-border bg-card p-6 shadow-card sm:p-8">
              <h1 className="font-display text-2xl font-extrabold tracking-[-0.01em] text-foreground sm:text-3xl">{title}</h1>
              {subtitle ? <p className="mt-2 text-[15px] text-muted-foreground">{subtitle}</p> : null}
              <div className="mt-6">{children}</div>
            </div>
            {footer ? <div className="mt-6 text-center text-sm text-muted-foreground">{footer}</div> : null}
          </div>
        </div>
      </main>
    </div>
  );
};

export const AuthField: React.FC<{ id: string; label: React.ReactNode; children: React.ReactNode; right?: React.ReactNode }> = ({ id, label, children, right }) => (
  <div>
    <div className="mb-1.5 flex items-center justify-between">
      <label htmlFor={id} className="text-sm font-semibold text-foreground">{label}</label>
      {right}
    </div>
    {children}
  </div>
);

export const PasswordInput: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = (props) => {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input {...props} type={show ? 'text' : 'password'} className={`input h-12 pr-12 text-[15px] ${props.className || ''}`} />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        className="absolute right-1 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground"
        aria-label={show ? 'Hide password' : 'Show password'}
        aria-pressed={show}
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
};

export const GoogleButton: React.FC<{ onClick: () => void; disabled?: boolean; children: React.ReactNode }> = ({ onClick, disabled, children }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className="flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-input bg-card text-[15px] font-semibold text-foreground shadow-sm transition-colors hover:bg-muted disabled:opacity-60"
  >
    <GoogleG /> {children}
  </button>
);

export const OrDivider: React.FC = () => (
  <div className="relative my-6">
    <div className="absolute inset-0 flex items-center" aria-hidden="true"><span className="w-full border-t border-border" /></div>
    <p className="relative flex justify-center text-xs font-medium uppercase tracking-wider"><span className="bg-card px-3 text-muted-foreground">or</span></p>
  </div>
);

export const FormMessage: React.FC<{ tone: 'error' | 'success'; children: React.ReactNode }> = ({ tone, children }) => (
  <p
    role={tone === 'error' ? 'alert' : 'status'}
    className={`rounded-xl px-3.5 py-2.5 text-sm font-medium ${tone === 'error' ? 'bg-destructive/10 text-destructive' : 'bg-success/10 text-success'}`}
  >
    {children}
  </p>
);

export const friendlyAuthError = (err: unknown, fallback: string): string => {
  const raw = err instanceof Error ? err.message : typeof err === 'string' ? err : '';
  const msg = raw.toLowerCase();
  if (!raw) return fallback;
  if (msg.includes('provider is not enabled')) return 'Google sign-in isn’t available right now. Please use your email and password.';
  if (msg.includes('invalid login credentials')) return 'That email and password don’t match. Check them and try again.';
  if (msg.includes('email not confirmed')) return 'Please confirm your email first. Check your inbox for the link we sent.';
  if (msg.includes('already registered') || msg.includes('already been registered')) return 'An account with this email already exists. Try logging in instead.';
  if (msg.includes('rate limit') || msg.includes('too many')) return 'Too many attempts. Please wait a minute and try again.';
  if (msg.includes('failed to fetch') || msg.includes('network')) return 'We couldn’t reach the server. Check your connection and try again.';
  return raw;
};

export default AuthShell;
