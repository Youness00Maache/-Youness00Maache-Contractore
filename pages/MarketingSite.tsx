import React, { useEffect, useLayoutEffect, useRef } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { SiteLayout } from './components/SiteLayout.tsx';
import LandingPage from './LandingPage.tsx';
import FeaturesPage from './FeaturesPage.tsx';
import PricingPage from './PricingPage.tsx';
import TemplatesPage from './TemplatesPage.tsx';
import GeneratorPage from './GeneratorPage.tsx';
import { AboutPage, ContactPage } from './CompanyPages.tsx';
import { BlogIndexPage, BlogPostPage } from './BlogPages.tsx';
import NotFoundPage from './NotFoundPage.tsx';
import HelpPage from './HelpPage.tsx';
import PrivacyPolicy from '../components/PrivacyPolicy.tsx';
import TermsOfService from '../components/TermsOfService.tsx';
import Security from '../components/Security.tsx';
import { getPageSeo, applySeoToDocument, NOT_FOUND_SEO } from './seo.ts';
import { getLoadedPost } from './blogLoader.ts';
import { normalizePath } from './routes.ts';

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/** Public marketing site (prerendered to static HTML and hydrated on the client). No Supabase here. */
const MarketingSite: React.FC = () => {
  const location = useLocation();
  const first = useRef(true);

  // The marketing site is always light, even if the app on this device uses dark mode.
  useIsomorphicLayoutEffect(() => {
    const root = document.documentElement;
    const hadDark = root.classList.contains('dark');
    const hadBlue = root.classList.contains('blue');
    root.classList.remove('dark', 'blue');
    return () => {
      if (hadDark) root.classList.add('dark');
      if (hadBlue) root.classList.add('blue');
    };
  }, []);

  // Keep <head> in sync on client-side navigation and scroll like a normal page load.
  useEffect(() => {
    const path = normalizePath(location.pathname);
    const slug = path.startsWith('/blog/') ? path.slice(6) : '';
    const seo = getPageSeo(path, slug ? getLoadedPost(slug) : null) || NOT_FOUND_SEO(path);
    if (!first.current) applySeoToDocument(seo);
    first.current = false;

    if (location.hash) {
      const id = decodeURIComponent(location.hash.slice(1));
      requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView());
    } else {
      window.scrollTo(0, 0);
    }
  }, [location.pathname, location.hash]);

  return (
    <SiteLayout>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/features" element={<FeaturesPage />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/templates" element={<TemplatesPage />} />
        <Route path="/invoice-generator" element={<GeneratorPage kind="invoice" />} />
        <Route path="/estimate-generator" element={<GeneratorPage kind="estimate" />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/blog" element={<BlogIndexPage />} />
        <Route path="/blog/:slug" element={<BlogPostPage />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/terms" element={<TermsOfService />} />
        <Route path="/security" element={<Security />} />
        <Route path="/help" element={<HelpPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </SiteLayout>
  );
};

export default MarketingSite;
