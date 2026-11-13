import React from 'react';
import { SiteLayout } from '../pages/components/SiteLayout.tsx';
import LandingPage from '../pages/LandingPage.tsx';

/**
 * Legacy entry point for the landing page. The public site is now rendered by `pages/MarketingSite.tsx`
 * (see index.tsx); this wrapper keeps the old import working. The props are accepted for backwards
 * compatibility but navigation now uses real links (/auth/signup, /auth/login, /privacy …).
 */
interface WelcomeProps {
  onGetStarted?: () => void;
  onLogin?: () => void;
  onNavigate?: (screen: 'privacy' | 'terms' | 'security') => void;
}

const Welcome: React.FC<WelcomeProps> = () => (
  <SiteLayout>
    <LandingPage />
  </SiteLayout>
);

export default Welcome;
