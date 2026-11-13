import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * The ONE Supabase client for the whole app.
 * Configure with VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (see .env.example).
 */
// `import.meta.env` is undefined outside Vite (e.g. `npx tsx` checks), so read it defensively.
const env: Record<string, string | undefined> = ((import.meta as any).env || {}) as Record<string, string | undefined>;
const url = env.VITE_SUPABASE_URL?.trim();
const anonKey = env.VITE_SUPABASE_ANON_KEY?.trim();

export const isSupabaseConfigured = Boolean(url && anonKey);

if (!isSupabaseConfigured && typeof window !== 'undefined') {
  // eslint-disable-next-line no-console
  console.error('[ContractorDocs] Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
}

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
  },
);

export const SUPABASE_URL = url || '';
export const SUPABASE_FUNCTIONS_URL = url ? `${url.replace(/\/$/, '')}/functions/v1` : '';

/** Calls an edge function with the current user's JWT. Throws on non-2xx with the server's message. */
export async function invokeFunction<T = unknown>(name: string, body?: unknown): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body: body as any });
  if (error) {
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
