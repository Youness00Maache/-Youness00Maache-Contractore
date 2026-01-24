-- Elite Price Book SQL Migration
-- Run this in your Supabase SQL Editor

-- ====================================
-- Phase 1: Core Enhancements
-- ====================================

-- Add Assembly/Bundle fields
ALTER TABLE saved_items ADD COLUMN IF NOT EXISTS is_assembly BOOLEAN DEFAULT false;
ALTER TABLE saved_items ADD COLUMN IF NOT EXISTS assembly_items JSONB DEFAULT '[]'::jsonb;
-- assembly_items format: [{"item_id": "uuid", "quantity": 2, "override_price": null}]

-- Add Favorites & Usage Tracking fields
ALTER TABLE saved_items ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN DEFAULT false;
ALTER TABLE saved_items ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ;
ALTER TABLE saved_items ADD COLUMN IF NOT EXISTS use_count INTEGER DEFAULT 0;

-- ====================================
-- Phase 2: Data Management
-- ====================================

-- Price History Tracking
CREATE TABLE IF NOT EXISTS price_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  item_id UUID REFERENCES saved_items(id) ON DELETE CASCADE,
  old_price NUMERIC,
  new_price NUMERIC,
  old_cost NUMERIC,
  new_cost NUMERIC,
  changed_at TIMESTAMPTZ DEFAULT NOW(),
  changed_by UUID REFERENCES auth.users(id)
);

ALTER TABLE price_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own price history" ON price_history;
CREATE POLICY "Users can view their own price history" ON price_history 
  FOR SELECT USING (changed_by = auth.uid());
DROP POLICY IF EXISTS "Users can insert their own price history" ON price_history;
CREATE POLICY "Users can insert their own price history" ON price_history 
  FOR INSERT WITH CHECK (changed_by = auth.uid());

-- ====================================
-- Phase 3: Business Intelligence
-- ====================================

-- Vendor Management
CREATE TABLE IF NOT EXISTS item_vendors (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  item_id UUID REFERENCES saved_items(id) ON DELETE CASCADE,
  vendor_name TEXT NOT NULL,
  vendor_sku TEXT,
  vendor_price NUMERIC,
  lead_time_days INTEGER,
  is_preferred BOOLEAN DEFAULT false,
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE
);

ALTER TABLE item_vendors ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage their own vendors" ON item_vendors;
CREATE POLICY "Users can manage their own vendors" ON item_vendors 
  FOR ALL USING (user_id = auth.uid());

-- Multi-level Categories (for Phase 4)
CREATE TABLE IF NOT EXISTS price_book_categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  parent_id UUID REFERENCES price_book_categories(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE price_book_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage their own categories" ON price_book_categories;
CREATE POLICY "Users can manage their own categories" ON price_book_categories 
  FOR ALL USING (user_id = auth.uid());

-- Optional: Link items to categories table
ALTER TABLE saved_items ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES price_book_categories(id);

-- ====================================
-- Indexes for Performance
-- ====================================

CREATE INDEX IF NOT EXISTS idx_saved_items_favorites ON saved_items(user_id, is_favorite) WHERE is_favorite = true;
CREATE INDEX IF NOT EXISTS idx_saved_items_last_used ON saved_items(user_id, last_used_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_saved_items_use_count ON saved_items(user_id, use_count DESC);
CREATE INDEX IF NOT EXISTS idx_saved_items_assemblies ON saved_items(user_id) WHERE is_assembly = true;
CREATE INDEX IF NOT EXISTS idx_price_history_item ON price_history(item_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_item_vendors_item ON item_vendors(item_id);

NOTIFY pgrst, 'reload config';
