-- =============================================================================
-- ContractorDocs: consolidated, idempotent baseline schema (PROPOSAL)
-- Source: PROJECT_AUDIT/06_database_security_build_infra.md
--
-- Replaces: the SQL string embedded in App.tsx (SQL_SETUP_SCRIPT), supabase_setup.sql,
-- supabase_ai_schema.sql, persistent_tracking.sql, create_user_credentials.sql,
-- create_user_gmail_accounts.sql, SQL_*.sql, FIX_ASSEMBLIES.sql,
-- supabase/egress_optimization_indexes.sql.
--
-- HOW TO USE
--   1. Take a backup first (Dashboard > Database > Backups, or pg_dump).
--   2. Run PART A on a staging copy, then on production. PART A is safe to run
--      before any frontend change: it keeps every column, RPC name and argument
--      list the current frontend uses.
--   3. PART B changes what the browser can read or write. Deploy the frontend
--      changes listed in the audit (section "Fix" of SEC-001 / SEC-012) FIRST,
--      then run PART B.
--   4. Save this file as supabase/migrations/<timestamp>_baseline.sql so there is
--      one source of truth, and delete the SQL string from App.tsx.
--
-- Everything is wrapped in a transaction: if any statement fails, nothing changes.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- PART A.0  Extensions and helpers
-- -----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- PART A.1  Tables and columns (CREATE IF NOT EXISTS + ADD COLUMN IF NOT EXISTS)
-- -----------------------------------------------------------------------------

-- profiles ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE
);
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email                 text,
  ADD COLUMN IF NOT EXISTS name                  text,
  ADD COLUMN IF NOT EXISTS company_name          text,
  ADD COLUMN IF NOT EXISTS logo_url              text,
  ADD COLUMN IF NOT EXISTS profile_picture_url   text,
  ADD COLUMN IF NOT EXISTS address               text,
  ADD COLUMN IF NOT EXISTS phone                 text,
  ADD COLUMN IF NOT EXISTS website               text,
  ADD COLUMN IF NOT EXISTS job_title             text,
  ADD COLUMN IF NOT EXISTS subscription_tier     text    DEFAULT 'Basic',
  ADD COLUMN IF NOT EXISTS subscription_status   text,               -- written by paypal-webhook, was never created
  ADD COLUMN IF NOT EXISTS paypal_subscription_id text,              -- lets the webhook map PAYMENT.SALE.* events
  ADD COLUMN IF NOT EXISTS language              text    DEFAULT 'English',
  ADD COLUMN IF NOT EXISTS email_templates       jsonb   DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS theme                 text,
  ADD COLUMN IF NOT EXISTS email_usage           integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS email_usage_month     text,
  ADD COLUMN IF NOT EXISTS ai_credits_remaining  integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ai_addon_active       boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS gmail_access_token    text,   -- LEGACY: still read by App.tsx:1470. Dropped in PART B.
  ADD COLUMN IF NOT EXISTS gmail_refresh_token   text,   -- LEGACY: idem.
  ADD COLUMN IF NOT EXISTS updated_at            timestamptz DEFAULT now();

