# How to Deploy the PayPal Webhook

To enable automatic cancellation tracking, follow these steps in your terminal:

### Where to Run These Commands?
**Run these commands in your VS Code Terminal** (the same place on your computer where you run the app).

1.  In VS Code, click **Terminal** -> **New Terminal**.
2.  Use `npx` (runs without installing anything).

### Deployment Steps

1.  **Login to Supabase**
    ```bash
    npx supabase login
    ```

2.  **Link Your Project**
    -   Go to [Supabase Dashboard](https://supabase.com/dashboard/project/_/settings/general) and copy your **Reference ID**.
    -   Run:
    ```bash
    npx supabase link --project-ref <your-reference-id>
    ```
    -   Enter your database password if asked.

3.  **Deploy the Function**
    ```bash
    npx supabase functions deploy paypal-webhook
    ```

4.  **Set Environment Variables**
    -   Go to **Edge Functions** in your Supabase Dashboard.
    -   Click on `paypal-webhook`.
    -   Add Secrets:
        -   `SUPABASE_URL`: Your project URL.
        -   `SUPABASE_SERVICE_ROLE_KEY`: Your **Service Role Key** (Find in Settings -> API). Do NOT use the Anon key.

### Connect to PayPal
1.  Copy the **Function URL** from the Supabase Dashboard (e.g., `https://<ref>.supabase.co/functions/v1/paypal-webhook`).
2.  Go to **PayPal Developer Dashboard** -> Your App -> **Webhooks**.
3.  Click **Add Webhook**.
4.  Paste the Function URL.
5.  Select events:
    -   `BILLING.SUBSCRIPTION.ACTIVATED`
    -   `BILLING.SUBSCRIPTION.CANCELLED`
    -   `BILLING.SUBSCRIPTION.EXPIRED`
    -   `BILLING.SUBSCRIPTION.SUSPENDED`
    -   `PAYMENT.SALE.COMPLETED`
    -   `PAYMENT.SALE.DENIED`
6.  Save.

**Done!** Now your app will auto-manage subscriptions.
