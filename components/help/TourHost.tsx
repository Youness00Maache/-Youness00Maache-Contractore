/**
 * Runs the first-run app tour (AppTour.tsx) on the dashboard:
 *   - once per user: "seen" lives in the account (user_settings 'help.tour'), with a device copy;
 *   - again whenever asked (Help & tutorials page, dashboard help panel: helpNav.requestAppTour()).
 * Mounted once by App.tsx. Waits until the dashboard has rendered and no other dialog is open.
 */
import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { loadAppTourSeen, saveAppTourSeen } from '../../lib/userData.ts';
import { TOUR_EVENT, takeTourRequest } from './helpNav.ts';

const AppTour = lazy(() => import('./AppTour.tsx'));

const otherDialogOpen = () => !!document.querySelector('[role="dialog"][aria-modal="true"]');
const dashboardReady = () => !!document.querySelector('section[aria-labelledby="jobs-heading"], #jobs-heading');

const TourHost: React.FC<{ userId: string | null; onDashboard: boolean }> = ({ userId, onDashboard }) => {
  const [running, setRunning] = useState(false);
  const [pending, setPending] = useState(false);
  const checkedFor = useRef<string | null>(null);

  // Replays asked for from anywhere.
  useEffect(() => {
    if (takeTourRequest()) setPending(true);
    const onAsk = () => { takeTourRequest(); setPending(true); };
    window.addEventListener(TOUR_EVENT, onAsk);
    return () => window.removeEventListener(TOUR_EVENT, onAsk);
  }, []);

  // First run: ask the account once per user and page load.
  useEffect(() => {
    if (!userId || !onDashboard || checkedFor.current === userId) return;
    checkedFor.current = userId;
    let cancelled = false;
    loadAppTourSeen(userId).then((seen) => { if (!cancelled && seen === false) setPending(true); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [userId, onDashboard]);

  // Start once the dashboard is on screen and nothing else is open.
  useEffect(() => {
    if (!pending || running || !onDashboard) return;
    let tries = 0;
    let timer = 0;
    const attempt = () => {
      if (dashboardReady() && !otherDialogOpen()) { setPending(false); setRunning(true); return; }
      if (++tries < 40) timer = window.setTimeout(attempt, 750);
    };
    timer = window.setTimeout(attempt, 700);
    return () => window.clearTimeout(timer);
  }, [pending, running, onDashboard]);

  // Leaving the dashboard (Back button) ends the tour without marking it seen.
  useEffect(() => { if (!onDashboard && running) setRunning(false); }, [onDashboard, running]);

  if (!running) return null;
  return (
    <Suspense fallback={null}>
      <AppTour onClose={() => { setRunning(false); if (userId) void saveAppTourSeen(userId); }} />
    </Suspense>
  );
};

export default TourHost;
