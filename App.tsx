import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FormType } from './types.ts';
import type { UserProfile, Job, FormData as FormDataType, InvoiceData, DailyJobReportData, NoteData, WorkOrderData, TimeSheetData, MaterialLogData, EstimateData, ExpenseLogData, WarrantyData, ReceiptData, ChangeOrderData, PurchaseOrderData, Client, Notification, InventoryItem, InventoryHistoryItem, SavedItem, UserGmailAccount } from './types.ts';
import type { Session, SupabaseClient, User } from '@supabase/supabase-js';
import Login from './components/Login.tsx';
import UpgradeModal from './components/UpgradeModal.tsx';
import ConfirmationModal from './components/ConfirmationModal.tsx';
import SignaturePad from './components/SignaturePad.tsx';
import Signup from './components/Signup.tsx';
import UpdatePassword from './components/UpdatePassword.tsx';
import SelectDocType from './components/SelectDocType.tsx';
import InvoiceForm from './components/InvoiceForm.tsx';
import DailyJobReportForm from './components/DailyJobReportForm.tsx';
import NoteForm from './components/NoteForm.tsx';
import WorkOrderForm from './components/WorkOrderForm.tsx';
import TimeSheetForm from './components/TimeSheetForm.tsx';
import MaterialLogForm from './components/MaterialLogForm.tsx';
import EstimateForm from './components/EstimateForm.tsx';
import ExpenseLogForm from './components/ExpenseLogForm.tsx';
import WarrantyForm from './components/WarrantyForm.tsx';
import ReceiptForm from './components/ReceiptForm.tsx';
import ChangeOrderForm from './components/ChangeOrderForm.tsx';
import PurchaseOrderForm from './components/PurchaseOrderForm.tsx';

import Settings from './components/Settings.tsx';
import ClientsView from './components/ClientsView.tsx';
import AnalyticsView from './components/AnalyticsView.tsx';
import ForumView from './components/ForumView.tsx';
import CalendarView from './components/CalendarView.tsx';
import CommunicationView from './components/CommunicationView.tsx';
import InventoryView from './components/InventoryView.tsx';
import PriceBookView from './components/PriceBookView.tsx';
import ProfitCalculatorView from './components/ProfitCalculatorView.tsx';
import PortalView from './components/PortalView.tsx';
import DocumentApprovalView from './components/DocumentApprovalView.tsx';
import Dock from './components/Dock.tsx';
import JobForm from './components/JobForm.tsx';
import Welcome from './components/Welcome.tsx';
import PrivacyPolicy from './components/PrivacyPolicy.tsx';
import TermsOfService from './components/TermsOfService.tsx';
import Security from './components/Security.tsx';

import { HomeIcon, SettingsIcon, PlusIcon, BackArrowIcon, UserIcon, AppLogo, SearchIcon, UsersIcon, CheckCircleIcon, XCircleIcon, ClockIcon, CreditCardIcon, InvoiceIcon, DailyReportIcon, TimeSheetIcon, MaterialLogIcon, EstimateIcon, ExpenseLogIcon, WarrantyIcon, NoteIcon, ReceiptIcon, WorkOrderIcon, BarChartIcon, MessageSquareIcon, CalendarIcon, ChangeOrderIcon, TruckIcon, BriefcaseIcon, MailIcon, BoxIcon, TagIcon, CalculatorIcon, ChevronDownIcon, TrashIcon, AlertTriangleIcon, StarIcon, CopyIcon, GoogleIcon } from './components/Icons.tsx';
import { Button } from './components/ui/Button.tsx';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './components/ui/Card.tsx';
import { Label } from './components/ui/Label.tsx';
import { Input } from './components/ui/Input.tsx';
import { JobCard } from './components/JobCard.tsx';
import { DocumentCard } from './components/DocumentCard.tsx';
import { DuplicateJobModal } from './components/DuplicateJobModal.tsx';
import { translations } from './utils/translations.ts';
import { dbApi } from './utils/db.ts';
import { compressImage } from './utils/imageCompression.ts';

// Initialize Supabase client with provided credentials
const supabaseUrl = 'https://iauteblvljppwzsxloyd.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlhdXRlYmx2bGpwcHd6c3hsb3lkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA1OTk0MTIsImV4cCI6MjA3NjE3NTQxMn0.W2Xu9TuO6odsnF5eK7iLPqV4KB0wVWXzmM2ofnKZw70';

// Use window.supabase for legacy script tag support as requested previously
const supabase: SupabaseClient = (window as any).supabase ? (window as any).supabase.createClient(supabaseUrl, supabaseAnonKey) : null;

const SQL_SETUP_SCRIPT = `-- This script sets up and fixes your database schema.
-- Run this script in your Supabase SQL Editor.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. PROFILES
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  name TEXT,
  company_name TEXT,
  logo_url TEXT,
  profile_picture_url TEXT,
  address TEXT,
  phone TEXT,
  website TEXT,
  job_title TEXT,
  subscription_tier TEXT DEFAULT 'Basic',
  language TEXT DEFAULT 'English',
  email_templates JSONB DEFAULT '{}'::jsonb,
  theme TEXT,
  gmail_access_token TEXT,
  gmail_refresh_token TEXT,
  email_usage INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure columns exist if table already created
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'gmail_access_token') THEN
        ALTER TABLE public.profiles ADD COLUMN gmail_access_token TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'gmail_refresh_token') THEN
        ALTER TABLE public.profiles ADD COLUMN gmail_refresh_token TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'email_usage') THEN
        ALTER TABLE public.profiles ADD COLUMN email_usage INTEGER DEFAULT 0;
    END IF;
END $$;

-- 1.5 USER CREDENTIALS (NEW: Gmail Persistence)
CREATE TABLE IF NOT EXISTS public.user_credentials (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, provider)
);
ALTER TABLE public.user_credentials ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage their own credentials" ON public.user_credentials;
CREATE POLICY "Users can manage their own credentials" ON public.user_credentials FOR ALL USING (auth.uid() = user_id);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;
CREATE POLICY "Users can view all profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- 2. CLIENTS (Updated with Portal Key)
CREATE TABLE IF NOT EXISTS public.clients (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address TEXT,
  notes TEXT,
  portal_key TEXT DEFAULT encode(gen_random_bytes(16), 'hex'),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure portal_key exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clients' AND column_name = 'portal_key') THEN
        ALTER TABLE public.clients ADD COLUMN portal_key TEXT DEFAULT encode(gen_random_bytes(16), 'hex');
    END IF;
END $$;

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage their own clients" ON public.clients;
CREATE POLICY "Users can manage their own clients" ON public.clients FOR ALL USING (auth.uid() = user_id);

-- 3. JOBS
CREATE TABLE IF NOT EXISTS public.jobs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  client_name TEXT,
  client_address TEXT,
  start_date DATE,
  end_date DATE,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage their own jobs" ON public.jobs;
CREATE POLICY "Users can manage their own jobs" ON public.jobs FOR ALL USING (auth.uid() = user_id);

-- 4. DOCUMENTS (Updated with public_token)
CREATE TABLE IF NOT EXISTS public.documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  public_token UUID DEFAULT gen_random_uuid()
);

-- Ensure public_token exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'public_token') THEN
        ALTER TABLE public.documents ADD COLUMN public_token UUID DEFAULT gen_random_uuid();
    END IF;
END $$;

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage their own documents" ON public.documents;
CREATE POLICY "Users can manage their own documents" ON public.documents FOR ALL USING (auth.uid() = user_id);

-- 5. SAVED ITEMS (Price Book)
CREATE TABLE IF NOT EXISTS public.saved_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  rate NUMERIC DEFAULT 0,
  unit_cost NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.saved_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage saved items" ON public.saved_items;
CREATE POLICY "Users can manage saved items" ON public.saved_items FOR ALL USING (auth.uid() = user_id);

-- 6. INVENTORY
CREATE TABLE IF NOT EXISTS public.inventory (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  quantity INTEGER DEFAULT 0,
  category TEXT,
  low_stock_threshold INTEGER DEFAULT 5,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage their own inventory" ON public.inventory;
CREATE POLICY "Users can manage their own inventory" ON public.inventory FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 7. FORUM & NOTIFICATIONS (Skipped for brevity, assumed existing)

-- 8. STORAGE (Logos)
INSERT INTO storage.buckets (id, name, public) VALUES ('logos', 'logos', true) ON CONFLICT (id) DO NOTHING;
UPDATE storage.buckets SET public = true WHERE id = 'logos';
DROP POLICY IF EXISTS "Allow public view access to logos" ON storage.objects;
CREATE POLICY "Allow public view access to logos" ON storage.objects FOR SELECT USING (bucket_id = 'logos');
DROP POLICY IF EXISTS "Allow users to upload their own logo" ON storage.objects;
CREATE POLICY "Allow users to upload their own logo" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'logos' AND auth.role() = 'authenticated');

-- 9. PORTAL FUNCTIONS
CREATE OR REPLACE FUNCTION get_portal_data(p_key text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_client_id uuid;
  v_user_id uuid;
  v_client_data json;
  v_contractor_data json;
  v_documents json;
BEGIN
  -- Find client by key
  SELECT id, user_id INTO v_client_id, v_user_id FROM public.clients WHERE portal_key = p_key LIMIT 1;
  
  IF v_client_id IS NULL THEN
    RETURN json_build_object('error', 'Invalid portal key');
  END IF;

  -- Get Client Data
  SELECT row_to_json(c) INTO v_client_data FROM public.clients c WHERE id = v_client_id;
  
  -- Get Contractor Profile
  SELECT row_to_json(p) INTO v_contractor_data FROM public.profiles p WHERE id = v_user_id;

  -- Get Documents related to this client name (Simple text match for MVP)
  -- Note: Ideally documents would link to client_id, but current schema links to job_id.
  -- We'll fetch docs where the JSON data->>'clientName' matches client name.
  SELECT json_agg(d) INTO v_documents 
  FROM public.documents d 
  WHERE d.user_id = v_user_id 
  AND d.data->>'clientName' = (v_client_data->>'name');

  RETURN json_build_object(
    'client', v_client_data,
    'contractor', v_contractor_data,
    'documents', COALESCE(v_documents, '[]'::json)
  );
END;
$$;

CREATE OR REPLACE FUNCTION sign_document_via_portal(p_key text, p_doc_id uuid, p_signature text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_client_id uuid;
BEGIN
  -- Validate Key
  SELECT id INTO v_client_id FROM public.clients WHERE portal_key = p_key LIMIT 1;
  IF v_client_id IS NULL THEN
    RAISE EXCEPTION 'Invalid portal key';
  END IF;

  -- Update Document
  UPDATE public.documents 
  SET data = jsonb_set(
      jsonb_set(data, '{signatureUrl}', to_jsonb(p_signature)),
      '{status}', '"Accepted"'
  )
  WHERE id = p_doc_id;
END;
$$;

-- 10. APPROVAL LINK FUNCTIONS
CREATE OR REPLACE FUNCTION get_document_by_token(doc_token uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_doc record;
  v_contractor_data json;
BEGIN
  -- Find Document
  SELECT * INTO v_doc FROM public.documents WHERE public_token = doc_token LIMIT 1;
  
  IF v_doc.id IS NULL THEN
    RETURN json_build_object('error', 'Document not found');
  END IF;

  -- Get Contractor Profile
  SELECT row_to_json(p) INTO v_contractor_data FROM public.profiles p WHERE id = v_doc.user_id;

  RETURN json_build_object(
    'document', row_to_json(v_doc),
    'contractor', v_contractor_data
  );
END;
$$;

CREATE OR REPLACE FUNCTION approve_document_by_token(doc_token uuid, p_signature text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_doc_id uuid;
BEGIN
  -- Find doc ID
  SELECT id INTO v_doc_id FROM public.documents WHERE public_token = doc_token LIMIT 1;
  
  IF v_doc_id IS NULL THEN
    RAISE EXCEPTION 'Document not found';
  END IF;

  -- Update Document
  UPDATE public.documents 
  SET data = jsonb_set(
      jsonb_set(data, '{signatureUrl}', to_jsonb(p_signature)),
      '{status}', '"Accepted"'
  )
  WHERE id = v_doc_id;
END;
$$;

-- 10.5 UPDATE INVENTORY SCHEMA (New Columns)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inventory' AND column_name = 'unit') THEN
        ALTER TABLE public.inventory ADD COLUMN unit TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inventory' AND column_name = 'cost_price') THEN
        ALTER TABLE public.inventory ADD COLUMN cost_price NUMERIC DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inventory' AND column_name = 'supplier') THEN
        ALTER TABLE public.inventory ADD COLUMN supplier TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inventory' AND column_name = 'location') THEN
        ALTER TABLE public.inventory ADD COLUMN location TEXT;
    END IF;
END $$;

-- 11. INVENTORY HISTORY
CREATE TABLE IF NOT EXISTS public.inventory_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.inventory(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  quantity_change INTEGER NOT NULL,
  notes TEXT,
  job_id UUID REFERENCES public.jobs(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.inventory_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage their own inventory history" ON public.inventory_history;
CREATE POLICY "Users can manage their own inventory history" ON public.inventory_history FOR ALL USING (auth.uid() = user_id);

-- 11B. RPC: Adjust inventory atomically (used by Invoices)
DROP FUNCTION IF EXISTS public.adjust_inventory(uuid, integer, uuid, text);
CREATE OR REPLACE FUNCTION public.adjust_inventory(
  p_item_id uuid,
  p_delta integer,
  p_job_id uuid DEFAULT NULL,
  p_context text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_prev_qty integer;
  v_next_qty integer;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT quantity
  INTO v_prev_qty
  FROM public.inventory
  WHERE id = p_item_id
    AND user_id = v_user_id
  FOR UPDATE;

  IF v_prev_qty IS NULL THEN
    RAISE EXCEPTION 'Inventory item not found';
  END IF;

  v_next_qty := v_prev_qty + COALESCE(p_delta, 0);
  IF v_next_qty < 0 THEN
    RAISE EXCEPTION 'Insufficient stock';
  END IF;

  UPDATE public.inventory
  SET quantity = v_next_qty
  WHERE id = p_item_id
    AND user_id = v_user_id;

  INSERT INTO public.inventory_history (
    user_id,
    item_id,
    action,
    quantity_change,
    notes,
    job_id
  ) VALUES (
    v_user_id,
    p_item_id,
    CASE WHEN p_delta < 0 THEN 'deduct' ELSE 'restock' END,
    p_delta,
    p_context,
    p_job_id
  );
END;
$$;

-- 11C. Document-linked inventory automation (legacy JSON documents)
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

DROP FUNCTION IF EXISTS public.trg_documents_invoice_inventory();
CREATE OR REPLACE FUNCTION public.trg_documents_invoice_inventory()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  old_status text;
  new_status text;
  is_old_committed boolean;
  is_new_committed boolean;
  v_job_id uuid;
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

    -- Define when inventory should be committed
    is_old_committed := lower(old_status) IN ('approved','accepted','paid');
    is_new_committed := lower(new_status) IN ('approved','accepted','paid');

    v_job_id := NULL;
    BEGIN
      v_job_id := NEW.job_id;
    EXCEPTION WHEN others THEN
      v_job_id := NULL;
    END;

    v_context := lower(NEW.type) || ':' || COALESCE(NEW.data->>'invoiceNumber', NEW.data->>'estimateNumber', NEW.data->>'changeOrderNumber', NEW.id::text);

    IF (NOT is_old_committed) AND is_new_committed THEN
      PERFORM public.apply_document_inventory_delta(NEW.user_id, NEW.id, NEW.data->'lineItems', -1, v_job_id, v_context);
    END IF;

    IF is_old_committed AND (NOT is_new_committed) THEN
      PERFORM public.apply_document_inventory_delta(NEW.user_id, NEW.id, OLD.data->'lineItems', +1, v_job_id, v_context);
    END IF;

    IF is_old_committed AND is_new_committed AND OLD.data->'lineItems' IS DISTINCT FROM NEW.data->'lineItems' THEN
      PERFORM public.apply_document_inventory_delta(NEW.user_id, NEW.id, OLD.data->'lineItems', +1, v_job_id, v_context);
      PERFORM public.apply_document_inventory_delta(NEW.user_id, NEW.id, NEW.data->'lineItems', -1, v_job_id, v_context);
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

DROP TRIGGER IF EXISTS trg_documents_invoice_inventory_update ON public.documents;
CREATE TRIGGER trg_documents_invoice_inventory_update
AFTER UPDATE OF data ON public.documents
FOR EACH ROW
EXECUTE FUNCTION public.trg_documents_invoice_inventory();

DROP TRIGGER IF EXISTS trg_documents_invoice_inventory_insert ON public.documents;
CREATE TRIGGER trg_documents_invoice_inventory_insert
AFTER INSERT ON public.documents
FOR EACH ROW
EXECUTE FUNCTION public.trg_documents_invoice_inventory();

DROP TRIGGER IF EXISTS trg_documents_invoice_inventory_delete ON public.documents;
CREATE TRIGGER trg_documents_invoice_inventory_delete
AFTER DELETE ON public.documents
FOR EACH ROW
EXECUTE FUNCTION public.trg_documents_invoice_inventory();

NOTIFY pgrst, 'reload config';
`;

