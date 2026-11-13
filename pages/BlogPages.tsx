import React, { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { Container, Breadcrumbs, ButtonLink, Eyebrow, GRID_BG } from './components/ui.tsx';
import { Markdown, extractHeadings, renderInline } from './components/Markdown.tsx';
import { ArrowRight, Clock, CalendarIcon, Check, BookOpen } from './components/icons.tsx';
import { BLOG_POSTS, BLOG_CATEGORIES, getPostMeta, categorySlug } from '../content/blog/registry.ts';
import type { BlogCategory, BlogPostMeta, BlogPostContent } from '../content/blog/types.ts';
import { getLoadedPost, loadPost } from './blogLoader.ts';
import NotFoundPage from './NotFoundPage.tsx';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const formatDate = (iso: string): string => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${MONTHS[(m || 1) - 1]} ${d}, ${y}`;
};

const CATEGORY_TONES: Record<BlogCategory, string> = {
  'Invoicing & Payments': 'bg-brand-50 text-brand-700 ring-brand-100',
  'Estimating & Profit': 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  'Project Paperwork': 'bg-amber-50 text-amber-800 ring-amber-100',
  'Field Reports & Crews': 'bg-sky-50 text-sky-700 ring-sky-100',
  'Running Your Business': 'bg-violet-50 text-violet-700 ring-violet-100',
};

const CategoryBadge: React.FC<{ category: BlogCategory }> = ({ category }) => (
  <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${CATEGORY_TONES[category]}`}>{category}</span>
);

const PostMetaLine: React.FC<{ post: BlogPostMeta; className?: string }> = ({ post, className = '' }) => (
  <p className={`flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground ${className}`}>
    <span className="inline-flex items-center gap-1.5"><CalendarIcon className="h-4 w-4" /><time dateTime={post.date}>{formatDate(post.date)}</time></span>
    <span className="inline-flex items-center gap-1.5"><Clock className="h-4 w-4" /> {post.readingTime} min read</span>
  </p>
);

const PostCard: React.FC<{ post: BlogPostMeta; headingLevel?: 'h2' | 'h3' }> = ({ post, headingLevel = 'h2' }) => {
  const H = headingLevel;
  return (
    <article className="group relative flex h-full flex-col rounded-2xl border border-border bg-card p-6 shadow-soft transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-card">
      <CategoryBadge category={post.category} />
      <H className="mt-4 text-lg font-bold leading-snug text-foreground group-hover:text-brand-700">
        <Link to={`/blog/${post.slug}`} className="after:absolute after:inset-0 after:rounded-2xl">{post.title}</Link>
      </H>
      <p className="mt-2 flex-1 text-[15px] leading-relaxed text-muted-foreground">{post.description}</p>
      <PostMetaLine post={post} className="mt-5" />
    </article>
  );
};

