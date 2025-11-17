-- Create the documents table
CREATE TABLE IF NOT EXISTS public.documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- 'invoice', 'dailyJobReport', 'note'
  job_id UUID,
  data JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create the company_settings table
CREATE TABLE IF NOT EXISTS public.company_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  company_name TEXT,
  address TEXT,
  phone TEXT,
  website TEXT,
  logo_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create the jobs table (if it doesn't exist)
CREATE TABLE IF NOT EXISTS public.jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_name TEXT NOT NULL,
  client_address TEXT,
  job_date DATE,
  description TEXT,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security (RLS) on documents table
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- RLS Policy for documents: Users can only see their own documents
CREATE POLICY "Users can view their own documents" ON public.documents
  FOR SELECT
  USING (auth.uid() = user_id);

-- RLS Policy for documents: Users can only insert their own documents
CREATE POLICY "Users can insert their own documents" ON public.documents
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- RLS Policy for documents: Users can only update their own documents
CREATE POLICY "Users can update their own documents" ON public.documents
  FOR UPDATE
  USING (auth.uid() = user_id);

-- RLS Policy for documents: Users can only delete their own documents
CREATE POLICY "Users can delete their own documents" ON public.documents
  FOR DELETE
  USING (auth.uid() = user_id);

-- Enable RLS on company_settings table
ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policy for company_settings: Users can view their own settings
CREATE POLICY "Users can view their own company settings" ON public.company_settings
  FOR SELECT
  USING (auth.uid() = user_id);

-- RLS Policy for company_settings: Users can insert their own settings
CREATE POLICY "Users can insert their own company settings" ON public.company_settings
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- RLS Policy for company_settings: Users can update their own settings
CREATE POLICY "Users can update their own company settings" ON public.company_settings
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Enable RLS on jobs table
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

-- RLS Policy for jobs: Users can view their own jobs
CREATE POLICY "Users can view their own jobs" ON public.jobs
  FOR SELECT
  USING (auth.uid() = user_id);

-- RLS Policy for jobs: Users can insert their own jobs
CREATE POLICY "Users can insert their own jobs" ON public.jobs
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- RLS Policy for jobs: Users can update their own jobs
CREATE POLICY "Users can update their own jobs" ON public.jobs
  FOR UPDATE
  USING (auth.uid() = user_id);

-- RLS Policy for jobs: Users can delete their own jobs
CREATE POLICY "Users can delete their own jobs" ON public.jobs
  FOR DELETE
  USING (auth.uid() = user_id);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_documents_user_id ON public.documents(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_job_id ON public.documents(job_id);
CREATE INDEX IF NOT EXISTS idx_company_settings_user_id ON public.company_settings(user_id);
CREATE INDEX IF NOT EXISTS idx_jobs_user_id ON public.jobs(user_id);
