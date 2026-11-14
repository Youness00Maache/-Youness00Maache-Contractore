/**
 * Crew link paths. Tiny on purpose: index.tsx imports it to route /clock/<token> before any app code loads.
 */
export const CREW_TOKEN_RE = /^[A-Za-z0-9_-]{40}$/;
export const CREW_PATH_PREFIX = '/clock/';

export const isCrewToken = (v: unknown): v is string => typeof v === 'string' && CREW_TOKEN_RE.test(v);

/** "/clock/<token>" → token; null when the path is not a crew link; '' when it is one but malformed. */
export const crewTokenFromPath = (pathname: string): string | null => {
    let p = pathname || '';
    try { p = decodeURIComponent(p); } catch { /* keep raw */ }
    if (!p.toLowerCase().startsWith(CREW_PATH_PREFIX)) return null;
    const rest = p.slice(CREW_PATH_PREFIX.length).replace(/\/+$/, '').trim();
    if (!rest || rest.includes('/')) return '';
    return isCrewToken(rest) ? rest : '';
};
