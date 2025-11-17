# Supabase Database Setup Instructions

## Error You Encountered
```
Could not find the table 'public.documents' in the schema cache
```

This means your Supabase database is missing the required tables. Follow these steps to fix it:

## Step-by-Step Setup

### 1. Access Your Supabase Console
- Go to https://supabase.com
- Sign in to your account
- Select your project: `iauteblvljppwzsxloyd` (based on your error)

### 2. Create the Tables

**Option A: Using SQL Editor (Recommended)**
1. Click on "SQL Editor" in the left sidebar
2. Click "New Query"
3. Copy the entire SQL from `SUPABASE_SETUP.sql` file in your project
4. Paste it into the SQL editor
5. Click "Run" button
6. Wait for the query to complete (you should see "Success" message)

**Option B: Using UI**
If you prefer the UI, create these tables manually:

#### Table 1: `documents`
- Columns:
  - `id` (UUID, Primary Key, Default: uuid_generate_v4())
  - `user_id` (UUID, Foreign Key → auth.users.id, Not Null)
  - `type` (Text, Not Null) - values: 'invoice', 'dailyJobReport', 'note'
  - `job_id` (UUID, Nullable)
  - `data` (JSONB, Not Null)
  - `created_at` (Timestamp, Default: now())
  - `updated_at` (Timestamp, Default: now())

#### Table 2: `company_settings`
- Columns:
  - `id` (UUID, Primary Key, Default: uuid_generate_v4())
  - `user_id` (UUID, Foreign Key → auth.users.id, Not Null, Unique)
  - `company_name` (Text, Nullable)
  - `address` (Text, Nullable)
  - `phone` (Text, Nullable)
  - `website` (Text, Nullable)
  - `logo_url` (Text, Nullable)
  - `created_at` (Timestamp, Default: now())
  - `updated_at` (Timestamp, Default: now())

#### Table 3: `jobs` (if it doesn't exist)
- Columns:
  - `id` (UUID, Primary Key, Default: uuid_generate_v4())
  - `user_id` (UUID, Foreign Key → auth.users.id, Not Null)
  - `client_name` (Text, Not Null)
  - `client_address` (Text, Nullable)
  - `job_date` (Date, Nullable)
  - `description` (Text, Nullable)
  - `status` (Text, Default: 'pending')
  - `created_at` (Timestamp, Default: now())
  - `updated_at` (Timestamp, Default: now())

### 3. Enable Row Level Security (RLS)

For each table:
1. Go to "Authentication" → "Policies" in Supabase console
2. Select the table
3. Click "Enable RLS"
4. Add the RLS policies (see policies below)

### RLS Policies to Create

**For `documents` table:**
- SELECT: `auth.uid() = user_id`
- INSERT: `auth.uid() = user_id`
- UPDATE: `auth.uid() = user_id`
- DELETE: `auth.uid() = user_id`

**For `company_settings` table:**
- SELECT: `auth.uid() = user_id`
- INSERT: `auth.uid() = user_id`
- UPDATE: `auth.uid() = user_id`

**For `jobs` table:**
- SELECT: `auth.uid() = user_id`
- INSERT: `auth.uid() = user_id`
- UPDATE: `auth.uid() = user_id`
- DELETE: `auth.uid() = user_id`

### 4. Verify Your Setup

After running the SQL:
1. Go to "Table Editor" in Supabase
2. You should see three tables: `documents`, `company_settings`, `jobs`
3. Each should have the correct columns
4. RLS should be enabled on all three

### 5. Test the Connection

Go back to your app and:
1. Sign in with your account
2. Create a new invoice/note/daily report
3. Click "Save"
4. Check if the document appears in the Supabase Table Editor

## Troubleshooting

**If you still get the 404 error:**
- Make sure you're logged into the correct Supabase project
- Verify the project URL matches: `iauteblvljppwzsxloyd.supabase.co`
- Clear your browser cache and reload the page

**If RLS is blocking your requests:**
- Make sure your user is authenticated (check auth.uid())
- Verify the RLS policies have the correct conditions
- Check the user_id is being saved correctly in the documents table

**If you see "Could not find column" errors:**
- Double-check column names match exactly (case-sensitive)
- Make sure all required columns exist
