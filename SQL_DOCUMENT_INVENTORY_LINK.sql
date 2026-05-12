-- Document Inventory Link
-- Run this in Supabase SQL Editor.
-- It connects inventory-backed line items in Invoices, Estimates, and Change Orders
-- to automatic stock deduction/restoration.

DROP FUNCTION IF EXISTS public.apply_document_inventory_delta(uuid, uuid, jsonb, integer, uuid, text);
CREATE OR REPLACE FUNCTION public.apply_document_inventory_delta(
  p_user_id uuid,
  p_doc_id uuid,
  p_line_items jsonb,
  p_direction integer,
  p_job_id uuid DEFAULT NULL,
  p_context text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  li jsonb;
  v_item_id uuid;
  v_qty integer;
  v_prev integer;
  v_next integer;
BEGIN
  IF p_line_items IS NULL OR jsonb_typeof(p_line_items) <> 'array' THEN
    RETURN;
  END IF;

  FOR li IN SELECT * FROM jsonb_array_elements(p_line_items)
  LOOP
    IF li ? 'track_inventory' AND lower(COALESCE(li->>'track_inventory', 'true')) = 'false' THEN
      CONTINUE;
    END IF;

    BEGIN
      v_item_id := COALESCE(NULLIF(li->>'inventoryItemId', ''), NULLIF(li->>'item_id', ''))::uuid;
    EXCEPTION WHEN others THEN
      v_item_id := NULL;
    END;

    IF v_item_id IS NULL THEN
      CONTINUE;
    END IF;

    BEGIN
      v_qty := CEIL(COALESCE(NULLIF(li->>'quantity','')::numeric, 0))::integer;
    EXCEPTION WHEN others THEN
      v_qty := 0;
    END;

    IF v_qty <= 0 THEN
      CONTINUE;
    END IF;

    SELECT quantity
    INTO v_prev
    FROM public.inventory
    WHERE id = v_item_id
      AND user_id = p_user_id
    FOR UPDATE;

    IF v_prev IS NULL THEN
      CONTINUE;
    END IF;

    v_next := v_prev + (p_direction * v_qty);
    IF v_next < 0 THEN
      RAISE EXCEPTION 'Insufficient stock for item %', v_item_id;
    END IF;

    UPDATE public.inventory
    SET quantity = v_next
    WHERE id = v_item_id
      AND user_id = p_user_id;

    INSERT INTO public.inventory_history (
      user_id,
      item_id,
      action,
      quantity_change,
      notes,
      job_id
    ) VALUES (
      p_user_id,
      v_item_id,
      CASE WHEN (p_direction * v_qty) < 0 THEN 'deduct' ELSE 'restock' END,
      (p_direction * v_qty),
      COALESCE(p_context, '') || ' doc:' || p_doc_id::text,
      p_job_id
    );
  END LOOP;
END;
$$;

DROP FUNCTION IF EXISTS public.trg_documents_inventory();
CREATE OR REPLACE FUNCTION public.trg_documents_inventory()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  old_status text;
  new_status text;
  is_old_committed boolean;
  is_new_committed boolean;
  v_context text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.type NOT IN ('Invoice', 'Estimate', 'Change Order') THEN
      RETURN NEW;
    END IF;

    new_status := COALESCE(NEW.data->>'status', 'Draft');
    is_new_committed := lower(new_status) IN ('approved','accepted','paid');
    v_context := lower(NEW.type) || ':' || COALESCE(NEW.data->>'invoiceNumber', NEW.data->>'estimateNumber', NEW.data->>'changeOrderNumber', NEW.id::text);

    IF is_new_committed THEN
      PERFORM public.apply_document_inventory_delta(NEW.user_id, NEW.id, NEW.data->'lineItems', -1, NEW.job_id, v_context);
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.type NOT IN ('Invoice', 'Estimate', 'Change Order') THEN
      RETURN NEW;
    END IF;

    old_status := COALESCE(OLD.data->>'status', 'Draft');
    new_status := COALESCE(NEW.data->>'status', 'Draft');
    is_old_committed := lower(old_status) IN ('approved','accepted','paid');
    is_new_committed := lower(new_status) IN ('approved','accepted','paid');
    v_context := lower(NEW.type) || ':' || COALESCE(NEW.data->>'invoiceNumber', NEW.data->>'estimateNumber', NEW.data->>'changeOrderNumber', NEW.id::text);

    IF (NOT is_old_committed) AND is_new_committed THEN
      PERFORM public.apply_document_inventory_delta(NEW.user_id, NEW.id, NEW.data->'lineItems', -1, NEW.job_id, v_context);
    END IF;

    IF is_old_committed AND (NOT is_new_committed) THEN
      PERFORM public.apply_document_inventory_delta(NEW.user_id, NEW.id, OLD.data->'lineItems', +1, NEW.job_id, v_context);
    END IF;

    IF is_old_committed AND is_new_committed AND OLD.data->'lineItems' IS DISTINCT FROM NEW.data->'lineItems' THEN
      PERFORM public.apply_document_inventory_delta(NEW.user_id, NEW.id, OLD.data->'lineItems', +1, NEW.job_id, v_context);
      PERFORM public.apply_document_inventory_delta(NEW.user_id, NEW.id, NEW.data->'lineItems', -1, NEW.job_id, v_context);
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.type NOT IN ('Invoice', 'Estimate', 'Change Order') THEN
      RETURN OLD;
    END IF;

    old_status := COALESCE(OLD.data->>'status', 'Draft');
    is_old_committed := lower(old_status) IN ('approved','accepted','paid');
    v_context := lower(OLD.type) || ':' || COALESCE(OLD.data->>'invoiceNumber', OLD.data->>'estimateNumber', OLD.data->>'changeOrderNumber', OLD.id::text);

    IF is_old_committed THEN
      PERFORM public.apply_document_inventory_delta(OLD.user_id, OLD.id, OLD.data->'lineItems', +1, OLD.job_id, v_context);
    END IF;

    RETURN OLD;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_documents_inventory_insert ON public.documents;
DROP TRIGGER IF EXISTS trg_documents_invoice_inventory_insert ON public.documents;
CREATE TRIGGER trg_documents_inventory_insert
AFTER INSERT ON public.documents
FOR EACH ROW
EXECUTE FUNCTION public.trg_documents_inventory();

DROP TRIGGER IF EXISTS trg_documents_inventory_update ON public.documents;
DROP TRIGGER IF EXISTS trg_documents_invoice_inventory_update ON public.documents;
CREATE TRIGGER trg_documents_inventory_update
AFTER UPDATE OF data ON public.documents
FOR EACH ROW
EXECUTE FUNCTION public.trg_documents_inventory();

DROP TRIGGER IF EXISTS trg_documents_inventory_delete ON public.documents;
DROP TRIGGER IF EXISTS trg_documents_invoice_inventory_delete ON public.documents;
CREATE TRIGGER trg_documents_inventory_delete
AFTER DELETE ON public.documents
FOR EACH ROW
EXECUTE FUNCTION public.trg_documents_inventory();

DROP FUNCTION IF EXISTS public.trg_documents_invoice_inventory();

NOTIFY pgrst, 'reload config';
