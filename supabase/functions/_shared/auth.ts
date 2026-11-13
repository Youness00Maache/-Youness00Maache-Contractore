// Auth helpers for edge functions.
//  - getUser(req): verifies the caller's Supabase JWT (Authorization: Bearer <access token>) with
//    the Auth server and returns the user, or null. Never trust a user id sent in the body.
//  - serviceClient(): service-role client for server-only writes (bypasses RLS: scope every query!).
import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2';

function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

export function bearerToken(req: Request): string | null {
  const header = req.headers.get('Authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

export async function getUser(req: Request): Promise<User | null> {
  const token = bearerToken(req);
  if (!token) return null;
  const apiKey = Deno.env.get('SUPABASE_ANON_KEY') || env('SUPABASE_SERVICE_ROLE_KEY');
  const client = createClient(env('SUPABASE_URL'), apiKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

let cachedService: SupabaseClient | null = null;
export function serviceClient(): SupabaseClient {
  if (!cachedService) {
    cachedService = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cachedService;
}
