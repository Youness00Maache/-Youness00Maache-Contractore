/**
 * Feedback link paths (roadmap D8). Tiny on purpose, like lib/crew/crewPath.ts: index.tsx can route
 * /feedback/<token> to the public feedback page before any app code loads (the UI phase wires it next to
 * requestSlugFromPath / crewTokenFromPath).
 *
 *   FEEDBACK_PATH_PREFIX                 '/feedback/'
 *   isFeedbackToken(v)                   43-char url-safe tokens from the database (accepts 32-128 like portal keys)
 *   feedbackTokenFromPath(pathname)      token | '' (a feedback path, malformed) | null (not a feedback path)
 *   feedbackRequestUrl(origin, token)    'https://site/feedback/<token>'
 */
export const FEEDBACK_TOKEN_RE = /^[A-Za-z0-9_-]{32,128}$/;
export const FEEDBACK_PATH_PREFIX = '/feedback/';

export const isFeedbackToken = (v: unknown): v is string => typeof v === 'string' && FEEDBACK_TOKEN_RE.test(v);

export const feedbackTokenFromPath = (pathname: string): string | null => {
    let p = pathname || '';
    try { p = decodeURIComponent(p); } catch { /* keep raw */ }
    if (!p.toLowerCase().startsWith(FEEDBACK_PATH_PREFIX)) return null;
    const rest = p.slice(FEEDBACK_PATH_PREFIX.length).replace(/\/+$/, '').trim();
    if (!rest || rest.includes('/')) return '';
    return isFeedbackToken(rest) ? rest : '';
};

export const feedbackRequestUrl = (origin: string, token: string): string =>
    `${String(origin || '').replace(/\/+$/, '')}${FEEDBACK_PATH_PREFIX}${encodeURIComponent(token)}`;
