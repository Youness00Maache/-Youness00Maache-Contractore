-- ========================================================
-- PERSISTENT TRACKING SETUP
-- ========================================================
-- Run this script in your Supabase SQL Editor.
-- It ensures that your application "remembers" usage counts (like emails sent) 
-- no matter which device you log in from.
-- ========================================================

-- 1. SETUP EMAIL USAGE TRACKING
-- This adds a counter to the user profile that persists in the database.
DO $$
BEGIN
    -- Check if 'email_usage' column exists, if not, create it
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'email_usage') THEN
        ALTER TABLE public.profiles ADD COLUMN email_usage INTEGER DEFAULT 0;
        RAISE NOTICE 'Added email_usage column to profiles table.';
    END IF;
END $$;

-- 2. NOTE ON JOBS & DOCUMENTS
-- You do NOT need to run anything for Jobs and Documents.
-- These are already stored as permanent records in the 'jobs' and 'documents' tables.
-- The application automatically counts "How many jobs does User X have?" from the database.
-- So, if you create 5 jobs on your Laptop, they will show up (and count towards the limit) on your Phone.

-- 3. VERIFY LIMITS
-- The application enforces:
--   - Max 6 Jobs (Active)
--   - Max 12 Documents
--   - Max 10 Emails (Recorded in profiles.email_usage)