export const BlogIndexPage: React.FC = () => {
  const location = useLocation();
  const [category, setCategory] = useState<BlogCategory | 'all'>('all');

  useEffect(() => {
    const slug = new URLSearchParams(location.search).get('category');
    const match = BLOG_CATEGORIES.find((c) => c.slug === slug);
    setCategory(match ? match.name : 'all');
  }, [location.search]);

  const [featured, ...rest] = BLOG_POSTS;
  const filtered = category === 'all' ? rest : BLOG_POSTS.filter((p) => p.category === category);

  return (
    <>
      <section className="relative overflow-hidden border-b border-border bg-gradient-to-b from-brand-50/70 via-background to-background">
        <div aria-hidden="true" className={`${GRID_BG} pointer-events-none absolute inset-0 opacity-70`} />
        <Container className="relative py-14 sm:py-20">
          <Breadcrumbs items={[{ name: 'Home', to: '/' }, { name: 'Blog' }]} className="mb-6" />
          <div className="max-w-3xl">
            <Eyebrow className="mb-3">The ContractorDocs blog</Eyebrow>
            <h1 className="font-display text-4xl font-extrabold leading-[1.1] tracking-[-0.015em] text-foreground sm:text-5xl">Practical guides for contractor paperwork</h1>
            <p className="mt-5 text-lg leading-relaxed text-muted-foreground sm:text-xl">
              How to invoice, estimate, document and get paid, written for contractors who would rather be on site. Templates, checklists and worked examples.
            </p>
          </div>
        </Container>
      </section>

      <section className="py-12 sm:py-16">
        <Container>
          {category === 'all' && featured ? (
            <article className="group relative grid overflow-hidden rounded-3xl border border-border bg-card shadow-soft transition hover:border-brand-200 hover:shadow-card lg:grid-cols-[1.1fr_1fr]">
              <div className="flex flex-col justify-center p-6 sm:p-10">
                <p className="flex items-center gap-3"><span className="badge badge-primary">Featured guide</span><CategoryBadge category={featured.category} /></p>
                <h2 className="mt-5 font-display text-2xl font-extrabold leading-tight text-foreground group-hover:text-brand-700 sm:text-3xl">
                  <Link to={`/blog/${featured.slug}`} className="after:absolute after:inset-0">{featured.title}</Link>
                </h2>
                <p className="mt-3 text-[16px] leading-relaxed text-muted-foreground">{featured.description}</p>
                <PostMetaLine post={featured} className="mt-6" />
              </div>
              <div aria-hidden="true" className="relative hidden min-h-[260px] items-center justify-center bg-gradient-to-br from-brand-600 to-brand-800 p-10 lg:flex">
                <div className="w-64 rotate-[-4deg] rounded-xl bg-white p-5 shadow-2xl">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-600">Invoice</p>
                  <div className="mt-3 space-y-2">
                    {[80, 64, 72, 52].map((w, i) => (
                      <div key={i} className="flex justify-between"><span className="h-1.5 rounded-full bg-slate-200" style={{ width: `${w}%` }} /><span className="h-1.5 w-8 rounded-full bg-slate-300" /></div>
                    ))}
                  </div>
                  <div className="mt-4 flex justify-end"><span className="rounded-md bg-brand-600 px-2 py-1 text-[10px] font-bold text-white">Balance due</span></div>
                </div>
                <span className="absolute bottom-8 right-10 flex h-14 w-14 items-center justify-center rounded-full bg-amber-400 text-white shadow-lg"><Check className="h-7 w-7" strokeWidth={3} /></span>
              </div>
            </article>
          ) : null}

          <div className="mt-12 flex flex-wrap items-center gap-2" role="group" aria-label="Filter articles by category">
            {(['all', ...BLOG_CATEGORIES.map((c) => c.name)] as (BlogCategory | 'all')[]).map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={category === c}
                onClick={() => setCategory(c)}
                className={`min-h-[40px] rounded-full px-4 text-sm font-semibold transition-colors ${
                  category === c ? 'bg-foreground text-background' : 'border border-border bg-card text-foreground/75 hover:text-foreground'
                }`}
              >
                {c === 'all' ? 'All articles' : c}
              </button>
            ))}
          </div>

          <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((p) => (
              <li key={p.slug}><PostCard post={p} /></li>
            ))}
          </ul>
        </Container>
      </section>

      <section className="border-t border-border bg-card py-16">
        <Container className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
          <div>
            <h2 className="font-display text-2xl font-extrabold tracking-[-0.01em] text-foreground">Put the guides into practice</h2>
            <p className="mt-2 text-muted-foreground">Every document in these articles is a template in ContractorDocs, ready to fill in on your phone.</p>
          </div>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <ButtonLink to="/auth/signup" arrow>Start free</ButtonLink>
            <ButtonLink to="/templates" variant="outline">Browse templates</ButtonLink>
          </div>
        </Container>
      </section>
    </>
  );
};

const PostSkeleton: React.FC = () => (
  <div className="space-y-4" aria-busy="true" aria-live="polite">
    <span className="sr-only">Loading article…</span>
    {[100, 92, 96, 70, 0, 88, 94, 60].map((w, i) => (w ? <div key={i} className="skeleton h-4" style={{ width: `${w}%` }} /> : <div key={i} className="h-4" />))}
  </div>
);

