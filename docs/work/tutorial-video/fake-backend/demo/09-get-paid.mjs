// Demo data for chapter 9 (getting paid). Everything here is made up.
//
//  - Invoices INV-2081 (Sarah Whitfield) and INV-2072 (Tom Alvarez, overdue) get the "Pay now" link from Settings (what a new invoice
//    gets from the profile's default pay link).
//  - Tom Alvarez is the client who taps "I've paid" in chapter 9: the REAL portal on a phone (/?portal=<his key>). His key is made long
//    enough (the project dashboard needs >= 32 characters). The answer report_payment_via_portal stores the report like the database
//    does (top-level payment_reported_* columns + the mirror inside data), so the dashboard card "Payments reported by clients" lists it
//    next to the report on INV-2081 that 02-dashboard-navigation.mjs seeds.
//  - Gmail is not connected here (see 08-send-and-portal.mjs): the Reminders card shows its "Connect Gmail" button.
//  The client portal answers (get_portal_data, ...) live in 08-send-and-portal.mjs.

export const TOM_PORTAL_KEY = 'demo-portal-tom-alvarez-rentals-0001';

export default ({ tables }) => {
  for (const n of ['INV-2081', 'INV-2072']) {
    const inv = tables.get('documents').find((d) => d.type === 'Invoice' && d.data && d.data.invoiceNumber === n);
    if (!inv) continue;
    inv.data.paypalLink = 'https://pay.example/northline';
    inv.data.payLinkLabel = 'PayPal';
  }
  const tom = tables.get('clients').find((c) => c.name === 'Tom Alvarez');
  if (tom) tom.portal_key = TOM_PORTAL_KEY;
};

export const rpc = {
  // the client tapped "I've paid" in the portal (components/DocumentApprovalView.tsx PayNowPanel -> lib/paymentsApi.ts reportPaymentPublic)
  report_payment_via_portal: (a, tables) => {
    const doc = tables.get('documents').find((d) => d.id === a.p_doc_id);
    const client = tables.get('clients').find((c) => c.portal_key === a.p_key);
    if (!doc || !client) return undefined;
    const now = new Date().toISOString();
    Object.assign(doc, { payment_reported_at: now, payment_report_note: a.p_note || null, payment_report_amount: a.p_amount || null });
    Object.assign(doc.data, { paymentReportedAt: now, paymentReportNote: a.p_note || '', paymentReportAmount: a.p_amount || 0 });
    return { success: true };
  },
};
