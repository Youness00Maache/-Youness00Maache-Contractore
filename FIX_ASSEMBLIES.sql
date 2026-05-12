-- Assemblies & Kits Schema Extension
-- To be run in Supabase SQL Editor

-- 1. Create Assembly Components Join Table
CREATE TABLE IF NOT EXISTS public.assembly_components (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    assembly_id UUID NOT NULL REFERENCES public.saved_items(id) ON DELETE CASCADE,
    component_item_id UUID NOT NULL REFERENCES public.saved_items(id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL DEFAULT 1,
    override_price NUMERIC, -- Optional: If the component price is different when part of this kit
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS Policies for Assembly Components
ALTER TABLE public.assembly_components ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their assembly components" ON public.assembly_components;
CREATE POLICY "Users can manage their assembly components" 
ON public.assembly_components 
FOR ALL 
USING (
    assembly_id IN (
        SELECT id FROM public.saved_items WHERE user_id = auth.uid()
    )
);

-- 2. Modify Saved Items (Price Book) to support being an assembly
DO $$
BEGIN
    -- Add type field for general classification
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'saved_items' AND column_name = 'type') THEN
        ALTER TABLE public.saved_items ADD COLUMN type TEXT DEFAULT 'service';
    END IF;

    -- Add is_assembly boolean flag
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'saved_items' AND column_name = 'is_assembly') THEN
        ALTER TABLE public.saved_items ADD COLUMN is_assembly BOOLEAN DEFAULT FALSE;
    END IF;

    -- Elite Phase 1 Additional Fields
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'saved_items' AND column_name = 'sku') THEN
        ALTER TABLE public.saved_items ADD COLUMN sku TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'saved_items' AND column_name = 'markup') THEN
        ALTER TABLE public.saved_items ADD COLUMN markup NUMERIC DEFAULT 0;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'saved_items' AND column_name = 'images') THEN
        ALTER TABLE public.saved_items ADD COLUMN images JSONB DEFAULT '[]'::jsonb;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'saved_items' AND column_name = 'taxable') THEN
        ALTER TABLE public.saved_items ADD COLUMN taxable BOOLEAN DEFAULT TRUE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'saved_items' AND column_name = 'is_favorite') THEN
        ALTER TABLE public.saved_items ADD COLUMN is_favorite BOOLEAN DEFAULT FALSE;
    END IF;
END $$;

-- 3. Helper Function to Deduct Assembly Inventory
DROP FUNCTION IF EXISTS public.deduct_assembly_inventory(uuid, integer, uuid, text);
CREATE OR REPLACE FUNCTION public.deduct_assembly_inventory(
    p_assembly_item_id uuid,
    p_assembly_quantity integer,
    p_job_id uuid DEFAULT NULL,
    p_context text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id uuid;
    comp RECORD;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Loop through all components of this assembly
    FOR comp IN 
        SELECT ac.component_item_id, ac.quantity 
        FROM public.assembly_components ac
        WHERE ac.assembly_id = p_assembly_item_id
    LOOP
        -- Check if the component maps to an inventory item 
        BEGIN
            -- -1 * (qty in kit) * (number of kits)
            PERFORM public.adjust_inventory(
                comp.component_item_id, 
                -(comp.quantity * p_assembly_quantity), 
                p_job_id, 
                COALESCE(p_context, 'Assembly deduction')
            );
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Skipping inventory deduction for component %', comp.component_item_id;
        END;
    END LOOP;
END;
$$;
