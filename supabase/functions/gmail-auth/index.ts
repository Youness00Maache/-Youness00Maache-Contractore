
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const { action, code, redirect_uri, gmail_address } = await req.json()

        const clientId = Deno.env.get('GOOGLE_CLIENT_ID')
        const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')
        const supabaseUrl = Deno.env.get('SUPABASE_URL')
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

        if (!clientId || !clientSecret) {
            throw new Error('Google OAuth credentials not configured')
        }

        const supabaseClient = createClient(supabaseUrl ?? '', supabaseServiceKey ?? '')

        // Get user id from request header
        const authHeader = req.headers.get('Authorization')
        if (!authHeader) throw new Error('Missing Authorization header')
        const token = authHeader.replace('Bearer ', '')
        const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token)
        if (authError || !user) throw new Error('Unauthorized')

        if (action === 'exchange') {
            if (!code) throw new Error('Authorization code is required')

            // 1. Exchange code for tokens
            const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    code,
                    client_id: clientId,
                    client_secret: clientSecret,
                    redirect_uri,
                    grant_type: 'authorization_code',
                }),
            })

            const tokens = await tokenResponse.json()
            if (tokens.error) throw new Error(`Google Token Error: ${tokens.error_description || tokens.error}`)

            // 2. Get Gmail address
            const profileResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
                headers: { Authorization: `Bearer ${tokens.access_token}` },
            })
            if (!profileResponse.ok) throw new Error('Failed to fetch Gmail profile')
            const profile = await profileResponse.json()
            const email = profile.emailAddress

            // 3. Save to database
            const upsertData: any = {
                user_id: user.id,
                gmail_address: email,
                updated_at: new Date().toISOString(),
            }

            if (tokens.refresh_token) {
                upsertData.refresh_token = tokens.refresh_token
            }

            const { error: dbError } = await supabaseClient
                .from('user_gmail_accounts')
                .upsert(upsertData, { onConflict: 'user_id,gmail_address' })

            if (dbError) throw dbError

            return new Response(JSON.stringify({
                success: true,
                email,
                access_token: tokens.access_token, // Return current access token for immediate use
                expires_in: tokens.expires_in
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })

        } else if (action === 'refresh') {
            if (!gmail_address) throw new Error('Gmail address is required')

            // 1. Get refresh token from DB
            const { data: account, error: accError } = await supabaseClient
                .from('user_gmail_accounts')
                .select('refresh_token')
                .eq('user_id', user.id)
                .eq('gmail_address', gmail_address)
                .single()

            if (accError || !account) throw new Error('Gmail account not found or not authorized')

            // 2. Refresh token
            const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    client_id: clientId,
                    client_secret: clientSecret,
                    refresh_token: account.refresh_token,
                    grant_type: 'refresh_token',
                }),
            })

            const tokens = await tokenResponse.json()
            if (tokens.error) throw new Error(`Google Refresh Error: ${tokens.error_description || tokens.error}`)

            return new Response(JSON.stringify({
                success: true,
                access_token: tokens.access_token,
                expires_in: tokens.expires_in
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
        }

        throw new Error('Invalid action')

    } catch (error) {
        console.error('Gmail Auth Error:', error)
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        })
    }
})
