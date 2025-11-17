-- Simple table creation (run this if the previous SQL didn't work)
-- Step 1: Create documents table
CREATE TABLE documents (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  job_id uuid,
  data jsonb not null,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Step 2: Create company_settings table
CREATE TABLE company_settings (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  company_name text,
  address text,
  phone text,
  website text,
  logo_url text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Step 3: Enable RLS on documents
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- Step 4: Create RLS policies for documents
CREATE POLICY "Documents SELECT" ON documents FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Documents INSERT" ON documents FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Documents UPDATE" ON documents FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Documents DELETE" ON documents FOR DELETE USING (auth.uid() = user_id);

-- Step 5: Enable RLS on company_settings
ALTER TABLE company_settings ENABLE ROW LEVEL SECURITY;

-- Step 6: Create RLS policies for company_settings
CREATE POLICY "Settings SELECT" ON company_settings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Settings INSERT" ON company_settings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Settings UPDATE" ON company_settings FOR UPDATE USING (auth.uid() = user_id);

-- Step 7: Create indexes
CREATE INDEX idx_documents_user_id ON documents(user_id);
CREATE INDEX idx_documents_job_id ON documents(job_id);
CREATE INDEX idx_company_settings_user_id ON company_settings(user_id);
