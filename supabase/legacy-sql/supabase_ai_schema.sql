-- 1. Database Schema Extensions (Supabase SQL)
-- Track AI Credits on the Profile
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS ai_credits_remaining INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS ai_addon_active BOOLEAN DEFAULT false;

-- Create a centralized table for handling various document JSON inputs
CREATE TABLE public.ai_generated_documents (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  document_type TEXT NOT NULL, -- 'INVOICE', 'DAILY_REPORT', 'WARRANTY'
  document_name TEXT NOT NULL,
  template_style TEXT NOT NULL,
  form_payload JSONB NOT NULL, -- Holds the structured data/infographic values
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.ai_generated_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own AI documents" ON public.ai_generated_documents
  FOR ALL USING (auth.uid() = user_id);
