/**
 * App-side helpers for the help system: replaying the first-run tour from anywhere, and opening a screen
 * from a guide (a "#section" scrolls to that Settings section once it has rendered).
 */
export const TOUR_EVENT = 'cd:start-app-tour';

let tourRequested = false;

/** Asks the tour host to start the tour (it runs on the dashboard; the caller navigates there). */
export const requestAppTour = (): void => {
  tourRequested = true;
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(TOUR_EVENT));
};

/** Read once by the tour host; true when a replay was asked for. */
export const takeTourRequest = (): boolean => {
  const r = tourRequested;
  tourRequested = false;
  return r;
};

/** Opens an app path from a guide. `/settings#reminders` scrolls to `settings-reminders` after Settings renders. */
export const openAppPath = (navigate: (to: string) => void, path: string): void => {
  const [route, hash] = path.split('#');
  navigate(hash ? `${route}#${hash}` : route);
  if (!hash || typeof window === 'undefined') return;
  let tries = 0;
  const tick = () => {
    const el = document.getElementById(`settings-${hash}`) || document.getElementById(hash);
    if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    if (++tries < 25) window.setTimeout(tick, 120);
  };
  window.setTimeout(tick, 80);
};