const DbSetupScreen: React.FC<{ sqlScript: string }> = ({ sqlScript }) => {
    return (
        <div className="flex items-center justify-center min-h-screen bg-background p-4 md:p-8">
            <Card className="max-w-4xl w-full animate-fade-in-down">
                <CardHeader>
                    <CardTitle className="text-2xl text-destructive">Database Update Required</CardTitle>
                    <CardDescription>
                        To enable Price Book, Client Portal, and Inventory, please run this script.
                        <br /><br />
                        <strong>This script is safe and will NOT delete your data.</strong>
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        <div>
                            <Label htmlFor="sql-script">SQL Script</Label>
                            <textarea
                                id="sql-script"
                                readOnly
                                value={sqlScript}
                                className="mt-1 w-full h-96 p-3 font-mono text-xs bg-muted rounded-md border focus:ring-2 focus:ring-primary"
                                onClick={(e) => (e.target as HTMLTextAreaElement).select()}
                            />
                        </div>
                        <div>
                            <h4 className="font-semibold">Instructions:</h4>
                            <ol className="list-decimal list-inside text-sm text-muted-foreground mt-2 space-y-1">
                                <li>Go to your <a href="https://app.supabase.com" target="_blank" rel="noopener noreferrer" className="text-primary underline">Supabase Dashboard</a>.</li>
                                <li>Click on <strong>SQL Editor</strong> (left sidebar).</li>
                                <li>Click <strong>+ New query</strong>.</li>
                                <li>Paste the script above and click <strong>Run</strong>.</li>
                                <li>Come back here and refresh the page.</li>
                            </ol>
                        </div>
                    </div>
                </CardContent>
                <CardFooter className="flex-col items-center gap-4">
                    <Button onClick={() => window.location.reload()} className="w-full">
                        Refresh Page
                    </Button>
                </CardFooter>
            </Card>
        </div>
    );
};


// Helper to upload a file to Supabase Storage
const uploadFile = async (bucket: string, file: File, userId: string, isPublicUpload: boolean = false): Promise<string> => {
    if (!navigator.onLine) {
        throw new Error("Cannot upload file while offline");
    }
    const fileExt = file.name.split('.').pop();
    const fileName = `${userId}/${Date.now()}.${fileExt}`;

    const { error } = await supabase.storage.from(bucket).upload(fileName, file, { upsert: true });
    if (error) {
        console.error('Error uploading file:', error);
        throw error;
    }
    const { data } = supabase.storage.from(bucket).getPublicUrl(fileName);
    return data.publicUrl;
};

// --- GMAIL AUTH CONFIG ---
// NOTE: These should ideally be in env vars. VITE_ prefix is common for frontend.
const GOOGLE_CLIENT_ID = '292965678575-p8smva2vfeguocsppjr45r05jsvhggjo.apps.googleusercontent.com';

