
-- Create user_gmail_accounts table for multi-account Gmail support
CREATE TABLE IF NOT EXISTS public.user_gmail_accounts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    gmail_address TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, gmail_address)
);

-- Enable RLS
ALTER TABLE public.user_gmail_accounts ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view their own gmail accounts"
    ON public.user_gmail_accounts FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own gmail accounts"
    ON public.user_gmail_accounts FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own gmail accounts"
    ON public.user_gmail_accounts FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own gmail accounts"
    ON public.user_gmail_accounts FOR DELETE
    USING (auth.uid() = user_id);
