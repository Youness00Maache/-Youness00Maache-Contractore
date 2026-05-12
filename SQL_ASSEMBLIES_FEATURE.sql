-- SQL Script for Assemblies / Kits Feature
-- Run this in your Supabase SQL Editor or Database Console

-- 1. Create the assembly_components table
-- This table acts as a join table linking an assembly to its components.
CREATE TABLE IF NOT EXISTS public.assembly_components (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    assembly_id UUID NOT NULL REFERENCES public.saved_items(id) ON DELETE CASCADE,
    component_id UUID NOT NULL REFERENCES public.saved_items(id) ON DELETE CASCADE,
    quantity DECIMAL NOT NULL DEFAULT 1,
    override_price DECIMAL NULL, -- In case you want to override the component's price in this assembly context
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_assembly_components_assembly_id ON public.assembly_components(assembly_id);
CREATE INDEX IF NOT EXISTS idx_assembly_components_component_id ON public.assembly_components(component_id);

-- 2. Modify the items table (assuming it's called saved_items based on earlier schema notes)
-- Add the item_type column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='saved_items' AND column_name='type') THEN
        ALTER TABLE public.saved_items ADD COLUMN type TEXT DEFAULT 'service';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='saved_items' AND column_name='is_assembly') THEN
        ALTER TABLE public.saved_items ADD COLUMN is_assembly BOOLEAN DEFAULT FALSE;
    END IF;
END $$;

-- 3. Inventory Deduction Function (Trigger-based approach)
-- Note: You would attach this to an invoice_items insert/update if you want automatic stock deduction.
-- For a robust setup, it is often better to manage this in application logic so you can handle out-of-stock errors gracefully.
-- But here is a helper function that deducts stock for all components of a given assembly.

CREATE OR REPLACE FUNCTION deduct_assembly_inventory(p_assembly_id UUID, p_quantity_sold DECIMAL)
RETURNS void AS $$
DECLARE
    component RECORD;
BEGIN
    FOR component IN 
        SELECT component_id, quantity 
        FROM public.assembly_components 
        WHERE assembly_id = p_assembly_id
    LOOP
        -- Assuming inventory is tracked in the saved_items table via a quantity field
        -- Adjust this to target your inventory table if it's separate
        UPDATE public.inventory
        SET quantity = quantity - (component.quantity * p_quantity_sold)
        WHERE id = component.component_id;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Set up RLS Policies for the new table
ALTER TABLE public.assembly_components ENABLE ROW LEVEL SECURITY;

-- Allow users to read their own assembly components (assuming there's a user_id or similar context, 
-- or you can link it through saved_items if they own the assembly)
CREATE POLICY "Users can view components of their assemblies"
ON public.assembly_components FOR SELECT
USING (
    assembly_id IN (
        SELECT id FROM public.saved_items WHERE user_id = auth.uid()
    )
);

CREATE POLICY "Users can manage components of their assemblies"
ON public.assembly_components FOR ALL
USING (
    assembly_id IN (
        SELECT id FROM public.saved_items WHERE user_id = auth.uid()
    )
);
