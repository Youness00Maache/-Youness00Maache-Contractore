import React from 'react';

/**
 * ContractorDocs brand mark: the original app logo (a document with a hard hat on a blue tile),
 * served from /public/logo.png. Favicons and app icons are generated from the same file (`npm run seo:assets`).
 * Decorative by default (the wordmark next to it carries the name); pass `title` when it stands alone.
 */
export const LogoMark: React.FC<{ className?: string; title?: string }> = ({ className = 'h-9 w-9', title }) => (
  <img
    src="/logo.png"
    alt={title || ''}
    aria-hidden={title ? undefined : true}
    width={64}
    height={64}
    decoding="async"
    draggable={false}
    className={`shrink-0 select-none object-contain ${className}`}
  />
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
