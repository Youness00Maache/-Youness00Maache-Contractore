/**
 * "Needs a connection": the one message for actions that can't work offline (no imports: lib/supabase.ts uses it).
 *
 * offlineAwareFetch is the Supabase client's fetch: while the browser is offline a request fails at once with that
 * message (instead of a raw "TypeError: Failed to fetch"), so every screen that shows a request's error says it
 * plainly. Online it is the browser's fetch, unchanged. The offline outbox treats it as "no connection" (the item
 * stays pending): lib/offline/outboxModel.ts isNetworkError matches "you're offline".
 */
export const NEEDS_CONNECTION = "You're offline. This needs a connection; try again when you're back online.";

export const isBrowserOffline = (): boolean => typeof navigator !== 'undefined' && navigator.onLine === false;

/** Is this the offline refusal (or a message that already says so)? */
export const isNeedsConnectionMessage = (message: unknown): boolean =>
    /you'?re offline\W+this needs a connection/i.test(String(message ?? ''));

const NETWORK_RE = /failed to fetch|networkerror|load failed|network request failed|err_internet_disconnected|failed to send a request to the edge function/i;

/**
 * The sentence to show for an error that is about the connection (null: it isn't). Offline it is always
 * NEEDS_CONNECTION; online a dropped request reads as a plain network error. Used by the app's error helpers
 * (describeError, friendlyError, getErrorMessage), so no screen shows a raw "TypeError: Failed to fetch".
 */
export const connectionProblem = (message: unknown): string | null => {
    const msg = String(message ?? '');
    if (isNeedsConnectionMessage(msg)) return NEEDS_CONNECTION;
    if (!NETWORK_RE.test(msg)) return null;
    return isBrowserOffline() ? NEEDS_CONNECTION : 'Network error. Check your connection and try again.';
};

/**
 * The message of a thrown value as before, except connection failures: those read as NEEDS_CONNECTION offline (or a
 * plain network error online). For screens that showed `err.message` as it is.
 */
export const errorText = (error: unknown, fallback: string): string => {
    const msg = typeof error === 'string' ? error : String((error as { message?: unknown } | null)?.message || '');
    return connectionProblem(msg) ?? (msg || fallback);
};

/**
 * The error thrown for a request made offline: its message is NEEDS_CONNECTION (storage and auth errors show the
 * message; database errors show "Offline: <message>"; the app's error helpers turn both into NEEDS_CONNECTION).
 */
export const offlineRequestError = (): Error => {
    const error = new Error(NEEDS_CONNECTION);
    error.name = 'Offline';
    return error;
};

export const offlineAwareFetch: typeof fetch = (input, init) => {
    if (isBrowserOffline()) return Promise.reject(offlineRequestError());
    return fetch(input, init);
};
