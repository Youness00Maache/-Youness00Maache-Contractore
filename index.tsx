/**
 * Client entry. Decides which tree renders a URL:
 *  - marketing routes (/, /features, /pricing, /blog/…, /privacy …) → the lightweight `pages/MarketingSite`
 *    (prerendered to static HTML at build time and hydrated here);
 *  - everything else, plus "/" for signed-in users, OAuth callbacks and client links → the app (lazy chunk).
 * Keep the routing rules in sync with the inline boot script in index.html (see pages/routes.ts).
 */
import React, { Suspense, lazy, useEffect } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, useLocation } from 'react-router-dom';
import MarketingSite from './pages/MarketingSite.tsx';
import { isMarketingPath, isAppCallback, rootBelongsToApp, markLandingForced, normalizePath } from './pages/routes.ts';
import { requestSlugFromPath } from './components/requests/requestLogic.ts';
import { crewTokenFromPath } from './lib/crew/crewPath.ts';
import { preloadRouteData } from './pages/blogLoader.ts';
import { LogoMark } from './pages/components/Logo.tsx';
import './index.css';
// keeps the browser's one-time "install app" event for the phone banner (components/InstallAppBanner.tsx)
import './lib/installPrompt.ts';

const App = lazy(() => import('./App.tsx'));
/** Public request-a-quote page (/r/<slug>): its own small chunk, the app is not loaded. */
const RequestQuotePage = lazy(() => import('./components/requests/RequestQuotePage.tsx'));
/** Crew clock-in link (/clock/<token>): the worker's phone page, its own small chunk (no login, no app shell). */
const CrewClockPage = lazy(() => import('./components/crew/CrewClockPage.tsx'));

/** Fonts used by the document templates: only needed inside the app, so loaded on demand. */
const TEMPLATE_FONTS_HREF =
  'https://fonts.googleapis.com/css2?family=Abril+Fatface&family=Alfa+Slab+One&family=Anton&family=Arvo&family=Bangers&family=Bebas+Neue&family=Bitter&family=Cabin&family=Caveat&family=Comfortaa&family=Cormorant+Garamond&family=Crimson+Text&family=Dancing+Script:wght@400;700&family=DM+Sans&family=EB+Garamond&family=Indie+Flower&family=Inconsolata&family=Josefin+Sans&family=Lato:ital,wght@0,400;0,700;1,400&family=Lobster&family=Lora&family=Merriweather:ital,wght@0,400;0,700;1,400&family=Montserrat:ital,wght@0,400;0,700;1,400&family=Nunito&family=Open+Sans:ital,wght@0,400;0,700;1,400&family=Oswald:wght@400;700&family=Outfit:wght@300;400;500;600;700;800&family=Pacifico&family=Patrick+Hand&family=Permanent+Marker&family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=Poppins&family=PT+Serif&family=Raleway:ital,wght@0,400;0,700;1,400&family=Righteous&family=Roboto:ital,wght@0,400;0,700;1,400&family=Rubik&family=Shadows+Into+Light+Two&family=Source+Code+Pro&family=Space+Grotesk&family=Space+Mono&family=Ubuntu&family=Work+Sans&display=swap';

function loadTemplateFonts(): void {
  if (document.getElementById('cd-template-fonts')) return;
  const link = document.createElement('link');
  link.id = 'cd-template-fonts';
  link.rel = 'stylesheet';
  link.href = TEMPLATE_FONTS_HREF;
  document.head.appendChild(link);
}

const AppLoading: React.FC = () => (
  <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background" role="status" aria-live="polite">
    <LogoMark className="h-12 w-12 animate-pulse-slow" />
    <span className="text-sm font-medium text-muted-foreground">Loading ContractorDocs…</span>
  </div>
);

const AppBranch: React.FC = () => {
  useEffect(() => {
    loadTemplateFonts();
    document.documentElement.classList.remove('cd-site');
    document.documentElement.classList.add('cd-app');
  }, []);
  return (
    <Suspense fallback={<AppLoading />}>
      <App />
    </Suspense>
  );
};

const Root: React.FC = () => {
  const location = useLocation();
  const path = normalizePath(location.pathname);

  if (path === '/welcome') {
    markLandingForced();
    return <Navigate to={{ pathname: '/', search: location.search }} replace />;
  }
  if (path === '/login') return <Navigate to={{ pathname: '/auth/login', search: location.search }} replace />;
  if (path === '/signup') return <Navigate to={{ pathname: '/auth/signup', search: location.search }} replace />;

  if (path === '/' && rootBelongsToApp(location)) {
    // OAuth callbacks and client links are handled by the app at "/"; signed-in users go to the dashboard.
    return isAppCallback(location) ? <AppBranch /> : <Navigate to="/dashboard" replace />;
  }
  if (isMarketingPath(path)) return <MarketingSite />;
  const requestSlug = requestSlugFromPath(location.pathname);
  if (requestSlug !== null) return <RequestBranch slug={requestSlug} />;
  const crewToken = crewTokenFromPath(location.pathname);
  if (crewToken !== null) return <CrewBranch token={crewToken} />;
  return <AppBranch />;
};

/** /clock/<token>: a crew member's clock-in page (Premium feature of their boss's account). */
const CrewBranch: React.FC<{ token: string }> = ({ token }) => {
  useEffect(() => {
    document.documentElement.classList.remove('cd-site');
    document.documentElement.classList.add('cd-app');
  }, []);
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" aria-busy="true" />}>
      <CrewClockPage token={token} />
    </Suspense>
  );
};

/** /r/<slug>: the contractor's public request-a-quote page (no login, no app shell, no ContractorDocs splash). */
const RequestBranch: React.FC<{ slug: string }> = ({ slug }) => {
  useEffect(() => {
    document.documentElement.classList.remove('cd-site');
    document.documentElement.classList.add('cd-app');
  }, []);
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" aria-busy="true" />}>
      <RequestQuotePage slug={slug} />
    </Suspense>
  );
};

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Could not find root element to mount to');

const tree = (
  <React.StrictMode>
    <BrowserRouter>
      <Root />
    </BrowserRouter>
  </React.StrictMode>
);

const currentPath = normalizePath(window.location.pathname);
const isSite = isMarketingPath(currentPath) && !(currentPath === '/' && rootBelongsToApp(window.location));
const prerenderedFor = rootElement.getAttribute('data-prerendered');

if (isSite) {
  document.documentElement.classList.add('cd-site');
  // Blog posts are code-split: load the current one first so hydration matches the static HTML.
  preloadRouteData(currentPath).finally(() => {
    if (prerenderedFor !== null && normalizePath(prerenderedFor) === currentPath && rootElement.firstElementChild) {
      hydrateRoot(rootElement, tree);
    } else {
      rootElement.removeAttribute('data-prerendered');
      rootElement.textContent = '';
      createRoot(rootElement).render(tree);
    }
  });
} else {
  rootElement.removeAttribute('data-prerendered');
  rootElement.textContent = '';
  createRoot(rootElement).render(tree);
}
