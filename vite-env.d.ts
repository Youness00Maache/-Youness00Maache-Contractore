/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_SITE_URL?: string;
  readonly VITE_KELVIQ_ENV?: 'live' | 'sandbox';
  readonly VITE_KELVIQ_PRODUCT_ID?: string;
  readonly VITE_KELVIQ_PORTAL_URL?: string;
  readonly VITE_GOOGLE_CLIENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
