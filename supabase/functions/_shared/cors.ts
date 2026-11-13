// CORS for browser-called functions. Reflects the request Origin only when it is allow-listed:
// SITE_URL (and its www / non-www twin) plus the local dev origins.

const LOCAL_ORIGINS = ['http://localhost:3010', 'http://127.0.0.1:3010'];

function siteOrigins(): string[] {
  const raw = (Deno.env.get('SITE_URL') || 'https://www.contractordocs.app').trim();
  const out = new Set<string>();
  for (const value of raw.split(',').map((s) => s.trim()).filter(Boolean)) {
    try {
      const u = new URL(value);
      out.add(u.origin);
      const twin = u.hostname.startsWith('www.') ? u.hostname.slice(4) : `www.${u.hostname}`;
      out.add(`${u.protocol}//${twin}${u.port ? `:${u.port}` : ''}`);
    } catch { /* ignore malformed entries */ }
  }
  return [...out];
}

export function allowedOrigins(): string[] {
  return [...siteOrigins(), ...LOCAL_ORIGINS];
}

export function isAllowedOrigin(origin: string | null | undefined): boolean {
  return !!origin && allowedOrigins().includes(origin);
}

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin');
  const allowed = isAllowedOrigin(origin) ? origin! : siteOrigins()[0] || LOCAL_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

export function preflight(req: Request): Response | null {
  if (req.method !== 'OPTIONS') return null;
  return new Response(null, { status: 204, headers: corsHeaders(req) });
}

export function json(req: Request | null, body: unknown, status = 200): Response {
  const headers: Record<string, string> = { 'Content-Type': 'application/json; charset=utf-8' };
  if (req) Object.assign(headers, corsHeaders(req));
  return new Response(JSON.stringify(body), { status, headers });
}
