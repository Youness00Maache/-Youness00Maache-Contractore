-- ============================================
-- CLIENT PORTAL & DIGITAL APPROVAL - DATABASE SETUP
-- ============================================
-- Run this complete script in Supabase SQL Editor
-- This will create all necessary database functions and update tables

-- 1. UPDATE PROFILES TABLE (GMAIL TOKENS)
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

-- ============================================

-- ============================================
-- FUNCTION 1: Get Portal Data
-- ============================================
-- Loads all documents for a client using their portal_key

CREATE OR REPLACE FUNCTION public.get_portal_data(p_key TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_client_id UUID;
  v_user_id UUID;
  v_client JSONB;
  v_contractor JSONB;
  v_documents JSONB;
BEGIN
  -- Find client by portal key
  SELECT id, user_id INTO v_client_id, v_user_id 
  FROM public.clients 
  WHERE portal_key = p_key 
  LIMIT 1;

  IF v_client_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Invalid portal key');
  END IF;

  -- Get client info
  SELECT jsonb_build_object(
    'id', id,
    'name', name,
    'email', email,
    'phone', phone,
    'address', address
  ) INTO v_client
  FROM public.clients
  WHERE id = v_client_id;

  -- Get contractor info
  SELECT jsonb_build_object(
    'company_name', company_name,
    'logo_url', logo_url,
    'phone', phone,
    'email', email,
    'website', website
  ) INTO v_contractor
  FROM public.profiles
  WHERE id = v_user_id;

  -- Get all documents for this client
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', d.id,
      'type', d.type,
      'data', d.data,
      'created_at', d.created_at
    )
  ) INTO v_documents
  FROM public.documents d
  INNER JOIN public.jobs j ON d.job_id = j.id
  WHERE j.user_id = v_user_id
    AND j.client_name = (SELECT name FROM public.clients WHERE id = v_client_id);

  RETURN jsonb_build_object(
    'client', v_client,
    'contractor', v_contractor,
    'documents', COALESCE(v_documents, '[]'::jsonb)
  );
END;
$$;

-- ============================================
-- FUNCTION 2: Sign Document via Portal
-- ============================================
-- Allows clients to sign documents through the portal

CREATE OR REPLACE FUNCTION public.sign_document_via_portal(
  p_key TEXT,
  p_doc_id UUID,
  p_signature TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_client_id UUID;
  v_doc RECORD;
BEGIN
  -- Verify portal key
  SELECT id INTO v_client_id FROM public.clients WHERE portal_key = p_key LIMIT 1;
  
  IF v_client_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Invalid portal key');
  END IF;

  -- Get document
  SELECT * INTO v_doc FROM public.documents WHERE id = p_doc_id LIMIT 1;
  
  IF v_doc IS NULL THEN
    RETURN jsonb_build_object('error', 'Document not found');
  END IF;

  -- Update document with signature and status
  UPDATE public.documents
  SET data = jsonb_set(
    jsonb_set(data, '{signatureUrl}', to_jsonb(p_signature)),
    '{status}', '"Accepted"'
  )
  WHERE id = p_doc_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ============================================
-- FUNCTION 3: Get Document by Approval Token
-- ============================================
-- Loads a single document for approval

CREATE OR REPLACE FUNCTION public.get_document_by_token(doc_token UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_doc RECORD;
  v_contractor JSONB;
BEGIN
  -- Get document
  SELECT * INTO v_doc 
  FROM public.documents 
  WHERE public_token = doc_token 
  LIMIT 1;

  IF v_doc IS NULL THEN
    RETURN jsonb_build_object('error', 'Invalid or expired approval link');
  END IF;

  -- Get contractor info
  SELECT jsonb_build_object(
    'company_name', company_name,
    'logo_url', logo_url,
    'phone', phone,
    'email', email,
    'website', website
  ) INTO v_contractor
  FROM public.profiles
  WHERE id = v_doc.user_id;

  RETURN jsonb_build_object(
    'document', jsonb_build_object(
      'id', v_doc.id,
      'type', v_doc.type,
      'data', v_doc.data,
      'created_at', v_doc.created_at
    ),
    'contractor', v_contractor
  );
END;
$$;

-- ============================================
-- FUNCTION 4: Approve Document by Token (UPDATED)
-- ============================================
-- Submits a signature for a specific document
-- NOW SAVES CLIENT SIGNATURE SEPARATELY FROM CONTRACTOR SIGNATURE

CREATE OR REPLACE FUNCTION public.approve_document_by_token(
  doc_token UUID,
  p_signature TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_doc_id UUID;
  v_doc_data JSONB;
  v_client_name TEXT;
BEGIN
  -- Find document by token
  SELECT id, data INTO v_doc_id, v_doc_data
  FROM public.documents 
  WHERE public_token = doc_token 
  LIMIT 1;

  IF v_doc_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Invalid approval token');
  END IF;

  -- Extract client name from document
  v_client_name := v_doc_data->>'clientName';

  -- Update document with CLIENT signature (separate from contractor signature)
  -- This preserves the contractor's signatureUrl and adds client fields
  UPDATE public.documents
  SET data = v_doc_data 
    || jsonb_build_object('clientSignatureUrl', p_signature)
    || jsonb_build_object('status', 'Accepted')
    || jsonb_build_object('clientSignedAt', NOW()::text)
    || jsonb_build_object('clientSignedBy', v_client_name)
  WHERE id = v_doc_id;

  RETURN jsonb_build_object('success', true, 'message', 'Document signed successfully');
END;
$$;

-- ============================================
-- VERIFICATION
-- ============================================
-- Check that all functions were created

SELECT 
  routine_name,
  routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN (
    'get_portal_data',
    'sign_document_via_portal',
    'get_document_by_token',
    'approve_document_by_token'
  )
ORDER BY routine_name;

-- Expected output: 4 rows showing all functions
