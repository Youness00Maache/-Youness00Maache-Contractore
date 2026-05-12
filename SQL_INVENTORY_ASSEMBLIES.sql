-- SQL Script: Add Assembly Support to Inventory
-- Run this in your Supabase SQL Editor

ALTER TABLE inventory ADD COLUMN IF NOT EXISTS is_assembly BOOLEAN DEFAULT false;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS assembly_items JSONB DEFAULT '[]'::jsonb;

-- Reload schema cache
NOTIFY pgrst, 'reload config';
