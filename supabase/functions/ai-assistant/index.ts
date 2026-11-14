// Supabase Edge Function: ai-assistant (Deno).
// Env: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (provided by Supabase),
//      GEMINI_API_KEY, GEMINI_MODEL (default gemini-3.5-flash-lite; backups in handler.ts), SITE_URL,
//      GEMINI_THINKING_LEVEL (Gemini 3+: minimal|low|medium|high, default low),
//      AI_PROVIDER=mock for deterministic local testing without a key, AI_RATE_PER_MINUTE (default 10).
//      AI credits (off unless AI_CREDITS_ENABLED=true and supabase/migrations/20261114000200_ai_credits.sql is applied):
//      KELVIQ_SERVER_API_KEY + KELVIQ_ENV for automatic top-ups (POST /charges/).
import { createHandler } from './handler.ts';

type DenoLike = {
    env: { get(name: string): string | undefined };
    serve(handler: (req: Request) => Response | Promise<Response>): unknown;
};
const runtime = (globalThis as unknown as { Deno: DenoLike }).Deno;
const edgeRuntime = (globalThis as unknown as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;

runtime.serve(createHandler(
    { get: (name: string) => runtime.env.get(name) },
    {
        fetch: (input, init) => fetch(input, init),
        // automatic AI-credit top-up after the answer keeps running once the response is sent
        ...(typeof edgeRuntime?.waitUntil === 'function' ? { waitUntil: (p: Promise<unknown>) => edgeRuntime.waitUntil!(p) } : {}),
    },
));
