import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ensureProfileColumn = async (supabase: any) => {
    // Optional: Ensure column exists if not running setup script (safety check)
    // In production, rely on migration scripts.
};

serve(async (req) => {
    try {
        // 1. Verify Signature (Simplified for MVP, ideally verify PayPal headers)
        // const signature = req.headers.get('PAYPAL-TRANSMISSION-SIG');

        const body = await req.json();
        const eventType = body.event_type;
        const resource = body.resource;

        console.log(`Received event: ${eventType}`);

        // Initialize Supabase Admin Client
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        // 2. Handle Events
        if (eventType === 'BILLING.SUBSCRIPTION.ACTIVATED' || eventType === 'PAYMENT.SALE.COMPLETED') {
            // Get User ID (Assumes 'custom_id' field in subscription contains user_id)
            // NOTE: When creating subscription on client, pass user_id as 'custom_id'
            const userId = resource.custom_id || resource.custom;

            if (userId) {
                console.log(`Upgrading user ${userId} to Premium`);
                await supabase.from('profiles').update({
                    subscription_tier: 'Premium',
                    subscription_status: 'active',
                    updated_at: new Date().toISOString()
                }).eq('id', userId);
            }
        }
        else if (eventType === 'BILLING.SUBSCRIPTION.CANCELLED' || eventType === 'BILLING.SUBSCRIPTION.SUSPENDED' || eventType === 'BILLING.SUBSCRIPTION.EXPIRED') {
            const userId = resource.custom_id || resource.custom;

            if (userId) {
                console.log(`Downgrading user ${userId} to Basic`);
                await supabase.from('profiles').update({
                    subscription_tier: 'Basic',
                    subscription_status: 'inactive',
                    updated_at: new Date().toISOString()
                }).eq('id', userId);
            }
        }

        return new Response(JSON.stringify({ received: true }), { headers: { "Content-Type": "application/json" } });
    } catch (error) {
        console.error(error);
        return new Response(JSON.stringify({ error: error.message }), { status: 400 });
    }
});