-- clients ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.clients (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       text NOT NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS email      text,
  ADD COLUMN IF NOT EXISTS phone      text,
  ADD COLUMN IF NOT EXISTS address    text,
  ADD COLUMN IF NOT EXISTS notes      text,
  ADD COLUMN IF NOT EXISTS portal_key text DEFAULT encode(extensions.gen_random_bytes(16), 'hex');
UPDATE public.clients SET portal_key = encode(extensions.gen_random_bytes(16), 'hex') WHERE portal_key IS NULL;

-- jobs -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.jobs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       text NOT NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS client_name    text,
  ADD COLUMN IF NOT EXISTS client_address text,
  ADD COLUMN IF NOT EXISTS start_date     date,
  ADD COLUMN IF NOT EXISTS end_date       date,
  ADD COLUMN IF NOT EXISTS status         text DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS worker_name    text;               -- used by App.tsx:1576/2061, never created before

-- documents --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.documents (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id     uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  type       text NOT NULL,
  data       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS public_token uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS updated_at   timestamptz DEFAULT now();
UPDATE public.documents SET public_token = gen_random_uuid() WHERE public_token IS NULL;
-- Cheap boolean for list views so the base64 signature image is not shipped in every row (DB-005).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'documents' AND column_name = 'has_client_signature') THEN
    ALTER TABLE public.documents
      ADD COLUMN has_client_signature boolean
      GENERATED ALWAYS AS (coalesce(data->>'clientSignatureUrl', '') <> '') STORED;
  END IF;
END $$;

-- price book -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.price_book_categories (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  parent_id  uuid REFERENCES public.price_book_categories(id) ON DELETE CASCADE,
  user_id    uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.saved_items (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       text NOT NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.saved_items
  ADD COLUMN IF NOT EXISTS description    text,
  ADD COLUMN IF NOT EXISTS rate           numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unit_cost      numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS category       text    DEFAULT 'General',
  ADD COLUMN IF NOT EXISTS category_id    uuid REFERENCES public.price_book_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS type           text    DEFAULT 'service',
  ADD COLUMN IF NOT EXISTS images         jsonb   DEFAULT '[]'::jsonb,  -- no-op if an older TEXT[] column exists
  ADD COLUMN IF NOT EXISTS taxable        boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS sku            text,
  ADD COLUMN IF NOT EXISTS markup         numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_assembly    boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS assembly_items jsonb   DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS is_favorite    boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_used_at   timestamptz,
  ADD COLUMN IF NOT EXISTS use_count      integer DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.price_history (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id    uuid REFERENCES public.saved_items(id) ON DELETE CASCADE,
  old_price  numeric, new_price numeric, old_cost numeric, new_cost numeric,
  changed_at timestamptz DEFAULT now(),
  changed_by uuid REFERENCES auth.users(id)
);

CREATE TABLE IF NOT EXISTS public.item_vendors (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id        uuid REFERENCES public.saved_items(id) ON DELETE CASCADE,
  vendor_name    text NOT NULL,
  vendor_sku     text,
  vendor_price   numeric,
  lead_time_days integer,
  is_preferred   boolean DEFAULT false,
  last_updated   timestamptz DEFAULT now(),
  user_id        uuid REFERENCES auth.users(id) ON DELETE CASCADE
);

-- assembly_components: SQL_ASSEMBLIES_FEATURE.sql used component_id, FIX_ASSEMBLIES.sql used
-- component_item_id. Converge on component_item_id (the name the SQL function uses).
CREATE TABLE IF NOT EXISTS public.assembly_components (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assembly_id       uuid NOT NULL REFERENCES public.saved_items(id) ON DELETE CASCADE,
  component_item_id uuid REFERENCES public.saved_items(id) ON DELETE RESTRICT,
  quantity          numeric NOT NULL DEFAULT 1,
  override_price    numeric,
  created_at        timestamptz DEFAULT now()
);
ALTER TABLE public.assembly_components ADD COLUMN IF NOT EXISTS component_item_id uuid REFERENCES public.saved_items(id) ON DELETE RESTRICT;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'assembly_components' AND column_name = 'component_id') THEN
    EXECUTE 'UPDATE public.assembly_components SET component_item_id = component_id WHERE component_item_id IS NULL';
    EXECUTE 'ALTER TABLE public.assembly_components ALTER COLUMN component_id DROP NOT NULL';
  END IF;
END $$;

-- inventory --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inventory (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       text NOT NULL,
  quantity   integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.inventory
  ADD COLUMN IF NOT EXISTS category            text,
  ADD COLUMN IF NOT EXISTS unit                text,
  ADD COLUMN IF NOT EXISTS cost_price          numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS supplier            text,
  ADD COLUMN IF NOT EXISTS location            text,
  ADD COLUMN IF NOT EXISTS low_stock_threshold integer DEFAULT 5,
  ADD COLUMN IF NOT EXISTS is_assembly         boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS assembly_items      jsonb   DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS public.inventory_history (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id         uuid NOT NULL REFERENCES public.inventory(id) ON DELETE CASCADE,
  action          text NOT NULL,
  quantity_change integer NOT NULL,
  notes           text,
  job_id          uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  created_at      timestamptz DEFAULT now()
);

-- AI ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_chat_history (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title      text NOT NULL,
  messages   jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.ai_chat_history
  ADD COLUMN IF NOT EXISTS scope    text DEFAULT 'dashboard',
  ADD COLUMN IF NOT EXISTS scope_id text;

CREATE TABLE IF NOT EXISTS public.ai_generated_documents (   -- defined in supabase_ai_schema.sql, unused by code
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  document_type  text NOT NULL,
  document_name  text NOT NULL,
  template_style text NOT NULL,
  form_payload   jsonb NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- Google credentials -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_credentials (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider      text NOT NULL,
  access_token  text NOT NULL,
  refresh_token text,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now(),
  UNIQUE (user_id, provider)
);
ALTER TABLE public.user_credentials ADD COLUMN IF NOT EXISTS expires_at timestamptz;
DROP TRIGGER IF EXISTS tr_user_credentials_updated_at ON public.user_credentials;
CREATE TRIGGER tr_user_credentials_updated_at
  BEFORE UPDATE ON public.user_credentials
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- user_gmail_accounts: App.tsx created it with column "email"; create_user_gmail_accounts.sql and
-- the code (gmail-auth, CommunicationView, batchEmailSender) use "gmail_address". Converge.
CREATE TABLE IF NOT EXISTS public.user_gmail_accounts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gmail_address text,
  refresh_token text,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);
ALTER TABLE public.user_gmail_accounts
  ADD COLUMN IF NOT EXISTS gmail_address text,
  ADD COLUMN IF NOT EXISTS refresh_token text,
  ADD COLUMN IF NOT EXISTS updated_at    timestamptz DEFAULT now();
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'user_gmail_accounts' AND column_name = 'email') THEN
    EXECUTE 'UPDATE public.user_gmail_accounts SET gmail_address = email WHERE gmail_address IS NULL';
    EXECUTE 'ALTER TABLE public.user_gmail_accounts ALTER COLUMN email DROP NOT NULL';
  END IF;
END $$;
-- gmail-auth upserts without refresh_token when Google does not return one: must be nullable.
ALTER TABLE public.user_gmail_accounts ALTER COLUMN refresh_token DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS user_gmail_accounts_user_gmail_key
  ON public.user_gmail_accounts (user_id, gmail_address);
DROP TRIGGER IF EXISTS tr_user_gmail_accounts_updated_at ON public.user_gmail_accounts;
CREATE TRIGGER tr_user_gmail_accounts_updated_at
  BEFORE UPDATE ON public.user_gmail_accounts
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Forum and notifications (used by components/ForumView.tsx, never defined in any SQL file).
-- FKs point at public.profiles so PostgREST embeds like profiles:user_id(name, ...) resolve.
CREATE TABLE IF NOT EXISTS public.forum_posts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title       text NOT NULL,
  content     text,
  category    text,
  image_url   text,
  youtube_url text,
  upvotes     integer NOT NULL DEFAULT 0,
  downvotes   integer NOT NULL DEFAULT 0,
  created_at  timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.forum_comments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    uuid NOT NULL REFERENCES public.forum_posts(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content    text,
  image_url  text,
  upvotes    integer NOT NULL DEFAULT 0,
  downvotes  integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.forum_votes (
  post_id   uuid NOT NULL REFERENCES public.forum_posts(id) ON DELETE CASCADE,
  user_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  vote_type text NOT NULL CHECK (vote_type IN ('up', 'down')),
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);
CREATE TABLE IF NOT EXISTS public.forum_comment_votes (
  comment_id uuid NOT NULL REFERENCES public.forum_comments(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  vote_type  text NOT NULL CHECK (vote_type IN ('up', 'down')),
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (comment_id, user_id)
);
CREATE TABLE IF NOT EXISTS public.notifications (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  source_user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  type           text NOT NULL,
  post_id        uuid REFERENCES public.forum_posts(id) ON DELETE CASCADE,
  is_read        boolean NOT NULL DEFAULT false,
  created_at     timestamptz DEFAULT now()
);
-- ForumView upserts with onConflict 'post_id, user_id' / 'comment_id, user_id': needs a unique key
-- even if the tables pre-exist with a surrogate id.
CREATE UNIQUE INDEX IF NOT EXISTS forum_votes_post_user_key         ON public.forum_votes (post_id, user_id);
CREATE UNIQUE INDEX IF NOT EXISTS forum_comment_votes_comment_user_key ON public.forum_comment_votes (comment_id, user_id);

-- -----------------------------------------------------------------------------
-- PART A.2  Indexes (all filters/orders used by the frontend)
-- -----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS documents_public_token_key ON public.documents (public_token);
CREATE UNIQUE INDEX IF NOT EXISTS clients_portal_key_key     ON public.clients (portal_key);
CREATE INDEX IF NOT EXISTS idx_documents_user_created_at     ON public.documents (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_documents_user_job_created_at ON public.documents (user_id, job_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_documents_job_id              ON public.documents (job_id);           -- FK, ON DELETE CASCADE from jobs
CREATE INDEX IF NOT EXISTS idx_documents_user_client_name    ON public.documents (user_id, (data->>'clientName'));
CREATE INDEX IF NOT EXISTS idx_jobs_user_created_at          ON public.jobs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_user_client_name         ON public.jobs (user_id, client_name);
CREATE INDEX IF NOT EXISTS idx_clients_user_name             ON public.clients (user_id, name);
CREATE INDEX IF NOT EXISTS idx_inventory_user_name           ON public.inventory (user_id, name);
CREATE INDEX IF NOT EXISTS idx_inventory_history_user_created_at ON public.inventory_history (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_history_item        ON public.inventory_history (item_id);
CREATE INDEX IF NOT EXISTS idx_saved_items_user_name         ON public.saved_items (user_id, name);
CREATE INDEX IF NOT EXISTS idx_saved_items_favorites         ON public.saved_items (user_id, is_favorite) WHERE is_favorite = true;
CREATE INDEX IF NOT EXISTS idx_saved_items_last_used         ON public.saved_items (user_id, last_used_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_price_history_item            ON public.price_history (item_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_item_vendors_item             ON public.item_vendors (item_id);
CREATE INDEX IF NOT EXISTS idx_assembly_components_assembly  ON public.assembly_components (assembly_id);
CREATE INDEX IF NOT EXISTS idx_ai_chat_history_user_created  ON public.ai_chat_history (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_chat_history_user_scope    ON public.ai_chat_history (user_id, scope, scope_id);
CREATE INDEX IF NOT EXISTS idx_forum_posts_category_created  ON public.forum_posts (category, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_forum_posts_user              ON public.forum_posts (user_id);
CREATE INDEX IF NOT EXISTS idx_forum_comments_post           ON public.forum_comments (post_id);
CREATE INDEX IF NOT EXISTS idx_forum_votes_user              ON public.forum_votes (user_id);
CREATE INDEX IF NOT EXISTS idx_forum_comment_votes_user      ON public.forum_comment_votes (user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread     ON public.notifications (user_id, is_read, created_at DESC);

-- -----------------------------------------------------------------------------
-- PART A.3  Row Level Security: reset every app table to a known set of policies.
-- Old policies with other names (for example a permissive "anyone can update forum
-- posts" policy created by hand) would otherwise stay active, because permissive
-- policies are OR-ed together.
-- NOTE: the profiles SELECT policy stays permissive here (forum needs author names)
-- and is tightened in PART B.
-- -----------------------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT policyname, tablename FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('profiles','clients','jobs','documents','saved_items','price_book_categories',
                        'price_history','item_vendors','assembly_components','inventory','inventory_history',
                        'ai_chat_history','ai_generated_documents','user_credentials','user_gmail_accounts',
                        'forum_posts','forum_comments','forum_votes','forum_comment_votes','notifications')
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

ALTER TABLE public.profiles               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_items            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_book_categories  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_history          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_vendors           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assembly_components    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_history      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_chat_history        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_generated_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_credentials       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_gmail_accounts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_posts            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_comments         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_votes            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_comment_votes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications          ENABLE ROW LEVEL SECURITY;

-- profiles (interim: any signed-in user can read rows, needed by forum author embeds; see PART B)
CREATE POLICY profiles_select_authenticated ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY profiles_insert_own ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY profiles_update_own ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- Owner-only tables (user_id column)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['clients','jobs','documents','saved_items','price_book_categories','item_vendors',
                           'inventory','inventory_history','ai_chat_history','ai_generated_documents',
                           'user_credentials','user_gmail_accounts']
  LOOP
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())',
                   t || '_owner_all', t);
  END LOOP;
END $$;

-- documents.job_id must belong to the same user (stops attaching rows to someone else's job)
CREATE OR REPLACE FUNCTION public.enforce_document_job_owner()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = NEW.job_id AND j.user_id = NEW.user_id) THEN
    RAISE EXCEPTION 'job % does not belong to user %', NEW.job_id, NEW.user_id USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_documents_job_owner ON public.documents;
CREATE TRIGGER trg_documents_job_owner BEFORE INSERT OR UPDATE OF job_id, user_id ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.enforce_document_job_owner();

-- price_history: owned through changed_by
CREATE POLICY price_history_select_own ON public.price_history FOR SELECT TO authenticated USING (changed_by = auth.uid());
CREATE POLICY price_history_insert_own ON public.price_history FOR INSERT TO authenticated WITH CHECK (changed_by = auth.uid());

-- assembly_components: both sides must be the caller's items
CREATE POLICY assembly_components_owner_all ON public.assembly_components FOR ALL TO authenticated
  USING (assembly_id IN (SELECT id FROM public.saved_items WHERE user_id = auth.uid()))
  WITH CHECK (assembly_id IN (SELECT id FROM public.saved_items WHERE user_id = auth.uid())
          AND (component_item_id IS NULL OR component_item_id IN (SELECT id FROM public.saved_items WHERE user_id = auth.uid())));

-- forum: everyone signed in can read; only authors can change their own rows
CREATE POLICY forum_posts_select    ON public.forum_posts FOR SELECT TO authenticated USING (true);
CREATE POLICY forum_posts_insert    ON public.forum_posts FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY forum_posts_update    ON public.forum_posts FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY forum_posts_delete    ON public.forum_posts FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE POLICY forum_comments_select ON public.forum_comments FOR SELECT TO authenticated USING (true);
CREATE POLICY forum_comments_insert ON public.forum_comments FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY forum_comments_update ON public.forum_comments FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY forum_comments_delete ON public.forum_comments FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE POLICY forum_votes_own         ON public.forum_votes         FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY forum_comment_votes_own ON public.forum_comment_votes FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY notifications_select_own ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY notifications_update_own ON public.notifications FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY notifications_delete_own ON public.notifications FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE POLICY notifications_insert_as_source ON public.notifications FOR INSERT TO authenticated WITH CHECK (source_user_id = auth.uid());

-- Vote counters are maintained by the database. The browser's own writes to
-- upvotes/downvotes (ForumView.tsx:358 and :385) are ignored instead of rejected,
-- so the current frontend keeps working.
CREATE OR REPLACE FUNCTION public.guard_vote_counters()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    NEW.upvotes := OLD.upvotes;
    NEW.downvotes := OLD.downvotes;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_forum_posts_guard_counters ON public.forum_posts;
CREATE TRIGGER trg_forum_posts_guard_counters BEFORE UPDATE ON public.forum_posts
  FOR EACH ROW EXECUTE FUNCTION public.guard_vote_counters();
DROP TRIGGER IF EXISTS trg_forum_comments_guard_counters ON public.forum_comments;
CREATE TRIGGER trg_forum_comments_guard_counters BEFORE UPDATE ON public.forum_comments
  FOR EACH ROW EXECUTE FUNCTION public.guard_vote_counters();

CREATE OR REPLACE FUNCTION public.recount_post_votes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_post uuid := coalesce(NEW.post_id, OLD.post_id);
BEGIN
  UPDATE public.forum_posts p SET
    upvotes   = (SELECT count(*) FROM public.forum_votes v WHERE v.post_id = v_post AND v.vote_type = 'up'),
    downvotes = (SELECT count(*) FROM public.forum_votes v WHERE v.post_id = v_post AND v.vote_type = 'down')
  WHERE p.id = v_post;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_forum_votes_recount ON public.forum_votes;
CREATE TRIGGER trg_forum_votes_recount AFTER INSERT OR UPDATE OR DELETE ON public.forum_votes
  FOR EACH ROW EXECUTE FUNCTION public.recount_post_votes();

CREATE OR REPLACE FUNCTION public.recount_comment_votes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_comment uuid := coalesce(NEW.comment_id, OLD.comment_id);
BEGIN
  UPDATE public.forum_comments c SET
    upvotes   = (SELECT count(*) FROM public.forum_comment_votes v WHERE v.comment_id = v_comment AND v.vote_type = 'up'),
    downvotes = (SELECT count(*) FROM public.forum_comment_votes v WHERE v.comment_id = v_comment AND v.vote_type = 'down')
  WHERE c.id = v_comment;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_forum_comment_votes_recount ON public.forum_comment_votes;
CREATE TRIGGER trg_forum_comment_votes_recount AFTER INSERT OR UPDATE OR DELETE ON public.forum_comment_votes
  FOR EACH ROW EXECUTE FUNCTION public.recount_comment_votes();

-- -----------------------------------------------------------------------------
-- PART A.4  Billing and credit columns can only be changed by the server
-- (service_role / postgres). Browser writes to them are silently ignored, so
-- App.tsx:1288 (client-side "upgrade to Premium") stops working by design and the
-- PayPal webhook becomes the only source of truth.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_profile_billing_columns()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    IF TG_OP = 'INSERT' THEN
      NEW.subscription_tier      := 'Basic';
      NEW.subscription_status    := NULL;
      NEW.paypal_subscription_id := NULL;
      NEW.ai_credits_remaining   := 0;
      NEW.ai_addon_active        := false;
    ELSE
      NEW.subscription_tier      := OLD.subscription_tier;
      NEW.subscription_status    := OLD.subscription_status;
      NEW.paypal_subscription_id := OLD.paypal_subscription_id;
      NEW.ai_credits_remaining   := OLD.ai_credits_remaining;
      NEW.ai_addon_active        := OLD.ai_addon_active;
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_profiles_protect_billing ON public.profiles;
CREATE TRIGGER trg_profiles_protect_billing BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_billing_columns();

-- Server-side free-plan limits (mirrors FREE_LIMITS in App.tsx:1285: 6 jobs, 15 clients, 12 docs per month)
-- Deliberately SECURITY INVOKER: current_user must stay 'authenticated' for browser
-- requests (inside a SECURITY DEFINER function current_user is the owner), and RLS
-- already limits the counts to the caller's own rows.
CREATE OR REPLACE FUNCTION public.enforce_free_plan_limits()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_tier text; v_count int; v_limit int;
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;
  SELECT subscription_tier INTO v_tier FROM public.profiles WHERE id = NEW.user_id;
  IF coalesce(v_tier, 'Basic') = 'Premium' THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME = 'jobs' THEN
    v_limit := 6;
    SELECT count(*) INTO v_count FROM public.jobs WHERE user_id = NEW.user_id AND created_at >= date_trunc('month', now());
  ELSIF TG_TABLE_NAME = 'clients' THEN
    v_limit := 15;
    SELECT count(*) INTO v_count FROM public.clients WHERE user_id = NEW.user_id;
  ELSE
    v_limit := 12;
    SELECT count(*) INTO v_count FROM public.documents WHERE user_id = NEW.user_id AND created_at >= date_trunc('month', now());
  END IF;
  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'FREE_PLAN_LIMIT: % limit (%) reached', TG_TABLE_NAME, v_limit USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
-- Enable after checking the numbers match the product rules in checkLimit() (App.tsx:1293):
-- DROP TRIGGER IF EXISTS trg_jobs_free_limit ON public.jobs;
-- CREATE TRIGGER trg_jobs_free_limit BEFORE INSERT ON public.jobs FOR EACH ROW EXECUTE FUNCTION public.enforce_free_plan_limits();
-- DROP TRIGGER IF EXISTS trg_clients_free_limit ON public.clients;
-- CREATE TRIGGER trg_clients_free_limit BEFORE INSERT ON public.clients FOR EACH ROW EXECUTE FUNCTION public.enforce_free_plan_limits();
-- DROP TRIGGER IF EXISTS trg_documents_free_limit ON public.documents;
-- CREATE TRIGGER trg_documents_free_limit BEFORE INSERT ON public.documents FOR EACH ROW EXECUTE FUNCTION public.enforce_free_plan_limits();

-- Atomic AI credit consumption for the process-contractor-ai edge function (service_role only)
CREATE OR REPLACE FUNCTION public.consume_ai_credit(p_user_id uuid)
RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  UPDATE public.profiles
     SET ai_credits_remaining = ai_credits_remaining - 1
   WHERE id = p_user_id AND ai_credits_remaining > 0
  RETURNING ai_credits_remaining;
$$;

-- -----------------------------------------------------------------------------
-- PART A.5  Public portal / approval RPCs (anon-callable). Same names and
-- arguments as before, so PortalView.tsx and DocumentApprovalView.tsx keep working.
-- Changes: only public business fields of the contractor are returned (no tokens),
-- signing checks that the document belongs to that client, signatures cannot be
-- overwritten, errors are raised (the old jsonb {"error"} return made the UI report success).
-- DROP first because older versions returned json/void and CREATE OR REPLACE
-- cannot change a return type (this is why the App.tsx script failed when it was
-- run after supabase_setup.sql).
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_portal_data(text);
DROP FUNCTION IF EXISTS public.sign_document_via_portal(text, uuid, text);
DROP FUNCTION IF EXISTS public.get_document_by_token(uuid);
DROP FUNCTION IF EXISTS public.approve_document_by_token(uuid, text);

CREATE OR REPLACE FUNCTION public._contractor_public_info(p_user_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'name', p.name, 'company_name', p.company_name, 'logo_url', p.logo_url,
    'phone', p.phone, 'email', p.email, 'website', p.website, 'address', p.address)
  FROM public.profiles p WHERE p.id = p_user_id;
$$;

CREATE OR REPLACE FUNCTION public._client_document_ids(p_client_id uuid)
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT d.id
  FROM public.clients c
  JOIN public.documents d ON d.user_id = c.user_id
  LEFT JOIN public.jobs j ON j.id = d.job_id
  WHERE c.id = p_client_id
    AND (d.data->>'clientName' = c.name OR j.client_name = c.name);
$$;

CREATE OR REPLACE FUNCTION public.get_portal_data(p_key text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_client public.clients%ROWTYPE;
BEGIN
  IF p_key IS NULL OR length(p_key) < 32 THEN
    RAISE EXCEPTION 'Invalid portal key' USING ERRCODE = '28000';
  END IF;
  SELECT * INTO v_client FROM public.clients WHERE portal_key = p_key;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid portal key' USING ERRCODE = '28000';
  END IF;
  RETURN jsonb_build_object(
    'client', jsonb_build_object('id', v_client.id, 'name', v_client.name, 'email', v_client.email,
                                 'phone', v_client.phone, 'address', v_client.address),
    'contractor', public._contractor_public_info(v_client.user_id),
    'documents', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', d.id, 'type', d.type, 'data', d.data, 'created_at', d.created_at)
                       ORDER BY d.created_at DESC)
      FROM public.documents d
      WHERE d.id IN (SELECT public._client_document_ids(v_client.id))
    ), '[]'::jsonb));
END $$;

CREATE OR REPLACE FUNCTION public.sign_document_via_portal(p_key text, p_doc_id uuid, p_signature text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_client public.clients%ROWTYPE; v_data jsonb;
BEGIN
  SELECT * INTO v_client FROM public.clients WHERE portal_key = p_key;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid portal key' USING ERRCODE = '28000'; END IF;
  IF p_doc_id NOT IN (SELECT public._client_document_ids(v_client.id)) THEN
    RAISE EXCEPTION 'Document not found' USING ERRCODE = 'P0002';
  END IF;
  IF p_signature IS NULL OR p_signature !~ '^data:image/(png|jpeg);base64,[A-Za-z0-9+/=]+$' OR length(p_signature) > 400000 THEN
    RAISE EXCEPTION 'Invalid signature image' USING ERRCODE = '22023';
  END IF;
  SELECT data INTO v_data FROM public.documents WHERE id = p_doc_id FOR UPDATE;
  IF coalesce(v_data->>'clientSignatureUrl', '') <> '' THEN
    RAISE EXCEPTION 'Document already signed' USING ERRCODE = '23505';
  END IF;
  UPDATE public.documents
     SET data = data || jsonb_build_object('clientSignatureUrl', p_signature, 'status', 'Accepted',
                                           'clientSignedAt', now()::text, 'clientSignedBy', v_client.name),
         updated_at = now()
   WHERE id = p_doc_id;
  RETURN jsonb_build_object('success', true);
END $$;

CREATE OR REPLACE FUNCTION public.get_document_by_token(doc_token uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_doc public.documents%ROWTYPE;
BEGIN
  SELECT * INTO v_doc FROM public.documents WHERE public_token = doc_token;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid or expired approval link' USING ERRCODE = 'P0002'; END IF;
  RETURN jsonb_build_object(
    'document', jsonb_build_object('id', v_doc.id, 'type', v_doc.type, 'data', v_doc.data, 'created_at', v_doc.created_at),
    'contractor', public._contractor_public_info(v_doc.user_id));
END $$;

CREATE OR REPLACE FUNCTION public.approve_document_by_token(doc_token uuid, p_signature text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_doc public.documents%ROWTYPE;
BEGIN
  SELECT * INTO v_doc FROM public.documents WHERE public_token = doc_token FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid approval token' USING ERRCODE = 'P0002'; END IF;
  IF p_signature IS NULL OR p_signature !~ '^data:image/(png|jpeg);base64,[A-Za-z0-9+/=]+$' OR length(p_signature) > 400000 THEN
    RAISE EXCEPTION 'Invalid signature image' USING ERRCODE = '22023';
  END IF;
  IF coalesce(v_doc.data->>'clientSignatureUrl', '') <> '' THEN
    RAISE EXCEPTION 'Document already signed' USING ERRCODE = '23505';
  END IF;
  UPDATE public.documents
     SET data = data || jsonb_build_object('clientSignatureUrl', p_signature, 'status', 'Accepted',
                                           'clientSignedAt', now()::text, 'clientSignedBy', v_doc.data->>'clientName'),
         updated_at = now()
   WHERE id = v_doc.id;
  RETURN jsonb_build_object('success', true, 'message', 'Document signed successfully');
END $$;

-- Mark-as-viewed without rewriting the whole JSON (fixes DB-001)
CREATE OR REPLACE FUNCTION public.mark_documents_viewed(p_ids uuid[])
RETURNS integer LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  WITH u AS (
    UPDATE public.documents
       SET data = data || '{"viewedByProvider": true}'::jsonb
     WHERE id = ANY (p_ids) AND user_id = auth.uid()
    RETURNING 1)
  SELECT count(*)::int FROM u;
$$;

-- -----------------------------------------------------------------------------
-- PART A.6  Inventory functions and the single set of document triggers
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.adjust_inventory(uuid, integer, uuid, text);
CREATE OR REPLACE FUNCTION public.adjust_inventory(p_item_id uuid, p_delta integer, p_job_id uuid DEFAULT NULL, p_context text DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_user uuid := auth.uid(); v_next integer;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000'; END IF;
  UPDATE public.inventory SET quantity = quantity + coalesce(p_delta, 0)
   WHERE id = p_item_id AND user_id = v_user AND quantity + coalesce(p_delta, 0) >= 0
  RETURNING quantity INTO v_next;
  IF v_next IS NULL THEN RAISE EXCEPTION 'Inventory item not found or insufficient stock' USING ERRCODE = 'P0001'; END IF;
  INSERT INTO public.inventory_history (user_id, item_id, action, quantity_change, notes, job_id)
  VALUES (v_user, p_item_id, CASE WHEN p_delta < 0 THEN 'deduct' ELSE 'restock' END, p_delta, p_context, p_job_id);
  RETURN v_next;
END $$;

DROP FUNCTION IF EXISTS public.apply_document_inventory_delta(uuid, uuid, jsonb, integer, uuid, text);
CREATE OR REPLACE FUNCTION public.apply_document_inventory_delta(
  p_user_id uuid, p_doc_id uuid, p_line_items jsonb, p_direction integer,
  p_job_id uuid DEFAULT NULL, p_context text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE li jsonb; v_item_id uuid; v_qty integer; v_prev integer; v_next integer;
BEGIN
  IF p_line_items IS NULL OR jsonb_typeof(p_line_items) <> 'array' THEN RETURN; END IF;
  FOR li IN SELECT * FROM jsonb_array_elements(p_line_items) LOOP
    IF li ? 'track_inventory' AND lower(coalesce(li->>'track_inventory', 'true')) = 'false' THEN CONTINUE; END IF;
    BEGIN
      v_item_id := coalesce(nullif(li->>'inventoryItemId', ''), nullif(li->>'item_id', ''))::uuid;
    EXCEPTION WHEN others THEN v_item_id := NULL; END;
    IF v_item_id IS NULL THEN CONTINUE; END IF;
    BEGIN
      v_qty := ceil(coalesce(nullif(li->>'quantity', '')::numeric, 0))::integer;
    EXCEPTION WHEN others THEN v_qty := 0; END;
    IF v_qty <= 0 THEN CONTINUE; END IF;
    SELECT quantity INTO v_prev FROM public.inventory WHERE id = v_item_id AND user_id = p_user_id FOR UPDATE;
    IF v_prev IS NULL THEN CONTINUE; END IF;
    v_next := v_prev + (p_direction * v_qty);
    IF v_next < 0 THEN RAISE EXCEPTION 'Insufficient stock for item %', v_item_id; END IF;
    UPDATE public.inventory SET quantity = v_next WHERE id = v_item_id AND user_id = p_user_id;
    INSERT INTO public.inventory_history (user_id, item_id, action, quantity_change, notes, job_id)
    VALUES (p_user_id, v_item_id, CASE WHEN (p_direction * v_qty) < 0 THEN 'deduct' ELSE 'restock' END,
            p_direction * v_qty, coalesce(p_context, '') || ' doc:' || p_doc_id::text, p_job_id);
  END LOOP;
END $$;

DROP FUNCTION IF EXISTS public.trg_documents_inventory() CASCADE;
DROP FUNCTION IF EXISTS public.trg_documents_invoice_inventory() CASCADE;  -- removes the duplicate App.tsx trigger set
CREATE OR REPLACE FUNCTION public.trg_documents_inventory()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  rec public.documents%ROWTYPE := coalesce(NEW, OLD);
  old_c boolean := false; new_c boolean := false; v_ctx text;
BEGIN
  IF rec.type NOT IN ('Invoice', 'Estimate', 'Change Order') THEN RETURN rec; END IF;
  IF TG_OP IN ('UPDATE', 'DELETE') THEN old_c := lower(coalesce(OLD.data->>'status', 'Draft')) IN ('approved', 'accepted', 'paid'); END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN new_c := lower(coalesce(NEW.data->>'status', 'Draft')) IN ('approved', 'accepted', 'paid'); END IF;
  v_ctx := lower(rec.type) || ':' || coalesce(rec.data->>'invoiceNumber', rec.data->>'estimateNumber', rec.data->>'changeOrderNumber', rec.id::text);

  IF TG_OP = 'INSERT' AND new_c THEN
    PERFORM public.apply_document_inventory_delta(NEW.user_id, NEW.id, NEW.data->'lineItems', -1, NEW.job_id, v_ctx);
  ELSIF TG_OP = 'UPDATE' THEN
    IF NOT old_c AND new_c THEN
      PERFORM public.apply_document_inventory_delta(NEW.user_id, NEW.id, NEW.data->'lineItems', -1, NEW.job_id, v_ctx);
    ELSIF old_c AND NOT new_c THEN
      PERFORM public.apply_document_inventory_delta(NEW.user_id, NEW.id, OLD.data->'lineItems', +1, NEW.job_id, v_ctx);
    ELSIF old_c AND new_c AND OLD.data->'lineItems' IS DISTINCT FROM NEW.data->'lineItems'
          AND NEW.data ? 'lineItems' THEN   -- never "restore" stock because a partial JSON lost lineItems
      PERFORM public.apply_document_inventory_delta(NEW.user_id, NEW.id, OLD.data->'lineItems', +1, NEW.job_id, v_ctx);
      PERFORM public.apply_document_inventory_delta(NEW.user_id, NEW.id, NEW.data->'lineItems', -1, NEW.job_id, v_ctx);
    END IF;
  ELSIF TG_OP = 'DELETE' AND old_c THEN
    PERFORM public.apply_document_inventory_delta(OLD.user_id, OLD.id, OLD.data->'lineItems', +1, OLD.job_id, v_ctx);
  END IF;
  RETURN rec;
END $$;
DROP TRIGGER IF EXISTS trg_documents_inventory_insert ON public.documents;
DROP TRIGGER IF EXISTS trg_documents_inventory_update ON public.documents;
DROP TRIGGER IF EXISTS trg_documents_inventory_delete ON public.documents;
DROP TRIGGER IF EXISTS trg_documents_invoice_inventory_insert ON public.documents;
DROP TRIGGER IF EXISTS trg_documents_invoice_inventory_update ON public.documents;
DROP TRIGGER IF EXISTS trg_documents_invoice_inventory_delete ON public.documents;
CREATE TRIGGER trg_documents_inventory_insert AFTER INSERT ON public.documents FOR EACH ROW EXECUTE FUNCTION public.trg_documents_inventory();
CREATE TRIGGER trg_documents_inventory_update AFTER UPDATE OF data ON public.documents FOR EACH ROW EXECUTE FUNCTION public.trg_documents_inventory();
CREATE TRIGGER trg_documents_inventory_delete AFTER DELETE ON public.documents FOR EACH ROW EXECUTE FUNCTION public.trg_documents_inventory();

-- Two incompatible overloads existed (SQL_ASSEMBLIES_FEATURE.sql and FIX_ASSEMBLIES.sql); the second one
-- called adjust_inventory() with saved_items ids, which are never inventory ids. Neither is called by the app.
DROP FUNCTION IF EXISTS public.deduct_assembly_inventory(uuid, numeric);
DROP FUNCTION IF EXISTS public.deduct_assembly_inventory(uuid, integer, uuid, text);

DROP TRIGGER IF EXISTS tr_documents_updated_at ON public.documents;
CREATE TRIGGER tr_documents_updated_at BEFORE UPDATE ON public.documents FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- -----------------------------------------------------------------------------
-- PART A.7  Function privileges. Supabase grants EXECUTE on new public functions
-- to anon and authenticated through default privileges, so REVOKE FROM PUBLIC alone
-- is not enough.
-- -----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.apply_document_inventory_delta(uuid, uuid, jsonb, integer, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.consume_ai_credit(uuid)                      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._contractor_public_info(uuid)                FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._client_document_ids(uuid)                   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_document_job_owner()                 FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_free_plan_limits()                   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recount_post_votes()                         FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recount_comment_votes()                      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_documents_inventory()                    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.adjust_inventory(uuid, integer, uuid, text)  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mark_documents_viewed(uuid[])                FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_ai_credit(uuid)                   TO service_role;
GRANT EXECUTE ON FUNCTION public.adjust_inventory(uuid, integer, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_documents_viewed(uuid[])             TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_portal_data(text)                     TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sign_document_via_portal(text, uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_document_by_token(uuid)               TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_document_by_token(uuid, text)     TO anon, authenticated;

-- Refresh tokens never need to reach the browser (gmail-auth uses service_role).
-- CommunicationView.tsx and batchEmailSender.ts only select gmail_address and delete rows.
REVOKE ALL ON public.user_gmail_accounts FROM anon, authenticated;
GRANT SELECT (id, user_id, gmail_address, created_at, updated_at) ON public.user_gmail_accounts TO authenticated;
GRANT DELETE ON public.user_gmail_accounts TO authenticated;

-- -----------------------------------------------------------------------------
-- PART A.8  Storage buckets (logos, forum, price-book-images) and owner-folder policies.
-- uploadFile() in App.tsx:787 writes to "<userId>/<timestamp>.<ext>" and reads with
-- getPublicUrl(), so the buckets stay public for reads; writes are limited to the
-- caller's own folder, image types and 5 MB.
-- -----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES
  ('logos',             'logos',             true, 5242880, ARRAY['image/png','image/jpeg','image/webp','image/gif','image/svg+xml']),
  ('forum',             'forum',             true, 5242880, ARRAY['image/png','image/jpeg','image/webp','image/gif']),
  ('price-book-images', 'price-book-images', true, 5242880, ARRAY['image/png','image/jpeg','image/webp','image/gif'])
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;
-- SVG can carry script; drop 'image/svg+xml' from logos if logos are ever opened directly in the browser.

DROP POLICY IF EXISTS "Allow public view access to logos"   ON storage.objects;
DROP POLICY IF EXISTS "Allow users to upload their own logo" ON storage.objects;
DROP POLICY IF EXISTS app_images_select_own ON storage.objects;
DROP POLICY IF EXISTS app_images_insert_own ON storage.objects;
DROP POLICY IF EXISTS app_images_update_own ON storage.objects;
DROP POLICY IF EXISTS app_images_delete_own ON storage.objects;
CREATE POLICY app_images_select_own ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id IN ('logos','forum','price-book-images') AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY app_images_insert_own ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id IN ('logos','forum','price-book-images') AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY app_images_update_own ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id IN ('logos','forum','price-book-images') AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id IN ('logos','forum','price-book-images') AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY app_images_delete_own ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id IN ('logos','forum','price-book-images') AND (storage.foldername(name))[1] = auth.uid()::text);

COMMIT;

NOTIFY pgrst, 'reload schema';


-- =============================================================================
-- PART B  Run ONLY after the frontend changes from the audit are deployed:
--   * ForumView.tsx embeds author data from public_profiles instead of profiles
--     (SEC-001 Fix, step 2)
--   * App.tsx no longer selects or writes profiles.gmail_access_token /
--     gmail_refresh_token, and no longer reads user_credentials tokens in the browser
--     (SEC-012 Fix)
-- =============================================================================
/*
BEGIN;

-- B.1 Profiles: only the owner reads their row; others see name and avatar through a view.
DROP POLICY IF EXISTS profiles_select_authenticated ON public.profiles;
DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
CREATE POLICY profiles_select_own ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());

CREATE OR REPLACE VIEW public.public_profiles AS
  SELECT id, name, profile_picture_url FROM public.profiles;   -- owner-rights view, bypasses RLS on purpose
REVOKE ALL ON public.public_profiles FROM anon;
GRANT SELECT ON public.public_profiles TO authenticated;

-- B.2 Google tokens leave profiles (they already live in user_credentials / user_gmail_accounts).
ALTER TABLE public.profiles DROP COLUMN IF EXISTS gmail_access_token;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS gmail_refresh_token;

-- B.3 user_credentials becomes server-only (read through an edge function).
REVOKE ALL ON public.user_credentials FROM anon, authenticated;

COMMIT;
NOTIFY pgrst, 'reload schema';
*/