const PostBody: React.FC<{ meta: BlogPostMeta; content: BlogPostContent }> = ({ meta, content }) => {
  const headings = extractHeadings(content.body);
  const related = meta.related.map(getPostMeta).filter(Boolean) as BlogPostMeta[];
  return (
    <>
      <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="min-w-0 max-w-[46rem]">
          <aside aria-label="Key takeaways" className="mb-10 rounded-2xl border border-brand-100 bg-brand-50/60 p-5 sm:p-6">
            <h2 className="text-sm font-bold uppercase tracking-wider text-brand-700">Key takeaways</h2>
            <ul className="mt-3 space-y-2.5">
              {content.takeaways.map((t, i) => (
                <li key={i} className="flex gap-3 text-[15.5px] leading-relaxed text-foreground/90">
                  <Check className="mt-1 h-4 w-4 flex-none text-brand-600" strokeWidth={2.6} /> <span>{renderInline(t, `tk-${i}`)}</span>
                </li>
              ))}
            </ul>
          </aside>

          <Markdown source={content.body} />

          {content.faq.length ? (
            <section aria-labelledby="faq" className="mt-14 border-t border-border pt-10">
              <h2 id="faq" className="scroll-mt-24 font-display text-2xl font-extrabold tracking-[-0.01em] text-foreground sm:text-3xl">Frequently asked questions</h2>
              <div className="mt-6 space-y-6">
                {content.faq.map((f, i) => (
                  <div key={i}>
                    <h3 className="text-lg font-bold text-foreground">{f.q}</h3>
                    <p className="mt-2 text-[16.5px] leading-8 text-foreground/85 [&_a]:font-medium [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4">{renderInline(f.a, `faq-${i}`)}</p>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <aside aria-label="Try ContractorDocs" className="relative mt-14 overflow-hidden rounded-3xl bg-brand-700 p-7 text-white shadow-lift sm:p-10">
            <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-20 h-60 w-60 rounded-full bg-brand-400/40 blur-3xl" />
            <div className="relative">
              <h2 className="font-display text-2xl font-extrabold tracking-[-0.01em] sm:text-3xl">{content.cta.heading}</h2>
              <p className="mt-3 max-w-xl text-brand-100">{content.cta.text}</p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <ButtonLink to={content.cta.href} variant="white" size="lg" arrow>{content.cta.label}</ButtonLink>
                <ButtonLink to="/features" variant="dark" size="lg">See all features</ButtonLink>
              </div>
            </div>
          </aside>
        </div>

        <aside className="hidden lg:block" aria-label="On this page">
          <div className="sticky top-24">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">On this page</p>
            <ol className="mt-3 space-y-1 border-l border-border">
              {headings.map((h) => (
                <li key={h.id}>
                  <a href={`#${h.id}`} className="-ml-px block border-l-2 border-transparent py-1.5 pl-4 text-sm leading-snug text-muted-foreground hover:border-brand-500 hover:text-foreground">{h.text}</a>
                </li>
              ))}
              {content.faq.length ? (
                <li><a href="#faq" className="-ml-px block border-l-2 border-transparent py-1.5 pl-4 text-sm text-muted-foreground hover:border-brand-500 hover:text-foreground">FAQ</a></li>
              ) : null}
            </ol>
            <div className="mt-8 rounded-2xl border border-border bg-card p-5">
              <p className="font-semibold text-foreground">Make this document in minutes</p>
              <p className="mt-1.5 text-sm text-muted-foreground">Free plan, all 12 document types.</p>
              <ButtonLink to="/auth/signup" className="mt-4 w-full">Start free</ButtonLink>
            </div>
          </div>
        </aside>
      </div>

      {related.length ? (
        <section aria-labelledby="related-heading" className="mt-20 border-t border-border pt-12">
          <h2 id="related-heading" className="flex items-center gap-2 font-display text-2xl font-extrabold tracking-[-0.01em] text-foreground">
            <BookOpen className="h-6 w-6 text-brand-600" /> Keep reading
          </h2>
          <ul className="mt-8 grid gap-6 md:grid-cols-3">
            {related.map((p) => <li key={p.slug}><PostCard post={p} headingLevel="h3" /></li>)}
          </ul>
        </section>
      ) : null}
    </>
  );
};

export const BlogPostPage: React.FC = () => {
  const { slug = '' } = useParams();
  const meta = getPostMeta(slug);
  const [content, setContent] = useState<BlogPostContent | undefined>(() => getLoadedPost(slug));
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const shown = content && content.slug === slug ? content : getLoadedPost(slug);

  useEffect(() => {
    if (!meta || getLoadedPost(slug)) return;
    let alive = true;
    setFailed(false);
    loadPost(slug)
      .then((c) => { if (alive) { if (c) setContent(c); else setFailed(true); } })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [slug, meta, attempt]);

  if (!meta) return <NotFoundPage />;

  return (
    <article>
      <header className="relative overflow-hidden border-b border-border bg-gradient-to-b from-brand-50/70 via-background to-background">
        <div aria-hidden="true" className={`${GRID_BG} pointer-events-none absolute inset-0 opacity-60`} />
        <Container className="relative max-w-5xl py-12 sm:py-16">
          <Breadcrumbs items={[{ name: 'Home', to: '/' }, { name: 'Blog', to: '/blog' }, { name: meta.category, to: `/blog?category=${categorySlug(meta.category)}` }]} className="mb-6" />
          <CategoryBadge category={meta.category} />
          <h1 className="mt-4 font-display text-[2rem] font-extrabold leading-[1.12] tracking-[-0.015em] text-foreground sm:text-5xl">{meta.title}</h1>
          <p className="mt-5 max-w-3xl text-lg leading-relaxed text-muted-foreground sm:text-xl">{meta.description}</p>
          <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
              <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">CD</span>
              {meta.author}
            </span>
            <PostMetaLine post={meta} />
          </div>
        </Container>
      </header>
      <Container className="max-w-6xl py-12 sm:py-16">
        {shown ? (
          <PostBody meta={meta} content={shown} />
        ) : failed ? (
          <div className="rounded-2xl border border-border bg-card p-8 text-center">
            <p className="font-semibold text-foreground">This article could not be loaded.</p>
            <p className="mt-1 text-muted-foreground">Check your connection and try again.</p>
            <button type="button" onClick={() => { setFailed(false); setAttempt((a) => a + 1); }} className="btn btn-primary mt-5">Try again</button>
          </div>
        ) : (
          <div className="max-w-3xl"><PostSkeleton /></div>
        )}
        <p className="mt-16">
          <Link to="/blog" className="inline-flex min-h-[44px] items-center gap-1.5 font-semibold text-brand-700 hover:text-brand-800">
            <ArrowRight className="h-4 w-4 rotate-180" /> All articles
          </Link>
        </p>
      </Container>
    </article>
  );
};
