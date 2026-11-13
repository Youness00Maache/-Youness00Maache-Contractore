-- SQL Migration for Advanced Price Book
-- Run this in your Supabase SQL Editor

-- 1. Add new columns if they don't exist
ALTER TABLE saved_items ADD COLUMN IF NOT EXISTS "type" TEXT DEFAULT 'service';
ALTER TABLE saved_items ADD COLUMN IF NOT EXISTS "images" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE saved_items ADD COLUMN IF NOT EXISTS "taxable" BOOLEAN DEFAULT true;
ALTER TABLE saved_items ADD COLUMN IF NOT EXISTS "sku" TEXT;
ALTER TABLE saved_items ADD COLUMN IF NOT EXISTS "markup" NUMERIC DEFAULT 50.0;
ALTER TABLE saved_items ADD COLUMN IF NOT EXISTS "category" TEXT DEFAULT 'General';

-- 2. Rename 'cost' to 'unit_cost' if you prefer, or add unit_cost. 
-- For now we just add unit_cost and copy data if needed.
ALTER TABLE saved_items ADD COLUMN IF NOT EXISTS "unit_cost" NUMERIC DEFAULT 0;

-- Optional: Copy existing 'cost' to 'unit_cost' if 'cost' existed
-- UPDATE saved_items SET unit_cost = cost WHERE unit_cost = 0 AND cost IS NOT NULL;
