import React from 'react';

/**
 * ContractorDocs brand mark: a document with a folded corner and an amber "approved" check badge
 * on a brand-blue tile. Same artwork as /public/favicon.svg and /public/logo.svg.
 */
export const LogoMark: React.FC<{ className?: string; title?: string }> = ({ className = 'h-9 w-9', title }) => (
  <svg
    viewBox="0 0 64 64"
    className={className}
    xmlns="http://www.w3.org/2000/svg"
    role={title ? 'img' : undefined}
    aria-hidden={title ? undefined : true}
    focusable="false"
  >
    {title ? <title>{title}</title> : null}
    <rect width="64" height="64" rx="15" fill="#2148ed" />
    <path d="M0 15A15 15 0 0 1 15 0h34a15 15 0 0 1 15 15v9C44 30 20 30 0 24Z" fill="#fff" opacity=".08" />
    <path d="M21 12h15l9 9v27a4 4 0 0 1-4 4H21a4 4 0 0 1-4-4V16a4 4 0 0 1 4-4Z" fill="#fff" />
    <path d="M36 12v6a3 3 0 0 0 3 3h6Z" fill="#bdd3ff" />
    <rect x="22" y="26" width="15" height="3.4" rx="1.7" fill="#90b6ff" />
    <rect x="22" y="33" width="10" height="3.4" rx="1.7" fill="#90b6ff" />
    <circle cx="45" cy="45" r="11" fill="#f59e0b" stroke="#2148ed" strokeWidth="3" />
    <path d="m40 45.3 3.4 3.4 6.6-7" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const Wordmark: React.FC<{ className?: string }> = ({ className = '' }) => (
  <span className={`font-display text-[1.15rem] font-extrabold tracking-[-0.01em] text-foreground ${className}`}>
    Contractor<span className="text-brand-600">Docs</span>
  </span>
);

export const Logo: React.FC<{ className?: string; markClassName?: string }> = ({ className = '', markClassName = 'h-8 w-8' }) => (
  <span className={`inline-flex items-center gap-2.5 ${className}`}>
    <LogoMark className={markClassName} />
    <Wordmark />
  </span>
);

export default Logo;
