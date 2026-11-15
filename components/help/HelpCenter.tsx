/**
 * In-app Help & tutorials (/tutorials): every guide from helpContent.ts, searchable, with "Open" buttons that
 * jump to the screen and a button to replay the first-run tour. The public twin is pages/HelpPage.tsx (/help).
 */
import React, { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { PageHeader } from '../viewKit.tsx';
import { HELP_GROUPS, searchGuides } from './helpContent.ts';
import { GuideArticle, HelpCircleIcon } from './HelpText.tsx';
import { openAppPath, requestAppTour } from './helpNav.ts';
import { SUPPORT_EMAIL } from '../../lib/account.ts';
import { chapterForGuide, loadManifest, type VideoManifest } from '../../lib/tutorialVideo.ts';
import type { VideoRequest } from './VideoCourse.tsx';

// the video player is its own chunk and only loads when the course has been published (manifest exists)
const VideoCourse = lazy(() => import('./VideoCourse.tsx'));

const HelpCenter: React.FC<{ onBack: () => void; language?: string | null }> = ({ onBack, language }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [query, setQuery] = useState('');
  const guides = useMemo(() => searchGuides(query), [query]);
  const [manifest, setManifest] = useState<VideoManifest | null>(null);
  const [videoRequest, setVideoRequest] = useState<VideoRequest | null>(null);
  useEffect(() => { let live = true; void loadManifest().then((m) => { if (live) setManifest(m); }); return () => { live = false; }; }, []);
  // /tutorials?video=<chapter id>&t=<seconds> opens the course on that chapter
  useEffect(() => {
    if (!manifest) return;
    const params = new URLSearchParams(location.search);
    const id = params.get('video');
    if (id && manifest.chapters.some((c) => c.id === id)) setVideoRequest({ chapterId: id, t: Number(params.get('t')) || 0, autoplay: false, nonce: Date.now() });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manifest]);

  // /tutorials#photos opens on that guide.
  useEffect(() => {
    const id = decodeURIComponent(location.hash.replace(/^#/, ''));
    if (!id) return;
    const t = window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
    return () => window.clearTimeout(t);
  }, [location.hash]);

  const takeTour = () => { navigate('/dashboard'); requestAppTour(); };
  const jump = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.history.replaceState(window.history.state, '', `#${id}`);
  };

  return (
    <div className="page">
      <PageHeader
        onBack={onBack}
        icon={<HelpCircleIcon className="h-7 w-7" />}
        title="Help & tutorials"
        subtitle="Step-by-step guides for every part of ContractorDocs."
        actions={<button type="button" className="btn btn-primary" onClick={takeTour}>Take the 1-minute tour</button>}
      />

      {manifest && (
        <div className="mb-6">
          <Suspense fallback={null}><VideoCourse manifest={manifest} appLanguage={language} request={videoRequest} /></Suspense>
        </div>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <aside className="min-w-0 lg:sticky lg:top-20 lg:self-start">
          <label htmlFor="help-search" className="sr-only">Search the guides</label>
          <input
            id="help-search"
            type="search"
            className="input"
            placeholder="Search: invoice, portal, reminders…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <nav aria-label="Guides" className="mt-4 hidden space-y-4 lg:block">
            {HELP_GROUPS.map((group) => {
              const inGroup = guides.filter((g) => g.group === group);
              if (!inGroup.length) return null;
              return (
                <div key={group}>
                  <p className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{group}</p>
                  <ul>
                    {inGroup.map((g) => (
                      <li key={g.id}>
                        <button type="button" onClick={() => jump(g.id)} className="w-full rounded-lg px-2 py-1.5 text-left text-sm text-foreground hover:bg-muted">{g.title}</button>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </nav>
          <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1 lg:hidden" aria-label="Guides">
            {guides.map((g) => (
              <button key={g.id} type="button" onClick={() => jump(g.id)} className="shrink-0 rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-foreground">{g.title}</button>
            ))}
          </div>
        </aside>

        <div className="min-w-0 space-y-8">
          {guides.length === 0 && (
            <p className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
              No guide matches “{query}”. Try another word, or email <a className="font-semibold text-primary" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
            </p>
          )}
          {HELP_GROUPS.map((group) => {
            const inGroup = guides.filter((g) => g.group === group);
            if (!inGroup.length) return null;
            return (
              <section key={group} aria-label={group} className="space-y-4">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group}</h2>
                {inGroup.map((g) => (
                  <GuideArticle
                    key={g.id}
                    guide={g}
                    headingLevel="h3"
                    actions={(
                      <>
                        {chapterForGuide(manifest, g.id) && (
                          <button type="button" className="btn btn-outline btn-sm h-9" onClick={() => setVideoRequest({ chapterId: chapterForGuide(manifest, g.id)!.id, autoplay: true, nonce: Date.now() })}>Watch the video</button>
                        )}
                        <button type="button" className="btn btn-outline btn-sm h-9" onClick={() => openAppPath(navigate, g.appPath)}>Open</button>
                      </>
                    )}
                  />
                ))}
              </section>
            );
          })}
          <p className="pb-4 text-sm text-muted-foreground">
            Still stuck? Email <a className="font-semibold text-primary" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> and a real person will answer.
          </p>
        </div>
      </div>
    </div>
  );
};

export default HelpCenter;
