// Supabase Edge Function: master-ai-router (Deno).
// Env: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (provided by Supabase),
//      GEMINI_API_KEY, GEMINI_MODEL (default gemini-flash-latest), SITE_URL,
//      AI_PROVIDER=mock for deterministic local testing without a key, AI_RATE_PER_MINUTE (default 10).
import { createHandler } from './handler.ts';

type DenoLike = {
    env: { get(name: string): string | undefined };
    serve(handler: (req: Request) => Response | Promise<Response>): unknown;
};
const runtime = (globalThis as unknown as { Deno: DenoLike }).Deno;

runtime.serve(createHandler(
    { get: (name: string) => runtime.env.get(name) },
    { fetch: (input, init) => fetch(input, init) },
));
