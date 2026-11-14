import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { NEEDS_CONNECTION, isBrowserOffline, offlineAwareFetch } from './offline/connection.ts';

/**
 * The ONE Supabase client for the whole app.
 * Configure with VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (see .env.example).
 */
// `import.meta.env` is undefined outside Vite (e.g. `npx tsx` checks), so read it defensively.
const env: Record<string, string | undefined> = ((import.meta as any).env || {}) as Record<string, string | undefined>;
/**
 * Production project (the original ContractorDocs database, "supabase-yellow-elephant").
 * The anon key is a PUBLIC, browser-safe key (row-level security protects the data); it is the same key the
 * original app shipped with. VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY override both (local dev, previews).
 */
const PRODUCTION_SUPABASE_URL = 'https://iauteblvljppwzsxloyd.supabase.co';
const PRODUCTION_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlhdXRlYmx2bGpwcHd6c3hsb3lkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA1OTk0MTIsImV4cCI6MjA3NjE3NTQxMn0.W2Xu9TuO6odsnF5eK7iLPqV4KB0wVWXzmM2ofnKZw70';

const envUrl = env.VITE_SUPABASE_URL?.trim();
const envKey = env.VITE_SUPABASE_ANON_KEY?.trim();
// Use the env pair only when both are set, so a URL is never combined with another project's key.
const useEnv = Boolean(envUrl && envKey);
const url = useEnv ? envUrl : PRODUCTION_SUPABASE_URL;
const anonKey = useEnv ? envKey : PRODUCTION_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabase: SupabaseClient = createClient(
  url || 'http://127.0.0.1:54321',
  anonKey || 'missing-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'contractordocs-auth',
    },
    // offline: requests fail at once with "You're offline: this needs a connection …" (online: the browser's fetch)
    global: { fetch: offlineAwareFetch },
  },
);

export const SUPABASE_URL = url || '';
export const SUPABASE_FUNCTIONS_URL = url ? `${url.replace(/\/$/, '')}/functions/v1` : '';

/** Calls an edge function with the current user's JWT. Throws on non-2xx with the server's message. */
export async function invokeFunction<T = unknown>(name: string, body?: unknown): Promise<T> {
  if (isBrowserOffline()) throw new Error(NEEDS_CONNECTION);
  const { data, error } = await supabase.functions.invoke(name, { body: body as any });
  if (error) {
    // the request never reached the server (connection lost on the way)
    if ((error as any)?.name === 'FunctionsFetchError') {
      throw new Error(isBrowserOffline() ? NEEDS_CONNECTION : 'Could not reach the server. Check your connection and try again.');
    }
    let message = error.message || `Request to ${name} failed`;
    try {
      const ctx: any = (error as any).context;
      if (ctx && typeof ctx.json === 'function') {
        const payload = await ctx.json();
        if (payload?.error) message = payload.error;
      }
    } catch { /* ignore */ }
    throw new Error(message);
  }
  return data as T;
}
