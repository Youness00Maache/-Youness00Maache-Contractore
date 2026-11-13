import React from 'react';
import { Link } from 'react-router-dom';
import { Container, ButtonLink } from './components/ui.tsx';
import { FileText } from './components/icons.tsx';

const NotFoundPage: React.FC = () => (
  <section className="py-24 sm:py-32">
    <Container className="max-w-xl text-center">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-700"><FileText className="h-7 w-7" /></span>
      <p className="mt-6 text-sm font-semibold uppercase tracking-[0.14em] text-brand-600">404</p>
      <h1 className="mt-2 font-display text-3xl font-extrabold tracking-[-0.01em] text-foreground sm:text-4xl">We couldn’t find that page</h1>
      <p className="mt-4 text-lg text-muted-foreground">The link may be old or mistyped. Try one of these instead:</p>
      <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
        <ButtonLink to="/">Go to the homepage</ButtonLink>
        <ButtonLink to="/blog" variant="outline">Read the blog</ButtonLink>
      </div>
      <p className="mt-6 text-sm text-muted-foreground">
        Looking for your account? <Link to="/auth/login" className="font-semibold text-brand-700 underline underline-offset-4">Log in</Link>
      </p>
    </Container>
  </section>
);

export default NotFoundPage;
