-- Optional performance indexes for paged, explicit-column Supabase queries.
-- Safe to run multiple times in Supabase SQL Editor.

CREATE INDEX IF NOT EXISTS idx_documents_user_created_at
ON public.documents (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_documents_user_job_created_at
ON public.documents (user_id, job_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_clients_user_name
ON public.clients (user_id, name);

CREATE INDEX IF NOT EXISTS idx_inventory_user_name
ON public.inventory (user_id, name);

CREATE INDEX IF NOT EXISTS idx_inventory_history_user_created_at
ON public.inventory_history (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_saved_items_user_name
ON public.saved_items (user_id, name);