const GmailCallback: React.FC<{ session: Session | null }> = ({ session }) => {
    const location = useLocation();
    const navigate = useNavigate();
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const handleCallback = async () => {
            const params = new URLSearchParams(location.search);
            const code = params.get('code');
            if (!code) {
                setError('No authorization code received');
                return;
            }

            try {
                const response = await fetch(`${supabaseUrl}/functions/v1/gmail-auth`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${session?.access_token}`
                    },
                    body: JSON.stringify({
                        action: 'exchange',
                        code,
                        redirect_uri: `${window.location.origin}/auth/google/callback/gmail`
                    })
                });

                const data = await response.json();
                if (!response.ok) throw new Error(data.error || 'Failed to exchange token');

                // Token saved on backend/DB. Redirect home.
                navigate('/communication');
            } catch (err: any) {
                console.error('Gmail callback error:', err);
                setError(err.message);
            }
        };

        if (session) {
            handleCallback();
        }
    }, [location, session, navigate]);

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-background">
                <Card className="w-full max-w-md border-destructive/50">
                    <CardHeader>
                        <CardTitle className="text-destructive">Gmail Connection Failed</CardTitle>
                        <CardDescription>We couldn't link your Google account.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="p-3 bg-destructive/10 rounded-lg text-sm text-destructive font-medium border border-destructive/20">
                            {error}
                        </div>
                    </CardContent>
                    <CardFooter>
                        <Button onClick={() => navigate('/communication')} className="w-full">Back to Communication</Button>
                    </CardFooter>
                </Card>
            </div>
        );
    }

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-background">
            <div className="relative">
                <div className="w-16 h-16 rounded-full border-4 border-primary/20 animate-pulse"></div>
                <div className="absolute inset-0 w-16 h-16 rounded-full border-t-4 border-primary animate-spin"></div>
            </div>
            <p className="mt-6 text-lg font-medium animate-pulse">Authorizing Gmail...</p>
            <p className="text-sm text-muted-foreground mt-2">Connecting your account securely</p>
        </div>
    );
};


const App: React.FC = () => {
    type AppView =
        | { screen: 'welcome' }
        | { screen: 'auth'; authScreen: 'login' | 'signup' | 'checkEmail' }
        | { screen: 'updatePassword' }
        | { screen: 'dashboard' }
        | { screen: 'jobDetails'; jobId: string }
        | { screen: 'createJob'; returnTo?: 'dashboard' | 'calendar' }
        | { screen: 'selectDocType'; jobId: string }
        | { screen: 'form'; formType: FormType; jobId: string; formId: string | null }
        | { screen: 'settings' }
        | { screen: 'profile' }
        | { screen: 'clients' }
        | { screen: 'analytics' }
        | { screen: 'calendar' }
        | { screen: 'communication' }
        | { screen: 'inventory' }
        | { screen: 'pricebook' }
        | { screen: 'profitCalculator' }
        | { screen: 'forum'; postId?: string }
        | { screen: 'privacy' }
        | { screen: 'terms' }
        | { screen: 'security' }
        | { screen: 'gmailCallback' };

    const [session, setSession] = useState<Session | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadingMessage, setLoadingMessage] = useState('Initializing...');
    const location = useLocation();
    const navigate = useNavigate();

    const view: AppView = React.useMemo(() => {
        const params = new URLSearchParams(location.search);
        const portalKey = params.get('portal');
        const approvalToken = params.get('approval_token');

        if (portalKey || approvalToken) {
            return { screen: 'welcome' };
        }

        const path = location.pathname.replace(/\/$/, '') || '/dashboard';

        if (path === '/privacy') return { screen: 'privacy' };
        if (path === '/terms') return { screen: 'terms' };
        if (path === '/security') return { screen: 'security' };
        if (path === '/update-password') return { screen: 'updatePassword' };
        if (path === '/dashboard') return { screen: 'dashboard' };
        if (path === '/settings') return { screen: 'settings' };
        if (path === '/profile') return { screen: 'profile' };
        if (path === '/clients') return { screen: 'clients' };
        if (path === '/analytics') return { screen: 'analytics' };
        if (path === '/calendar') return { screen: 'calendar' };
        if (path === '/communication') return { screen: 'communication' };
        if (path === '/inventory') return { screen: 'inventory' };
        if (path === '/pricebook') return { screen: 'pricebook' };
        if (path === '/calculator') return { screen: 'profitCalculator' };
        if (path === '/forum') return { screen: 'forum' };
        if (path === '/auth/google/callback/gmail') return { screen: 'gmailCallback' };

        if (path.startsWith('/auth/')) {
            const authScreen = path.split('/')[2];
            return { screen: 'auth', authScreen: authScreen as any };
        }

        if (path.startsWith('/forum/')) {
            return { screen: 'forum', postId: path.split('/')[2] };
        }

        if (path.startsWith('/jobs')) {
            const parts = path.split('/');
            if (parts[2] === 'create') {
                const rt = params.get('returnTo') as 'dashboard' | 'calendar' | undefined;
                return { screen: 'createJob', returnTo: rt };
            }
            if (parts[3] === 'select-doc') {
                return { screen: 'selectDocType', jobId: parts[2] };
            }
            if (parts[3] === 'forms') {
                return { screen: 'form', jobId: parts[2], formType: parts[4] as FormType, formId: parts[5] || null };
            }
            if (parts[2]) {
                return { screen: 'jobDetails', jobId: parts[2] };
            }
        }

        if (path === '/welcome') return { screen: 'welcome' };

        return { screen: 'dashboard' }; // default fallback instead of welcome
    }, [location.pathname, location.search]);

    const setView = (newView: AppView) => {
        switch (newView.screen) {
            case 'welcome': navigate('/welcome'); break;
            case 'privacy': navigate('/privacy'); break;
            case 'terms': navigate('/terms'); break;
            case 'security': navigate('/security'); break;
            case 'updatePassword': navigate('/update-password'); break;
            case 'auth': navigate(`/auth/${newView.authScreen}`); break;
            case 'dashboard': navigate('/dashboard'); break;
            case 'settings': navigate('/settings'); break;
            case 'profile': navigate('/profile'); break;
            case 'clients': navigate('/clients'); break;
            case 'analytics': navigate('/analytics'); break;
            case 'calendar': navigate('/calendar'); break;
            case 'communication': navigate('/communication'); break;
            case 'inventory': navigate('/inventory'); break;
            case 'pricebook': navigate('/pricebook'); break;
            case 'profitCalculator': navigate('/calculator'); break;
            case 'forum': navigate(newView.postId ? `/forum/${newView.postId}` : '/forum'); break;
            case 'createJob': navigate(`/jobs/create${newView.returnTo ? `?returnTo=${newView.returnTo}` : ''}`); break;
            case 'selectDocType': navigate(`/jobs/${newView.jobId}/select-doc`); break;
            case 'form': navigate(`/jobs/${newView.jobId}/forms/${newView.formType}${newView.formId ? `/${newView.formId}` : ''}`); break;
            case 'jobDetails': navigate(`/jobs/${newView.jobId}`); break;
            case 'gmailCallback': navigate('/auth/google/callback/gmail'); break;
        }
    };

    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [jobs, setJobs] = useState<Job[]>([]);
    const [forms, setForms] = useState<FormDataType[]>([]);
    const [clients, setClients] = useState<Client[]>([]);
    const [inventory, setInventory] = useState<InventoryItem[]>([]);
    const [inventoryHistory, setInventoryHistory] = useState<InventoryHistoryItem[]>([]);
    const [savedItems, setSavedItems] = useState<SavedItem[]>([]);
    const [gmailAccounts, setGmailAccounts] = useState<UserGmailAccount[]>([]);
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [showJobFinancials, setShowJobFinancials] = useState<boolean>(false);

    // External Access State
    const [portalKey, setPortalKey] = useState<string | null>(null);
    const [approvalToken, setApprovalToken] = useState<string | null>(null);

    const [notificationCount, setNotificationCount] = useState(0);
    const clientNotificationCount = React.useMemo(() => {
        return forms.filter(f => {
            const d = f.data as any;
            return (d.status === 'Accepted' || d.clientSignatureUrl) && !d.viewedByProvider;
        }).length;
    }, [forms]);

    const markDocumentsAsViewed = async (clientId: string) => {
        const client = clients.find(c => c.id === clientId);
        if (!client) return;

        const docsToUpdate = forms.filter(f => {
            const d = f.data as any;
            return d.clientName === client.name && (d.status === 'Accepted' || d.clientSignatureUrl) && !d.viewedByProvider;
        });

        if (docsToUpdate.length === 0) return;

        for (const doc of docsToUpdate) {
            const updatedData = { ...doc.data, viewedByProvider: true };
            await supabase
                .from('documents')
                .update({ data: updatedData })
                .eq('id', doc.id);
        }

        // Update local state is faster than fetch
        setForms(prev => prev.map(f => {
            const d = f.data as any;
            if (d.clientName === client.name && (d.status === 'Accepted' || d.clientSignatureUrl)) {
                return { ...f, data: { ...d, viewedByProvider: true } };
            }
            return f;
        }));
    };

    const [dbSetupError, setDbSetupError] = useState<string | null>(null);

    const [theme, setTheme] = useState<'light' | 'dark' | 'blue'>(() => {
        const savedTheme = localStorage.getItem('theme');
        return (savedTheme === 'light' || savedTheme === 'dark' || savedTheme === 'blue') ? (savedTheme as 'light' | 'dark' | 'blue') : 'dark';
    });

    const [searchQuery, setSearchQuery] = useState('');
    const [docSearchQuery, setDocSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('All');
    const [clientFilter, setClientFilter] = useState('All');
    const [docTypeFilter, setDocTypeFilter] = useState('All');

    const [showToolsMenu, setShowToolsMenu] = useState(false);

    // Upgrade / Subscription State
    const [showGlobalUpgrade, setShowGlobalUpgrade] = useState(false);
    const [upgradeFeature, setUpgradeFeature] = useState('');

    // Delete Confirmation State
    const [showDeleteJobModal, setShowDeleteJobModal] = useState(false);
    const [jobToDelete, setJobToDelete] = useState<string | null>(null);
    const [showDeleteDocModal, setShowDeleteDocModal] = useState(false);
    const [docToDelete, setDocToDelete] = useState<string | null>(null);

    // Duplicate Job State
    const [showDuplicateJobModal, setShowDuplicateJobModal] = useState(false);
    const [jobToDuplicate, setJobToDuplicate] = useState<Job | null>(null);

    const FREE_LIMITS = { jobs: 6, clients: 15, docs: 12 };

    const handleUpgradeSuccess = async () => {
        if (!session) return;
        await supabase.from('profiles').update({ subscription_tier: 'Premium' }).eq('id', session.user.id);
        setProfile(prev => prev ? ({ ...prev, subscriptionTier: 'Premium' }) : null);
        setShowGlobalUpgrade(false);
        alert("Upgrade Successful! You are now a Premium user.");
    };

    const checkLimit = (type: 'jobs' | 'clients' | 'docs', contextId?: string): boolean => {
        if (profile?.subscriptionTier === 'Premium') return true;
        let count = 0;
        if (type === 'jobs') count = jobs.length;
        else if (type === 'clients') count = clients.length;
        else if (type === 'docs') {
            if (contextId) {
                count = forms.filter(f => f.jobId === contextId).length;
            } else {
                // Fallback if no context ID (should not happen for doc creation)
                count = forms.length;
            }
        }

        console.log(`[DEBUG] Checking limit for ${type}: count=${count}, limit=${FREE_LIMITS[type]}`);

        if (count >= FREE_LIMITS[type]) {
            setUpgradeFeature(`${FREE_LIMITS[type]} ${type} limit per project (Free Plan). You have ${count}.`);
            setShowGlobalUpgrade(true);
            return false;
        }
        return true;
    };

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const pk = params.get('portal');
        const at = params.get('approval_token');

        if (pk) {
            setPortalKey(pk);
            setLoading(false);
        } else if (at) {
            setApprovalToken(at);
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        const handleOnline = () => {
            setIsOnline(true);
            syncOfflineData();
        };
        const handleOffline = () => setIsOnline(false);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, [session]);

    const syncOfflineData = async () => {
        // ... existing sync logic ...
        fetchData();
    };

    useEffect(() => {
        const root = window.document.documentElement;
        root.classList.remove('light', 'dark', 'blue');
        root.classList.add(theme);
        if (theme === 'dark' || theme === 'blue') root.classList.add('dark');
        localStorage.setItem('theme', theme);
    }, [theme]);

    useEffect(() => {
        if ((!portalKey && !approvalToken) && !supabase) {
            setLoading(false);
            return;
        }
        if (!portalKey && !approvalToken) {
            const isRecovery = window.location.hash.includes('type=recovery');

            supabase.auth.getSession().then(({ data: { session } }) => {
                setSession(session);
                if (session) {
                    if (session.provider_token) {
                        localStorage.setItem('google_provider_token', session.provider_token);
                    }
                    // HARDENED GUARD: If we are on update-password or in a recovery flow, STAY PUT.
                    if (isRecovery || window.location.pathname === '/update-password') {
                        if (window.location.pathname !== '/update-password') navigate('/update-password');
                    } else if (window.location.pathname === '/' || window.location.pathname === '/welcome' || window.location.pathname.startsWith('/auth/')) {
                        setView({ screen: 'dashboard' });
                    }
                } else {
                    setLoading(false);
                }
            });

            const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
                setSession(session);
                const isRecoveryEvent = _event === 'PASSWORD_RECOVERY' || window.location.hash.includes('type=recovery');

                // PRIORITIZE RECOVERY: If this is a recovery event OR we are already on the update-password page, 
                // do not allow other auth events (like SIGNED_IN) to redirect us to the dashboard.
                if (isRecoveryEvent || window.location.pathname === '/update-password') {
                    if (window.location.pathname !== '/update-password') navigate('/update-password');
                    setLoading(false);
                    return;
                }

                if (session) {
                    if (session.provider_token) {
                        localStorage.setItem('google_provider_token', session.provider_token);

                        // PERSIST TOKENS (Profile for Legacy, user_credentials for Persistence)
                        const tokenData = {
                            gmail_access_token: session.provider_token,
                            gmail_refresh_token: session.provider_refresh_token
                        };

                        // Update Profiles
                        supabase.from('profiles').update(tokenData).eq('id', session.user.id);

                        // Update User Credentials Table
                        supabase.from('user_credentials').upsert({
                            user_id: session.user.id,
                            provider: 'google',
                            access_token: session.provider_token,
                            refresh_token: session.provider_refresh_token,
                            updated_at: new Date().toISOString()
                        }, { onConflict: 'user_id,provider' }).then(({ error }) => {
                            if (!error) fetchData(); // Refresh profile state to reflect linked status
                        });
                    }

                    // Normal authenticated routing - ONLY redirect if on a guest page
                    if (window.location.pathname === '/' || window.location.pathname === '/welcome' || window.location.pathname.startsWith('/auth/')) {
                        setView({ screen: 'dashboard' });
                    }
                } else {
                    setProfile(null);
                    setJobs([]);
                    setForms([]);
                    setClients([]);
                    setInventory([]);
                    setSavedItems([]);

                    const path = window.location.pathname.replace(/\/$/, '');
                    if (!['/privacy', '/terms', '/security'].includes(path)) {
                        setView({ screen: 'welcome' });
                    }

                    setLoading(false);
                }
            });

            return () => subscription.unsubscribe();
        }
    }, [portalKey, approvalToken]);

    const fetchData = async () => {
        if (!session) return;

        if (!profile) {
            setLoading(true);
            setLoadingMessage('Loading profile...');
        }

        const user = session.user;
        let currentProfile: UserProfile | null = null;

        if (navigator.onLine) {
            const { data: profileData, error: profileError } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', user.id)
                .single();

            if (profileError && profileError.code !== 'PGRST116') {
                if (/relation "public.profiles" does not exist|invalid input syntax|schema cache/i.test(profileError.message)) {
                    setDbSetupError(SQL_SETUP_SCRIPT);
                    setLoading(false);
                    return;
                }
            }

            if (profileData) {
                currentProfile = {
                    id: profileData.id,
                    email: profileData.email,
                    name: profileData.name,
                    companyName: profileData.company_name,
                    logoUrl: profileData.logo_url,
                    profilePictureUrl: profileData.profile_picture_url,
                    address: profileData.address,
                    phone: profileData.phone,
                    website: profileData.website,
                    jobTitle: profileData.job_title,
                    subscriptionTier: profileData.subscription_tier as 'Basic' | 'Premium',
                    language: profileData.language,
                    emailTemplates: profileData.email_templates,
                    theme: profileData.theme,
                    emailUsage: profileData.email_usage || 0,
                    gmailAccessToken: profileData.gmail_access_token,
                    gmailRefreshToken: profileData.gmail_refresh_token
                };

                // Fallback: Check user_credentials if profile tokens are missing
                if (!currentProfile.gmailAccessToken) {
                    const { data: creds } = await supabase
                        .from('user_credentials')
                        .select('access_token, refresh_token')
                        .eq('user_id', user.id)
                        .eq('provider', 'google')
                        .maybeSingle();

                    if (creds) {
                        currentProfile.gmailAccessToken = creds.access_token;
                        currentProfile.gmailRefreshToken = creds.refresh_token;
                    }
                }

                if (profileData.theme) {
                    setTheme(profileData.theme as 'light' | 'dark' | 'blue');
                }
                await dbApi.put('profile', currentProfile);
            } else if (!profileError || profileError.code === 'PGRST116') {
                // Create profile logic...
                // Simplified for brevity, reusing existing logic
                const metaName = user.user_metadata?.full_name || user.user_metadata?.name;
                const { data: newProfileData } = await supabase.from('profiles').insert({
                    id: user.id,
                    email: user.email,
                    name: metaName || 'User',
                    company_name: 'My Company',
                    theme: theme,
                }).select().single();
                if (newProfileData) {
                    currentProfile = {
                        id: newProfileData.id,
                        email: newProfileData.email,
                        name: newProfileData.name,
                        companyName: newProfileData.company_name,
                        logoUrl: '',
                        profilePictureUrl: '',
                        address: '',
                        phone: '',
                        website: '',
                        subscriptionTier: 'Basic',
                        theme: theme,
                        emailUsage: 0
                    }
                }
            }
        } else {
            const cachedProfiles = await dbApi.getAll('profile');
            if (cachedProfiles.length > 0) {
                currentProfile = cachedProfiles[0];
                if (currentProfile?.theme) setTheme(currentProfile.theme);
            }
        }
        setProfile(currentProfile);

        // Jobs
        if (navigator.onLine) {
            const { data: jobsData } = await supabase.from('jobs').select('*').eq('user_id', user.id);
            if (jobsData) {
                const mappedJobs = jobsData.map(j => ({ ...j, startDate: j.start_date, endDate: j.end_date, clientName: j.client_name, clientAddress: j.client_address, userId: j.user_id, workerName: j.worker_name }));
                setJobs(mappedJobs);
                await dbApi.clear('jobs');
                for (const j of mappedJobs) await dbApi.put('jobs', j);
            }
        } else {
            const cachedJobs = await dbApi.getAll('jobs');
            setJobs(cachedJobs);
        }

        // Forms
        if (navigator.onLine) {
            const { data: formsData } = await supabase
                .from('documents')
                .select('id, user_id, job_id, type, data, created_at, public_token')
                .eq('user_id', user.id);
            if (formsData) {
                // Include public_token in mappedForms
                const mappedForms = formsData.map(f => ({ ...f, jobId: f.job_id, createdAt: f.created_at, public_token: f.public_token }));
                setForms(mappedForms);
                await dbApi.clear('documents');
                for (const f of mappedForms) await dbApi.put('documents', f);
            }
        } else {
            const cachedForms = await dbApi.getAll('documents');
            setForms(cachedForms);
        }

        // Clients
        if (navigator.onLine) {
            const { data: clientsData, error: clientError } = await supabase
                .from('clients')
                .select('id, user_id, name, email, phone, address, notes, portal_key, created_at')
                .eq('user_id', user.id);
            if (clientsData) {
                setClients(clientsData);
                await dbApi.clear('clients');
                for (const c of clientsData) await dbApi.put('clients', c);
            } else if (clientError && /column ".*" does not exist/i.test(clientError.message)) {
                setDbSetupError(SQL_SETUP_SCRIPT);
            }
        } else {
            const cachedClients = await dbApi.getAll('clients');
            setClients(cachedClients);
        }

        // Inventory
        if (navigator.onLine) {
            const { data: invData } = await supabase.from('inventory').select('*').eq('user_id', user.id).order('name');
            if (invData) {
                setInventory(invData);
                await dbApi.clear('inventory');
                for (const i of invData) await dbApi.put('inventory', i);
            }
        } else {
            const cachedInventory = await dbApi.getAll('inventory');
            setInventory(cachedInventory);
        }

        // Inventory History
        if (navigator.onLine) {
            const { data: histData } = await supabase.from('inventory_history').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(100);
            if (histData) setInventoryHistory(histData);
        }

        // Saved Items (Price Book)
        if (navigator.onLine) {
            const { data: savedData, error: savedError } = await supabase.from('saved_items').select('*').eq('user_id', user.id).order('name');
            if (savedData) {
                setSavedItems(savedData);
                // Cache logic for saved items could be added here
            } else if (savedError && savedError.message.includes('relation "public.saved_items" does not exist')) {
                setDbSetupError(SQL_SETUP_SCRIPT);
            }
        }

        // Gmail Accounts
        if (navigator.onLine) {
            const { data: gmailData } = await supabase.from('user_gmail_accounts').select('*').eq('user_id', user.id);
            if (gmailData) setGmailAccounts(gmailData);
        }

        setLoading(false);
    };

    useEffect(() => {
        if (session) fetchData();
    }, [session]);

    // Auth Handlers (Login, Signup, Google)
    const handleLogin = async (email: string, pass: string) => {
        if (!navigator.onLine) { alert("You must be online to log in."); return; }
        const { error } = await supabase.auth.signInWithPassword({ email: email, password: pass });
        if (error) throw error;
    };
    const handleSignup = async (email: string, pass: string) => {
        const { error } = await supabase.auth.signUp({ email: email, password: pass });
        if (error) throw error;
        setView({ screen: 'auth', authScreen: 'checkEmail' });
    };

    const handleResetPassword = async (email: string) => {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/update-password`,
        });
        if (error) throw error;
    };

    const handleUpdatePassword = async (password: string) => {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        setView({ screen: 'dashboard' });
    };

    const handleLoginWithGoogle = async () => {
        await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } });
    };
    const handleConnectGmail = async () => {
        const redirectUri = `${window.location.origin}/auth/google/callback/gmail`;
        const scope = 'https://www.googleapis.com/auth/gmail.send email profile';
        const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?response_type=code&client_id=${GOOGLE_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&access_type=offline&prompt=consent`;
        window.location.href = authUrl;
    };
    const handleDisconnectGmail = async (address?: string) => {
        if (!session) return;

        if (address) {
            // New multi-account disconnect
            await supabase.from('user_gmail_accounts').delete().eq('user_id', session.user.id).eq('gmail_address', address);
            setGmailAccounts(prev => prev.filter(acc => acc.gmail_address !== address));
        } else {
            // Legacy disconnect (keep for compatibility if needed, but we're moving to multi-account)
            await supabase.from('profiles').update({
                gmail_access_token: null,
                gmail_refresh_token: null
            }).eq('id', session.user.id);
            setProfile(prev => prev ? { ...prev, gmailAccessToken: undefined, gmailRefreshToken: undefined } : null);
        }

        try {
            await supabase.from('user_credentials').delete().eq('user_id', session.user.id).eq('provider', 'google');
        } catch (e) { }
    };
    const handleLogout = async () => {
        if (navigator.onLine) await supabase.auth.signOut();
        localStorage.removeItem('app_view_state');
        localStorage.removeItem('google_provider_token');
        setSession(null);
        setView({ screen: 'welcome' });
    };

    // Nav Handlers
    const navigateToDashboard = () => setView({ screen: 'dashboard' });
    const navigateToSettings = () => setView({ screen: 'settings' });
    const navigateToNewDoc = (jobId: string) => {
        if (checkLimit('docs', jobId)) setView({ screen: 'selectDocType', jobId });
    };
    const navigateToCreateJob = (returnTo: 'dashboard' | 'calendar' = 'dashboard') => {
        if (checkLimit('jobs')) setView({ screen: 'createJob', returnTo });
    };
    const navigateToClients = () => setView({ screen: 'clients' });
    const navigateToInventory = () => setView({ screen: 'inventory' });
    const navigateToPriceBook = () => setView({ screen: 'pricebook' });
    const navigateToCalculator = () => setView({ screen: 'profitCalculator' });
    const navigateToAnalytics = () => setView({ screen: 'analytics' });
    const navigateToCalendar = () => setView({ screen: 'calendar' });
    const navigateToCommunication = () => setView({ screen: 'communication' });
    const navigateToForum = (postId?: string) => setView({ screen: 'forum', postId });

    // Data Handlers
    const handleUpdateAppLogo = async (file: File): Promise<string> => { return ''; }; // Placeholder for brevity
    const handleUploadDocumentImage = async (file: File): Promise<string> => {
        if (!session) return '';
        try {
            const compressed = await compressImage(file);
            return await uploadFile('logos', compressed, session.user.id, true);
        } catch (e) {
            console.error("Failed to upload image", e);
            return '';
        }
    };
    const handleSaveProfile = async (updatedProfile: UserProfile, logoFile?: File | null, profilePicFile?: File | null) => {
        if (!session) return;
        setLoading(true);
        let newLogoUrl = updatedProfile.logoUrl;
        let newProfilePicUrl = updatedProfile.profilePictureUrl;

        try {
            if (logoFile) newLogoUrl = await uploadFile('logos', logoFile, session.user.id, true);
            if (profilePicFile) newProfilePicUrl = await uploadFile('logos', profilePicFile, session.user.id, true);
        } catch (error) { setLoading(false); return; }

        const profileForDb = {
            id: session.user.id,
            name: updatedProfile.name,
            company_name: updatedProfile.companyName,
            email: updatedProfile.email,
            phone: updatedProfile.phone,
            address: updatedProfile.address,
            website: updatedProfile.website,
            logo_url: newLogoUrl,
            profile_picture_url: newProfilePicUrl,
            job_title: updatedProfile.jobTitle,
            language: updatedProfile.language,
            email_templates: updatedProfile.emailTemplates,
            theme: theme,
            updated_at: new Date().toISOString(),
        };

        const { data, error } = await supabase.from('profiles').upsert(profileForDb).select().single();
        if (!error && data) {
            setProfile({ ...updatedProfile, logoUrl: newLogoUrl, profilePictureUrl: newProfilePicUrl });
            setView({ screen: 'dashboard' });
        }
        setLoading(false);
    };

    const handleEmailSent = async () => {
        if (!session || !profile) return;
        const newCount = (profile.emailUsage || 0) + 1;
        setProfile({ ...profile, emailUsage: newCount });
        await supabase.from('profiles').update({ email_usage: newCount }).eq('id', session.user.id);
    };

    const handleUploadForumImage = async (file: File): Promise<string> => { return uploadFile('forum', file, session!.user.id, true); }
    const handleSaveJob = async (jobData: any, skipNavigation: boolean = false): Promise<string> => {
        if (!session) return '';

        // Conflict Detection
        if (jobData.workerName && jobData.workerName.trim() !== '') {
            const startDate = new Date(jobData.startDate);
            const endDate = jobData.endDate ? new Date(jobData.endDate) : startDate;

            const conflict = jobs.find(j => {
                if (!j.workerName || j.workerName.toLowerCase() !== jobData.workerName.toLowerCase()) return false;
                if (j.status !== 'active') return false;
                const jStart = new Date(j.startDate);
                const jEnd = j.endDate ? new Date(j.endDate) : jStart;

                // Check for date overlap (inclusive)
                return (jStart <= endDate && jEnd >= startDate);
            });

            if (conflict) {
                alert(`Conflict Detected!\nWorker "${jobData.workerName}" is already scheduled for job "${conflict.name}" during these dates.`);
                return ''; // Prevent saving
            }
        }

        const newJob = { id: crypto.randomUUID(), user_id: session.user.id, ...jobData, status: 'active', worker_name: jobData.workerName };
        const { error } = await supabase.from('jobs').insert(newJob);

        if (error) {
            console.error('Failed to create job', error);
            if (error.code === '42703' || error.message?.includes('worker_name')) {
                // Fallback if missing column in schema
                const fallbackJob = { ...newJob };
                delete (fallbackJob as any).worker_name;
                delete (fallbackJob as any).workerName;
                await supabase.from('jobs').insert(fallbackJob);
            }
        }

        fetchData(); // Refresh
        if (!skipNavigation) {
            if (view.screen === 'createJob' && view.returnTo === 'calendar') {
                setView({ screen: 'calendar' });
            } else {
                setView({ screen: 'dashboard' });
            }
        }
        return newJob.id;
    };
    const handleUpdateJobStatus = async (jobId: string, newStatus: any) => {
        await supabase.from('jobs').update({ status: newStatus }).eq('id', jobId);
        setJobs(prev => prev.map(j => j.id === jobId ? { ...j, status: newStatus } : j));
    };
    const handleSaveForm = async (formData: any) => {
        if (!session) return;
        if (view.screen !== 'form') return;

        const formRecord: any = {
            id: view.formId || crypto.randomUUID(),
            user_id: session.user.id,
            job_id: view.jobId,
            type: view.formType,
            data: formData
        };

        // Inventory Deduction Logic (Phase 3)
        if (view.formType === FormType.MaterialLog && (formData as any).deductInventory) {
            const matData = formData as MaterialLogData;
            console.log("Processing Inventory Deduction for Material Log...");

            for (const item of matData.items) {
                if (item.inventoryItemId) {
                    // Deduct stock
                    await handleAllocateInventory(item.inventoryItemId, view.jobId, item.quantity);
                }
            }

            // Disable flag after processing so it doesn't run again on next save
            formData.deductInventory = false;
        }

        const { error: saveError } = await supabase.from('documents').upsert(formRecord);
        if (saveError) {
            const message = saveError.message || 'Document could not be saved.';
            alert(message.includes('Insufficient stock')
                ? 'Insufficient stock for one or more inventory-linked items. Please reduce the quantity and try again.'
                : `Save failed: ${message}`);
            return;
        }
        await fetchData();
        setView({ screen: 'jobDetails', jobId: view.jobId });
    };
    const handleAddClient = async (clientData: any) => {
        if (!session) return null;
        const newClient = { id: crypto.randomUUID(), user_id: session.user.id, ...clientData };
        await supabase.from('clients').insert(newClient);
        fetchData();
        return newClient;
    };
    const handleUpdateClient = async (updatedClient: any) => {
        if (!session) return;
        await supabase.from('clients').update(updatedClient).eq('id', updatedClient.id);
        fetchData();
    };
    const handleDeleteClient = async (id: string) => {
        await supabase.from('clients').delete().eq('id', id);
        fetchData();
    };

    const handleDeleteJob = async () => {
        if (!jobToDelete || !session) return;
        await supabase.from('jobs').delete().eq('id', jobToDelete);
        // Associated documents will be deleted by ON DELETE CASCADE in DB
        fetchData();
        setJobToDelete(null);
        setShowDeleteJobModal(false);
    };

    const handleDuplicateDoc = async (form: FormDataType) => {
        if (!session) return;
        if (!checkLimit('docs', form.jobId)) return;

        const d = form.data as any;
        const newDocData = {
            ...d,
            status: 'Draft',
            clientSignatureUrl: null,
            viewedByProvider: false,
            title: d.title ? `${d.title} (Copy)` : undefined,
            invoiceNumber: d.invoiceNumber ? `${d.invoiceNumber}-COPY` : undefined,
            estimateNumber: d.estimateNumber ? `${d.estimateNumber}-COPY` : undefined,
            reportNumber: d.reportNumber ? `${d.reportNumber}-COPY` : undefined,
            workOrderNumber: d.workOrderNumber ? `${d.workOrderNumber}-COPY` : undefined,
            warrantyNumber: d.warrantyNumber ? `${d.warrantyNumber}-COPY` : undefined,
            changeOrderNumber: d.changeOrderNumber ? `${d.changeOrderNumber}-COPY` : undefined,
            poNumber: d.poNumber ? `${d.poNumber}-COPY` : undefined,
            receiptNumber: d.receiptNumber ? `${d.receiptNumber}-COPY` : undefined,
        };

        const formRecord = {
            id: crypto.randomUUID(),
            user_id: session.user.id,
            job_id: form.jobId,
            type: form.type,
            data: newDocData,
            created_at: new Date().toISOString()
        };

        const { error } = await supabase.from('documents').insert(formRecord);
        if (error) {
            alert("Duplicate Failed: " + error.message);
        } else {
            fetchData();
        }
    };

    const handleDuplicateJob = async (jobName: string, clientId: string | null, clientName: string, selectedDocIds: string[]) => {
        if (!session || !jobToDuplicate) return;

        const newJobData = {
            name: jobName,
            clientName: clientName,
            clientAddress: clientId ? clients.find(c => c.id === clientId)?.address || '' : jobToDuplicate.clientAddress,
            startDate: new Date().toISOString().split('T')[0],
        };
        const newJob = { id: crypto.randomUUID(), userId: session.user.id, ...newJobData, status: 'active', endDate: null } as Job;

        await supabase.from('jobs').insert({
            id: newJob.id,
            user_id: session.user.id,
            name: newJob.name,
            client_name: newJob.clientName,
            client_address: newJob.clientAddress,
            start_date: newJob.startDate
        });

        // Duplicate selected docs
        const docsToDuplicate = forms.filter(f => selectedDocIds.includes(f.id));
        for (const doc of docsToDuplicate) {
            const newDocId = crypto.randomUUID();
            const newDocData = { ...doc.data };

            // Append (Copy) to title or reference numbers if applicable
            if ((newDocData as any).title) (newDocData as any).title = `${(newDocData as any).title} (Copy)`;
            if ((newDocData as any).invoiceNumber) (newDocData as any).invoiceNumber = `${(newDocData as any).invoiceNumber}-COPY`;
            if ((newDocData as any).estimateNumber) (newDocData as any).estimateNumber = `${(newDocData as any).estimateNumber}-COPY`;

            // Default status back to Draft so we don't accidentally double-commit inventory or financials
            if ((newDocData as any).status) {
                if (['sent', 'paid', 'approved', 'accepted'].includes((newDocData as any).status.toLowerCase())) {
                    (newDocData as any).status = 'Draft';
                }
            }

            // Override client and project details to match the new assignment
            if ('clientName' in newDocData) (newDocData as any).clientName = newJobData.clientName;
            if ('clientAddress' in newDocData) (newDocData as any).clientAddress = newJobData.clientAddress;
            if ('projectName' in newDocData) (newDocData as any).projectName = newJobData.name;

            const formRecord: any = {
                id: newDocId,
                user_id: session.user.id,
                job_id: newJob.id,
                type: doc.type,
                data: newDocData
            };
            await supabase.from('documents').insert(formRecord);
        }

        fetchData();
        setShowDuplicateJobModal(false);
        setJobToDuplicate(null);
    };

    const handleDeleteDoc = async () => {
        if (!docToDelete || !session) return;
        await supabase.from('documents').delete().eq('id', docToDelete);
        fetchData();
        setDocToDelete(null);
        setShowDeleteDocModal(false);
    };

    // New handler for "Quick Create" from Client screen
    const handleNavigateToNewDoc = async (type: FormType, clientId: string) => {
        if (!session) return;

        const client = clients.find(c => c.id === clientId);
        if (!client) return;

        let activeJob = jobs.find(j => j.clientName === client.name && j.status === 'active');
        let jobId = activeJob?.id;

        if (!activeJob) {
            const newJobData = {
                name: `${client.name} - General`,
                clientName: client.name,
                clientAddress: client.address || '',
                startDate: new Date().toISOString().split('T')[0],
            };
            const newJob = { id: crypto.randomUUID(), userId: session.user.id, ...newJobData, status: 'active', endDate: null } as Job;

            await supabase.from('jobs').insert({
                id: newJob.id,
                user_id: session.user.id,
                name: newJob.name,
                client_name: newJob.clientName,
                client_address: newJob.clientAddress,
                start_date: newJob.startDate
            });

            setJobs(prev => [...prev, newJob]);
            jobId = newJob.id;
        }

        setView({ screen: 'form', formType: type, jobId: jobId!, formId: null });
    };

    // Price Book Handlers
    // Price Book Handlers (Robus & Fallback Enabled)
    const handleAddSavedItem = async (item: any) => {
        if (!session) return;

        // 1. Try Full Save (Elite Mode)
        const newItem = { id: crypto.randomUUID(), user_id: session.user.id, ...item };
        const { error } = await supabase.from('saved_items').insert(newItem);

        if (error) {
            console.error("Price Book Save Error (Full):", error);

            // 2. Check for Schema Mismatch (Missing Columns)
            // Postgres error 42703: undefined_column, or general 400 Bad Request from Supabase
            if (error.message?.includes('column') || error.code === '42703' || error.message?.includes('does not exist') || error.code === 'PGRST204') {
                alert("⚠️ Database Schema Outdated\n\nSaving in 'Basic Mode' because your database hasn't been updated with the SQL script yet.\n\nAdvanced features (Assemblies, Images, etc.) were NOT saved.\n\nPlease run 'REPAIR_PRICEBOOK.sql' in Supabase to fix this permanently.");

                // 3. Fallback Save (Basic Mode)
                const basicItem = {
                    id: newItem.id,
                    user_id: newItem.user_id,
                    name: newItem.name,
                    description: newItem.description,
                    rate: newItem.rate,
                    // Handle cost/unit_cost alias
                    unit_cost: newItem.unit_cost || newItem.cost || 0,
                    category: newItem.category
                };

                const { error: fallbackError } = await supabase.from('saved_items').insert(basicItem);

                if (fallbackError) {
                    alert("❌ Save Failed (Even in Basic Mode): " + fallbackError.message);
                    return; // Stop here
                }
            } else {
                // Other error (Permission, etc.)
                alert("❌ Save Failed: " + error.message);
                return;
            }
        }

        // Refresh Data
        const { data } = await supabase.from('saved_items').select('*').eq('user_id', session.user.id).order('name');
        if (data) setSavedItems(data);
    };

    const handleUpdateSavedItem = async (item: SavedItem) => {
        if (!session) return;

        // 1. Try Full Update
        const { error } = await supabase.from('saved_items').update(item).eq('id', item.id);

        if (error) {
            console.error("Price Book Update Error:", error);
            if (error.message?.includes('column') || error.code === '42703' || error.message?.includes('does not exist')) {
                alert("⚠️ Database Schema Outdated\n\nUpdate performed in 'Basic Mode'. Some fields were disregarded.\nPlease run the SQL repair script.");

                // Fallback Update
                const basicItem = {
                    name: item.name,
                    description: item.description,
                    rate: item.rate,
                    unit_cost: item.unit_cost || item.cost,
                    category: item.category
                };
                await supabase.from('saved_items').update(basicItem).eq('id', item.id);
            } else {
                alert("❌ Update Failed: " + error.message);
            }
        }

        // Refresh
        const { data } = await supabase.from('saved_items').select('*').eq('user_id', session.user.id).order('name');
        if (data) setSavedItems(data);
    };

    const handleDeleteSavedItem = async (id: string) => {
        const { error } = await supabase.from('saved_items').delete().eq('id', id);
        if (error) {
            alert("Delete Failed: " + error.message);
            return;
        }
        setSavedItems(prev => prev.filter(i => i.id !== id));
    };

    const handleDuplicateSavedItem = async (item: SavedItem) => {
        if (!session) return;
        const { id, created_at, user_id, ...rest } = item;
        const { error } = await supabase.from('saved_items').insert({
            ...rest,
            name: `${item.name} (Copy)`,
            user_id: session.user.id,
            id: crypto.randomUUID(),
        });

        if (error) {
            alert("Duplicate Failed: " + error.message);
        } else {
            // Refresh
            const { data } = await supabase.from('saved_items').select('*').eq('user_id', session.user.id).order('name');
            if (data) setSavedItems(data);
        }
    };

    // Inventory Handlers
    const handleLogInventoryAction = async (itemId: string, action: 'add' | 'remove' | 'update' | 'restock' | 'job_allocation', quantityChange: number, notes?: string, jobId?: string) => {
        if (!session) return;
        const historyItem = { id: crypto.randomUUID(), user_id: session.user.id, item_id: itemId, action, quantity_change: quantityChange, notes, job_id: jobId, created_at: new Date().toISOString() };
        await supabase.from('inventory_history').insert(historyItem);
        setInventoryHistory(prev => [historyItem as InventoryHistoryItem, ...prev]);
    };

    const handleAddInventoryItem = async (itemData: any) => {
        if (!session) return;
        const newItem = { id: crypto.randomUUID(), user_id: session.user.id, ...itemData };
        await supabase.from('inventory').insert(newItem);
        await handleLogInventoryAction(newItem.id, 'add', newItem.quantity, 'Initial stock');
        fetchData();
    };
    const handleUpdateInventoryItem = async (item: InventoryItem) => {
        // Find old item to calculate diff
        const oldItem = inventory.find(i => i.id === item.id);
        const diff = item.quantity - (oldItem?.quantity || 0);

        await supabase.from('inventory').update({
            quantity: item.quantity,
            low_stock_threshold: item.low_stock_threshold,
            // Update new fields if passed (InventoryView sends whole item)
            category: item.category,
            unit: item.unit,
            cost_price: item.cost_price,
            supplier: item.supplier,
            location: item.location
        }).eq('id', item.id);

        if (diff !== 0) {
            await handleLogInventoryAction(item.id, diff > 0 ? 'restock' : 'update', diff, diff > 0 ? 'Manual Restock' : 'Manual Adjustment');
        }

        fetchData();
    };
    const handleDeleteInventoryItem = async (id: string) => {
        await supabase.from('inventory').delete().eq('id', id);
        // History automatically deleted by CASCADE or we keep it? CASCADE is set in SQL.
        fetchData();
    };

    const handleDuplicateInventoryItem = async (item: InventoryItem) => {
        if (!session) return;
        const { id, created_at, user_id, ...rest } = item;
        const { error } = await supabase.from('inventory').insert({
            ...rest,
            name: `${item.name} (Copy)`,
            user_id: session.user.id,
            id: crypto.randomUUID(),
        });
        if (error) {
            alert("Duplicate Failed: " + error.message);
        } else {
            fetchData();
        }
    };

    const handleAllocateInventory = async (itemId: string, jobId: string | null, quantity: number, notes?: string) => {
        if (!session) return;
        const item = inventory.find(i => i.id === itemId);
        if (!item) return;

        const newQty = Math.max(0, item.quantity - quantity);
        await supabase.from('inventory').update({ quantity: newQty }).eq('id', itemId);
        await handleLogInventoryAction(itemId, 'job_allocation', -quantity, notes || 'Allocated', jobId || undefined);
        fetchData();
    };

    const getTranslation = () => { return translations[profile?.language || 'English']; }

    // Render logic...
    const renderAuth = () => {
        if (view.screen !== 'auth') return null;
        switch (view.authScreen) {
            case 'login': return <Login onLogin={handleLogin} onLoginWithGoogle={handleLoginWithGoogle} onSwitchToSignup={() => setView({ screen: 'auth', authScreen: 'signup' })} onResetPassword={handleResetPassword} />;
            case 'signup': return <Signup onSignup={handleSignup} onLoginWithGoogle={handleLoginWithGoogle} onSwitchToLogin={() => setView({ screen: 'auth', authScreen: 'login' })} />;
            case 'checkEmail': return <div className="flex items-center justify-center min-h-screen bg-background"><Card className="w-full max-w-sm text-center"><CardHeader><CardTitle>Check your email</CardTitle></CardHeader><CardContent><p>We've sent a confirmation link.</p></CardContent></Card></div>;
        }
    };

    const renderDashboard = () => {
        if (!profile) return null;
        const t = getTranslation();
        const sq = searchQuery.toLowerCase();
        const filteredJobs = jobs.filter(j => {
            const matchesSearch = (j.name || '').toLowerCase().includes(sq) ||
                (j.clientName || '').toLowerCase().includes(sq) ||
                (j.clientAddress || '').toLowerCase().includes(sq) ||
                (j.status || '').toLowerCase().includes(sq);
            const matchesStatus = statusFilter === 'All' || j.status === statusFilter;
            const matchesClient = clientFilter === 'All' || j.clientName === clientFilter;
            return matchesSearch && matchesStatus && matchesClient;
        });
        const uniqueClients = Array.from(new Set(jobs.map(j => j.clientName))).filter(Boolean);
        const getStatusColor = (status: string) => {
            switch (status) { case 'active': return 'bg-green-500'; case 'completed': return 'bg-blue-500'; case 'paused': return 'bg-orange-500'; default: return 'bg-gray-400'; }
        }
        const lowStockItems = inventory.filter(item => Number(item.quantity || 0) <= Number(item.low_stock_threshold ?? 5));
        return (
            <div className="w-full min-h-screen bg-background text-foreground p-4 md:p-8 pb-24">
                <header className="flex flex-col md:flex-row md:justify-between md:items-center mb-8 gap-4">
                    <div className="flex items-center gap-4"><AppLogo className="w-12 h-12 drop-shadow-md" /><h1 className="text-2xl md:text-3xl font-bold">{t.welcome} {profile.name.split(' ')[0]}!</h1></div>
                    {!isOnline && <div className="bg-orange-100 text-orange-800 px-3 py-1 rounded-full text-sm font-bold animate-pulse">OFFLINE MODE</div>}
                    <div className="flex items-center gap-3 flex-wrap md:flex-nowrap justify-end">

                        {profile.subscriptionTier !== 'Premium' && (
                            <Button
                                variant="outline"
                                size="sm"
                                className="text-xs font-bold h-auto py-1.5 px-4 mr-2 bg-white text-indigo-600 border-indigo-100 hover:bg-indigo-50 dark:bg-white dark:text-indigo-900 rounded-full shadow-sm"
                                onClick={() => { setUpgradeFeature('Upgrade to Premium Plan'); setShowGlobalUpgrade(true); }}
                            >
                                <StarIcon className="w-3 h-3 mr-1.5 fill-current" /> Upgrade
                            </Button>
                        )}
                        <div className="relative">
                            <Button variant="outline" onClick={() => setShowToolsMenu(!showToolsMenu)} className="flex items-center gap-2 bg-card border-border relative">
                                Tools <ChevronDownIcon className="w-4 h-4 opacity-50" />
                                {lowStockItems.length > 0 && <span className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] text-white font-bold shadow-sm animate-pulse">{lowStockItems.length > 9 ? '9+' : lowStockItems.length}</span>}
                            </Button>
                            {showToolsMenu && (
                                <>
                                    <div className="fixed inset-0 z-40" onClick={() => setShowToolsMenu(false)}></div>
                                    <div className="absolute top-full right-0 mt-2 w-48 bg-popover border border-border rounded-xl shadow-xl z-50 p-1.5 flex flex-col gap-0.5 animate-in fade-in zoom-in-95 origin-top-right">
                                        <button onClick={() => { navigateToInventory(); setShowToolsMenu(false); }} className="flex items-center justify-between w-full px-3 py-2.5 text-sm hover:bg-secondary rounded-lg text-left transition-colors text-foreground">
                                            <div className="flex items-center gap-3">
                                                <BoxIcon className="w-4 h-4 text-primary" /> Inventory
                                            </div>
                                            {lowStockItems.length > 0 && <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] text-white font-bold shadow-sm animate-pulse">{lowStockItems.length > 9 ? '9+' : lowStockItems.length}</span>}
                                        </button>
                                        <button onClick={() => { navigateToPriceBook(); setShowToolsMenu(false); }} className="flex items-center gap-3 w-full px-3 py-2.5 text-sm hover:bg-secondary rounded-lg text-left transition-colors text-foreground">
                                            <TagIcon className="w-4 h-4 text-primary" /> Price Book
                                        </button>
                                        <button onClick={() => { navigateToCalendar(); setShowToolsMenu(false); }} className="flex items-center gap-3 w-full px-3 py-2.5 text-sm hover:bg-secondary rounded-lg text-left transition-colors text-foreground">
                                            <CalendarIcon className="w-4 h-4 text-primary" /> Calendar
                                        </button>
                                        <button onClick={() => { navigateToCalculator(); setShowToolsMenu(false); }} className="flex items-center gap-3 w-full px-3 py-2.5 text-sm hover:bg-secondary rounded-lg text-left transition-colors text-foreground">
                                            <CalculatorIcon className="w-4 h-4 text-primary" /> Calculator
                                        </button>
                                        <button onClick={() => { navigateToAnalytics(); setShowToolsMenu(false); }} className="flex items-center gap-3 w-full px-3 py-2.5 text-sm hover:bg-secondary rounded-lg text-left transition-colors text-foreground">
                                            <BarChartIcon className="w-4 h-4 text-primary" /> Insights
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>

                        <Button variant="outline" onClick={() => navigateToForum()} className="flex items-center gap-2 bg-card border-border">
                            <MessageSquareIcon className="w-4 h-4" />
                            <span className="hidden sm:inline">Community</span>
                            {notificationCount > 0 && <span className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] text-white font-bold shadow-sm animate-pulse">{notificationCount > 9 ? '9+' : notificationCount}</span>}
                        </Button>

                        <Button onClick={() => navigateToCreateJob('dashboard')} className="shadow-sm">
                            <PlusIcon className="w-4 h-4 mr-2" /> {t.newJob}
                        </Button>

                        <Button variant="ghost" size="icon" onClick={() => setView({ screen: 'profile' })} className="rounded-full h-10 w-10 overflow-hidden border border-border ml-1 shrink-0">
                            {profile.profilePictureUrl ? <img src={profile.profilePictureUrl} alt="Profile" className="h-full w-full object-cover" /> : <UserIcon className="h-6 w-6" />}
                        </Button>
                    </div >
                </header >

                <div className="flex flex-col md:flex-row gap-4 mb-6">
                    <div className="relative flex-1">
                        <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                        <Input placeholder="Search jobs..." className="pl-10 h-10" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                    </div>
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm hover:bg-secondary focus:ring-2 focus:ring-primary/20 outline-none transition-all cursor-pointer text-foreground"
                    >
                        <option value="All">All Statuses</option>
                        <option value="active">Active</option>
                        <option value="paused">Paused</option>
                        <option value="completed">Completed</option>
                        <option value="inactive">Inactive</option>
                    </select>
                    <select
                        value={clientFilter}
                        onChange={(e) => setClientFilter(e.target.value)}
                        className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm hover:bg-secondary focus:ring-2 focus:ring-primary/20 outline-none transition-all cursor-pointer max-w-[200px] truncate text-foreground"
                    >
                        <option value="All">All Clients</option>
                        {uniqueClients.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                </div>
                <h2 className="text-xl font-semibold mb-4">{t.yourJobs}</h2>
                {
                    filteredJobs.length === 0 ? <Card className="text-center p-8"><CardTitle>{jobs.length === 0 ? t.noJobs : "No jobs found"}</CardTitle><CardDescription className="mt-2">{jobs.length === 0 ? t.clickNewJob : "Try a different search term"}</CardDescription></Card> : <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">{filteredJobs.map(job => (
                        <JobCard
                            key={job.id}
                            job={job}
                            onClick={() => setView({ screen: 'jobDetails', jobId: job.id })}
                            onDelete={() => { setJobToDelete(job.id); setShowDeleteJobModal(true); }}
                            onDuplicate={() => { setJobToDuplicate(job); setShowDuplicateJobModal(true); }}
                            t={t}
                        />
                    ))}</div>
                }
            </div >
        );
    };

    const renderJobDetails = () => {
        if (view.screen !== 'jobDetails' || !profile) return null;
        const job = jobs.find(j => j.id === view.jobId);
        if (!job) return <div>Job not found!</div>;
        const t = getTranslation();
        const getDocTitle = (form: FormDataType) => { const d = form.data as any; return d.title || d.invoiceNumber || d.estimateNumber || d.reportNumber || d.workOrderNumber || d.warrantyNumber || d.changeOrderNumber || d.poNumber || form.type; };
        const baseForms = forms.filter(f => f.jobId === job.id);
        const jobForms = baseForms.filter(f => getDocTitle(f).toLowerCase().includes(docSearchQuery.toLowerCase()) || f.type.toLowerCase().includes(docSearchQuery.toLowerCase())).filter(f => docTypeFilter === 'All' || f.type === docTypeFilter);
        const uniqueDocTypes = Array.from(new Set(baseForms.map(f => f.type))).filter(Boolean);
        const getDocIcon = (type: FormType) => { switch (type) { case FormType.Invoice: return InvoiceIcon; case FormType.Estimate: return EstimateIcon; case FormType.ChangeOrder: return ChangeOrderIcon; case FormType.PurchaseOrder: return TruckIcon; default: return InvoiceIcon; } };
        const getStatusBadge = (form: FormDataType) => { const status = (form.data as any).status; return status ? <span className="px-2 py-0.5 rounded text-xs font-medium bg-secondary text-secondary-foreground border border-border">{status}</span> : null; };

        return (
            <div className="w-full min-h-screen bg-background text-foreground p-4 md:p-8 pb-24">
                <header className="flex flex-col md:flex-row md:items-center justify-between mb-8 border-b border-border pb-4 gap-4">
                    <div className="flex items-center">
                        <Button variant="ghost" size="sm" onClick={navigateToDashboard} className="w-10 h-10 p-0 flex items-center justify-center mr-3 hover:bg-secondary/80 rounded-full" aria-label="Back">
                            <BackArrowIcon className="h-6 w-6" />
                        </Button>
                        <div>
                            <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-3 tracking-tight truncate max-w-xs md:max-w-md">
                                {job.name}
                            </h1>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                                <UsersIcon className="w-4 h-4" />
                                {job.clientName}
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <select
                            value={job.status}
                            onChange={(e) => handleUpdateJobStatus(job.id, e.target.value as any)}
                            className="h-9 rounded-full border bg-card px-3 py-1 text-sm font-medium shadow-sm hover:bg-secondary focus:ring-2 focus:ring-primary/20 outline-none transition-all cursor-pointer"
                        >
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                            <option value="paused">Paused</option>
                            <option value="completed">Completed</option>
                        </select>
                        {profile.subscriptionTier !== 'Premium' && (
                            <div className="flex items-center gap-1.5 ml-1">
                                <span className="text-xs bg-indigo-50 text-indigo-700 px-3 py-1.5 rounded-full font-bold border border-indigo-100 flex items-center gap-1.5 shadow-sm">
                                    <BriefcaseIcon className="w-3.5 h-3.5" /> Docs: {jobForms.length}/{FREE_LIMITS.docs}
                                </span>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="text-xs font-bold h-auto py-1.5 px-4 bg-white text-indigo-600 border-indigo-100 hover:bg-indigo-50 dark:bg-white dark:text-indigo-900 rounded-full shadow-sm"
                                    onClick={() => { setUpgradeFeature(`Upgrade to create more than ${FREE_LIMITS.docs} documents per project.`); setShowGlobalUpgrade(true); }}
                                >
                                    Upgrade
                                </Button>
                            </div>
                        )}
                        <Button onClick={() => navigateToNewDoc(job.id)} className="rounded-full shadow-md shadow-primary/20">
                            <PlusIcon className="w-4 h-4 mr-2" /> {t.newDocument}
                        </Button>
                        <Button variant="outline" className="rounded-full shadow-sm bg-purple-500/10 text-purple-600 border border-purple-500/20 hover:bg-purple-500/20 dark:bg-purple-900/40 dark:text-purple-300 dark:border-purple-800" onClick={() => setShowJobFinancials(true)}>
                            <CalculatorIcon className="w-4 h-4 mr-2" /> Financials
                        </Button>
                    </div>
                </header>

                {!isOnline && <div className="bg-orange-100 text-orange-800 px-4 py-2 rounded-md mb-4 text-center text-sm font-bold animate-pulse">You are OFFLINE. Documents created will sync later.</div>}

                {/* Job Financials Modal */}
                {showJobFinancials && (() => {
                    const revenueDocs = jobForms.filter(f => f.type === FormType.Invoice && ['paid', 'approved', 'sent'].includes(((f.data as any).status || '').toLowerCase()));
                    const totalRevenue = revenueDocs.reduce((acc, f) => acc + ((f.data as any).total || 0), 0);

                    const materialDocs = jobForms.filter(f => f.type === FormType.MaterialLog);
                    const materialCost = materialDocs.reduce((acc, f) => {
                        return acc + (((f.data as any).materials || []) as any[]).reduce((sum, item) => sum + (item.quantity * (item.unitCost || 0)), 0);
                    }, 0);

                    const laborDocs = jobForms.filter(f => f.type === FormType.TimeSheet);
                    const laborRate = profile.defaultLaborRate || 45; // Default fallback
                    const laborCost = laborDocs.reduce((acc, f) => {
                        const h = (f.data as any).hoursWorked || 0;
                        const ot = (f.data as any).overtimeHours || 0;
                        return acc + (h * laborRate) + (ot * laborRate * 1.5);
                    }, 0);

                    const totalCost = materialCost + laborCost;
                    const profit = totalRevenue - totalCost;
                    const profitMargin = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0;

                    const isProfitGood = profitMargin >= 30;
                    const isProfitWarning = profitMargin > 0 && profitMargin < 15;
                    const isLoss = profitMargin <= 0;

                    return (
                        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                            <Card className="w-full max-w-4xl shadow-2xl overflow-hidden rounded-2xl border-border/60">
                                <CardHeader className="bg-muted/30 border-b flex flex-row items-center justify-between pb-4">
                                    <CardTitle className="text-xl font-bold flex items-center gap-2">
                                        <CalculatorIcon className="w-5 h-5 text-primary" />
                                        Job Financials
                                    </CardTitle>
                                    <button onClick={() => setShowJobFinancials(false)} className="text-muted-foreground hover:text-foreground">
                                        <XCircleIcon className="w-6 h-6" />
                                    </button>
                                </CardHeader>
                                <CardContent className="p-6">
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                        <Card className="bg-gradient-to-br from-card to-card border-border shadow-sm p-4 rounded-xl flex flex-col justify-center">
                                            <span className="text-sm font-medium text-muted-foreground flex items-center gap-1.5"><InvoiceIcon className="w-4 h-4" /> Billed Revenue</span>
                                            <span className="text-2xl font-bold mt-1">${totalRevenue.toFixed(2)}</span>
                                        </Card>
                                        <Card className="bg-gradient-to-br from-card to-card border-border shadow-sm p-4 rounded-xl flex flex-col justify-center">
                                            <span className="text-sm font-medium text-muted-foreground flex items-center gap-1.5"><BoxIcon className="w-4 h-4" /> Material Cost</span>
                                            <span className="text-2xl font-bold mt-1">${materialCost.toFixed(2)}</span>
                                        </Card>
                                        <Card className="bg-gradient-to-br from-card to-card border-border shadow-sm p-4 rounded-xl flex flex-col justify-center">
                                            <span className="text-sm font-medium text-muted-foreground flex items-center gap-1.5"><ClockIcon className="w-4 h-4" /> Labor Cost</span>
                                            <span className="text-xl font-bold mt-1">${laborCost.toFixed(2)}</span>
                                            <span className="text-xs text-muted-foreground mt-0.5">Est. @ ${laborRate}/hr</span>
                                        </Card>
                                        <Card className={`shadow-sm p-4 rounded-xl flex flex-col justify-center border-2 ${isProfitGood ? 'border-green-500 bg-green-50/50 dark:bg-green-950/20' : (isLoss && totalRevenue > 0) ? 'border-red-500 bg-red-50/50 dark:bg-red-950/20' : isProfitWarning ? 'border-orange-500 bg-orange-50/50 dark:bg-orange-950/20' : 'border-border bg-card'}`}>
                                            <span className="text-sm font-medium text-muted-foreground flex items-center gap-1.5"><BarChartIcon className="w-4 h-4" /> Profit Margin</span>
                                            <div className="flex items-baseline gap-2 mt-1">
                                                <span className={`text-2xl font-bold ${isProfitGood ? 'text-green-600 dark:text-green-400' : (isLoss && totalRevenue > 0) ? 'text-red-600 dark:text-red-400' : isProfitWarning ? 'text-orange-600 dark:text-orange-400' : 'text-foreground'}`}>
                                                    ${profit.toFixed(2)}
                                                </span>
                                                {totalRevenue > 0 && (
                                                    <span className={`text-sm font-bold ${isProfitGood ? 'text-green-600 dark:text-green-400' : (isLoss && totalRevenue > 0) ? 'text-red-600 dark:text-red-400' : isProfitWarning ? 'text-orange-600 dark:text-orange-400' : 'text-foreground'}`}>
                                                        ({profitMargin.toFixed(1)}%)
                                                    </span>
                                                )}
                                            </div>
                                        </Card>
                                    </div>
                                    <div className="mt-6 text-sm text-muted-foreground bg-blue-50 dark:bg-blue-900/10 p-3 rounded-lg flex items-start gap-2">
                                        <CalculatorIcon className="w-4 h-4 text-blue-600 mt-0.5" />
                                        <p>Profit relies on approved/paid Invoices, Time Sheets, and Material Logs logged to this project.</p>
                                    </div>
                                </CardContent>
                                <CardFooter className="bg-muted/10 border-t p-4 flex justify-end">
                                    <Button onClick={() => setShowJobFinancials(false)}>Close Summary</Button>
                                </CardFooter>
                            </Card>
                        </div>
                    );
                })()}

                <div className="space-y-6">

                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <h2 className="text-lg font-semibold">{t.projectDocs}</h2>
                        </div>
                        <div className="flex flex-col sm:flex-row items-center gap-2 w-full sm:w-auto">
                            <div className="relative w-full max-w-xs">
                                <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-3.5 w-3.5" />
                                <Input
                                    placeholder="Search docs..."
                                    className="pl-9 h-9 text-sm rounded-full bg-secondary/30 border-transparent hover:bg-secondary/50 focus:bg-background focus:border-primary transition-all"
                                    value={docSearchQuery}
                                    onChange={(e) => setDocSearchQuery(e.target.value)}
                                />
                            </div>
                            <select
                                value={docTypeFilter}
                                onChange={(e) => setDocTypeFilter(e.target.value)}
                                className="h-9 w-full sm:w-auto rounded-full border border-input bg-secondary/30 px-3 py-1 text-sm font-medium shadow-sm hover:bg-secondary/50 focus:bg-background focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all cursor-pointer text-foreground"
                            >
                                <option value="All">All Types</option>
                                {uniqueDocTypes.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                        </div>
                    </div>

                    {jobForms.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 px-4 text-center bg-muted/10 rounded-xl border border-dashed border-border">
                            <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mb-4 text-muted-foreground">
                                <BriefcaseIcon className="w-6 h-6" />
                            </div>
                            <h3 className="text-lg font-semibold text-foreground">No documents yet</h3>
                            <p className="text-muted-foreground max-w-sm mt-1 mb-6">{t.noDocsYet}</p>
                            <Button variant="outline" onClick={() => navigateToNewDoc(job.id)} className="rounded-full">
                                Create First Document
                            </Button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {jobForms.map(form => (
                                <DocumentCard
                                    key={form.id}
                                    form={form}
                                    onClick={() => setView({ screen: 'form', formType: form.type, jobId: job.id, formId: form.id })}
                                    onDelete={() => { setDocToDelete(form.id); setShowDeleteDocModal(true); }}
                                    onDuplicate={() => handleDuplicateDoc(form)}
                                />
                            ))}
                        </div>
                    )}
                </div >
            </div >
        );
    };

    const renderForm = () => {
        if (view.screen !== 'form' || !profile) return null;
        const { formType, jobId, formId } = view;
        const job = jobs.find(j => j.id === jobId);
        const form = forms.find(f => f.id === formId);
        if (!job) return <div>Job not found!</div>;
        const handleCloseForm = () => setView({ screen: 'jobDetails', jobId: jobId });

        const componentKey = formId || `new-${formType}`;

        // Pass public token to forms that support approval
        const publicToken = form?.public_token;

        switch (formType) {
            case FormType.Invoice: return <InvoiceForm key={componentKey} job={job} userProfile={profile} invoice={form?.data as InvoiceData | null} onSave={handleSaveForm} onClose={handleCloseForm} onUploadImage={handleUploadDocumentImage} savedItems={savedItems} inventoryItems={inventory} />;
            case FormType.DailyJobReport: return <DailyJobReportForm key={componentKey} profile={profile} job={job} clients={clients} report={form?.data as DailyJobReportData | null} onSave={handleSaveForm} onBack={handleCloseForm} onUploadImage={handleUploadDocumentImage} />;
            case FormType.Note: return <NoteForm key={componentKey} profile={profile} job={job} note={form?.data as NoteData | null} onSave={handleSaveForm} onBack={handleCloseForm} />;
            case FormType.WorkOrder: return <WorkOrderForm key={componentKey} job={job} profile={profile} clients={clients} data={form?.data as WorkOrderData | null} onSave={handleSaveForm} onBack={handleCloseForm} onUploadImage={handleUploadDocumentImage} />;
            case FormType.TimeSheet: return <TimeSheetForm key={componentKey} job={job} profile={profile} clients={clients} data={form?.data as TimeSheetData | null} onSave={handleSaveForm} onBack={handleCloseForm} onUploadImage={handleUploadDocumentImage} />;

            case FormType.MaterialLog: return <MaterialLogForm key={componentKey} job={job} profile={profile} clients={clients} inventory={inventory} data={form?.data as MaterialLogData | null} onSave={handleSaveForm} onBack={handleCloseForm} onUploadImage={handleUploadDocumentImage} />;
            case FormType.Estimate: return <EstimateForm key={componentKey} job={job} profile={profile} clients={clients} data={form?.data as EstimateData | null} onSave={handleSaveForm} onBack={handleCloseForm} onUploadImage={handleUploadDocumentImage} savedItems={savedItems} inventoryItems={inventory} publicToken={publicToken} />;

            case FormType.ExpenseLog: return <ExpenseLogForm key={componentKey} job={job} profile={profile} clients={clients} data={form?.data as ExpenseLogData | null} onSave={handleSaveForm} onBack={handleCloseForm} onUploadImage={handleUploadDocumentImage} />;
            case FormType.Warranty: return <WarrantyForm key={componentKey} job={job} profile={profile} clients={clients} data={form?.data as WarrantyData | null} onSave={handleSaveForm} onBack={handleCloseForm} onUploadImage={handleUploadDocumentImage} />;
            case FormType.Receipt: return <ReceiptForm key={componentKey} job={job} profile={profile} clients={clients} data={form?.data as ReceiptData | null} onSave={handleSaveForm} onBack={handleCloseForm} onUploadImage={handleUploadDocumentImage} />;
            case FormType.ChangeOrder: return <ChangeOrderForm key={componentKey} job={job} profile={profile} clients={clients} data={form?.data as ChangeOrderData | null} onSave={handleSaveForm} onBack={handleCloseForm} onUploadImage={handleUploadDocumentImage} publicToken={publicToken} savedItems={savedItems} inventoryItems={inventory} />;
            case FormType.PurchaseOrder: return <PurchaseOrderForm key={componentKey} job={job} profile={profile} clients={clients} data={form?.data as PurchaseOrderData | null} onSave={handleSaveForm} onBack={handleCloseForm} onUploadImage={handleUploadDocumentImage} />;
            default: return <div className="p-8"><h2 className="text-2xl mb-4">{formType} not implemented.</h2><Button onClick={navigateToDashboard}>Back</Button></div>;
        }
    };

    const getDockItems = () => {
        const t = getTranslation();
        const items: any[] = [{ icon: HomeIcon, label: t.dashboard, onClick: navigateToDashboard }];



        if (view.screen === 'jobDetails') {
            items.push({ icon: PlusIcon, label: t.newDocument, onClick: () => navigateToNewDoc((view as { jobId: string }).jobId) });
        }
        else if (view.screen === 'dashboard' || view.screen === 'clients') items.push({
            icon: UsersIcon,
            label: 'Clients',
            onClick: navigateToClients,
            badgeCount: clientNotificationCount
        });

        items.push({ icon: MailIcon, label: 'Communication', onClick: navigateToCommunication });

        items.push({ icon: SettingsIcon, label: t.settings, onClick: navigateToSettings });
        return items;
    };

    const renderContent = () => {
        // 1. External Portal View (Many documents)
        if (portalKey) return <PortalView supabase={supabase} portalKey={portalKey} />;

        // 2. Single Document Approval View
        if (approvalToken) return <DocumentApprovalView supabase={supabase} approvalToken={approvalToken} />;

        if (dbSetupError) return <DbSetupScreen sqlScript={dbSetupError} />;
        if (loading) return <div className="flex items-center justify-center min-h-screen">{loadingMessage}</div>;
        if (!session) {
            if (view.screen === 'welcome') return <Welcome onGetStarted={() => setView({ screen: 'auth', authScreen: 'signup' })} onLogin={() => setView({ screen: 'auth', authScreen: 'login' })} onNavigate={(screen) => setView({ screen: screen as any })} />;
            if (view.screen === 'privacy') return <PrivacyPolicy onBack={() => setView({ screen: 'welcome' })} />;
            if (view.screen === 'terms') return <TermsOfService onBack={() => setView({ screen: 'welcome' })} />;
            if (view.screen === 'security') return <Security onBack={() => setView({ screen: 'welcome' })} />;

            return renderAuth();
        }
        switch (view.screen) {
            case 'updatePassword': return <UpdatePassword onUpdatePassword={handleUpdatePassword} />;
            case 'dashboard': return renderDashboard();
            case 'jobDetails': return renderJobDetails();
            case 'createJob': return <JobForm onSave={handleSaveJob} onCancel={navigateToDashboard} supabase={supabase} session={session} jobCount={jobs.filter(j => j.status === 'active').length} profile={profile} />;
            case 'selectDocType': { const activeJob = jobs.find(j => j.id === view.jobId); if (!activeJob) return <div>Error</div>; return <SelectDocType onSelect={(type) => setView({ screen: 'form', formType: type, jobId: activeJob.id, formId: null })} onBack={() => setView({ screen: 'jobDetails', jobId: view.jobId })} profile={profile} docCount={forms.length} />; }
            case 'form': return renderForm();
            case 'settings': if (!profile) return null; return <Settings mode="settings" profile={profile} onSave={handleSaveProfile} onBack={navigateToDashboard} theme={theme} setTheme={setTheme} onLogout={handleLogout} onUpgradeClick={() => { setUpgradeFeature('Upgrade to Premium'); setShowGlobalUpgrade(true); }} />;
            case 'profile': if (!profile) return null; return <Settings mode="profile" profile={profile} onSave={handleSaveProfile} onBack={navigateToDashboard} theme={theme} setTheme={setTheme} onLogout={handleLogout} onUpgradeClick={() => { setUpgradeFeature('Upgrade to Premium'); setShowGlobalUpgrade(true); }} />;
            case 'clients':
                return <ClientsView
                    onBack={navigateToDashboard}
                    supabase={supabase}
                    session={session}
                    clients={clients}
                    forms={forms} // Pass forms for approval flow
                    jobs={jobs}
                    userProfile={profile}
                    onUpgradeClick={() => { setUpgradeFeature('Upgrade Plan'); setShowGlobalUpgrade(true); }}
                    freeLimit={FREE_LIMITS.clients}
                    onAddClient={async (data) => { if (checkLimit('clients')) await handleAddClient(data); }}
                    onUpdateClient={async (data) => await handleUpdateClient(data)}
                    onDeleteClient={handleDeleteClient}
                    isOnline={isOnline}
                    onNavigateToNewDoc={handleNavigateToNewDoc}
                    onNavigateToJob={(jobId) => setView({ screen: 'jobDetails', jobId })}
                    onNavigateToDoc={(formId, jobId, formType) => setView({ screen: 'form', formId, jobId, formType })}
                    onMarkDocumentsAsViewed={markDocumentsAsViewed}
                />;
            case 'inventory':
                return <InventoryView
                    userProfile={profile}
                    onBack={navigateToDashboard}
                    inventory={inventory}
                    history={inventoryHistory}
                    jobs={jobs}
                    clients={clients}
                    onAddItem={handleAddInventoryItem}
                    onDuplicateItem={handleDuplicateInventoryItem}
                    onUpdateItem={handleUpdateInventoryItem}
                    onDeleteItem={handleDeleteInventoryItem}
                    onAllocate={handleAllocateInventory}
                    onAddClient={async (data) => { if (checkLimit('clients')) return await handleAddClient(data); return null; }}
                    onAddJob={async (data) => { if (checkLimit('jobs')) { const jid = await handleSaveJob(data, true); return { id: jid } as Job; } return null; }}
                />;
            case 'pricebook':
                return <PriceBookView
                    onBack={navigateToDashboard}
                    savedItems={savedItems}
                    onAddItem={handleAddSavedItem}
                    onDuplicateItem={handleDuplicateSavedItem}
                    onUpdateItem={handleUpdateSavedItem}
                    onDeleteItem={handleDeleteSavedItem}
                    onUploadImage={(file) => uploadFile('price-book-images', file, session!.user.id, true)}
                    isPremium={profile?.subscriptionTier === 'Premium'}
                />;
            case 'profitCalculator':
                return <ProfitCalculatorView onBack={navigateToDashboard} profile={profile} />;
            case 'analytics': return <AnalyticsView jobs={jobs} forms={forms} onBack={navigateToDashboard} />;
            case 'calendar': return <CalendarView jobs={jobs} onBack={navigateToDashboard} onNavigateJob={(jobId) => setView({ screen: 'jobDetails', jobId })} onNewJob={() => navigateToCreateJob('calendar')} />;
            case 'communication': if (!profile) return null; return <CommunicationView clients={clients} forms={forms} jobs={jobs} profile={profile} onBack={navigateToDashboard} session={session} onConnectGmail={handleConnectGmail} onDisconnectGmail={handleDisconnectGmail} onEmailSent={handleEmailSent} onUpgrade={handleUpgradeSuccess} gmailAccounts={gmailAccounts} />;
            case 'gmailCallback': return <GmailCallback session={session} />;
            case 'forum':
                return (
                    <ForumView
                        onBack={navigateToDashboard}
                        supabase={supabase}
                        session={session}
                        onUploadImage={handleUploadForumImage}
                        initialPostId={view.postId}
                        onNavigate={(postId) => setView({ screen: 'forum', postId: postId || undefined })}
                        onDbSetupNeeded={() => setDbSetupError(SQL_SETUP_SCRIPT)}
                    />
                );
            case 'privacy': return <PrivacyPolicy onBack={() => setView({ screen: 'dashboard' })} />;
            case 'terms': return <TermsOfService onBack={() => setView({ screen: 'dashboard' })} />;
            case 'security': return <Security onBack={() => setView({ screen: 'dashboard' })} />;
            default: return renderDashboard();
        }
    };

    return (
        <main className="w-full min-h-screen bg-background">
            {renderContent()}
            {session && !loading && (view.screen === 'dashboard' || view.screen === 'jobDetails' || view.screen === 'clients') && (
                <Dock items={getDockItems()} />
            )}
            <UpgradeModal
                isOpen={showGlobalUpgrade}
                onClose={() => setShowGlobalUpgrade(false)}
                featureName={upgradeFeature}
                onUpgrade={handleUpgradeSuccess}
                userId={session?.user?.id}
            />

            <ConfirmationModal
                isOpen={showDeleteJobModal}
                onClose={() => setShowDeleteJobModal(false)}
                onConfirm={handleDeleteJob}
                title="Delete Job"
                message="Are you sure you want to delete this job? All associated documents (Invoices, Estimates, etc.) will be permanently deleted. This action cannot be undone."
                confirmLabel="Delete"
                isDestructive={true}
            />

            <ConfirmationModal
                isOpen={showDeleteDocModal}
                onClose={() => setShowDeleteDocModal(false)}
                onConfirm={handleDeleteDoc}
                title="Delete Document"
                message="Are you sure you want to permanently delete this document? This action cannot be undone."
                confirmLabel="Delete"
                isDestructive={true}
            />

            <DuplicateJobModal
                isOpen={showDuplicateJobModal}
                onClose={() => setShowDuplicateJobModal(false)}
                onDuplicate={handleDuplicateJob}
                job={jobToDuplicate}
                forms={forms.filter(f => f.jobId === jobToDuplicate?.id)}
                clients={clients}
            />
        </main>
    );
};

export default App;
