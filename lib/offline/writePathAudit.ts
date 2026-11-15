/**
 * Offline audit of EVERY place the app writes to the account (owner, 2026-11-14: "it needs to work in all aspects of
 * the website"). scripts/offline-drafts-check.ts scans the source (lib/offline/writePathScan.ts) and fails when a
 * write call isn't covered here, or a row here no longer matches any code. Summary in NEXT_STEPS.md.
 *
 *  queue            works offline: saved on this device (outbox), shown at once with "Waiting to sync", synced later
 *  device           works offline: kept on this device and uploaded at the next login (lib/userDataSync.ts)
 *  sync             the outbox's own upload when the connection is back (runs online only)
 *  needs_connection can't work offline; says "You're offline. This needs a connection" (never a raw network error:
 *                   lib/offline/connection.ts, the Supabase client fails offline requests with that sentence)
 *  background       automatic online work (usage, viewed flags, clean-ups); skipped / retried later, silent offline
 *  public           pages for the contractor's clients (portal, approval link, request form): the client's connection
 */
export type OfflineMode = 'queue' | 'device' | 'sync' | 'needs_connection' | 'background' | 'public';

export interface WritePathEntry {
    file: string;
    /** text on the write call's line (unique enough in that file) */
    match: string;
    what: string;
    offline: OfflineMode;
}

export const WRITE_PATHS: WritePathEntry[] = [
    // ---------------------------------------------------------------------------------------------------- App.tsx
    { file: 'App.tsx', match: 'supabase.storage.from(bucket).upload(path, file', what: 'image upload (logo, document image, online)', offline: 'needs_connection' },
    { file: 'App.tsx', match: "from('profiles').update(row)", what: 'settings save (online path; offline it goes to the outbox)', offline: 'queue' },
    { file: 'App.tsx', match: "invokeFunction('delete-account'", what: 'delete account', offline: 'needs_connection' },
    { file: 'App.tsx', match: "from('jobs').insert(payload)", what: 'create job (offline: outbox, then this insert on sync)', offline: 'queue' },
    { file: 'App.tsx', match: 'update({ client_id: client.id })', what: 'link the client added after an online job create', offline: 'background' },
    { file: 'App.tsx', match: 'update({ status: newStatus })', what: 'job status', offline: 'queue' },
    { file: 'App.tsx', match: "from('jobs').delete()", what: 'delete job', offline: 'needs_connection' },
    { file: 'App.tsx', match: "from('documents').insert(batch)", what: 'duplicate job (with its documents)', offline: 'needs_connection' },
    { file: 'App.tsx', match: "from('documents').insert(record)", what: 'duplicate document / copy to another job', offline: 'needs_connection' },
    { file: 'App.tsx', match: "from('documents').delete()", what: 'delete document (one only on this device is discarded offline)', offline: 'needs_connection' },
    { file: 'App.tsx', match: "rpc('adjust_inventory', { p_item_id: row.p_item_id", what: 'stock change saved offline', offline: 'sync' },
    { file: 'App.tsx', match: "from('profiles').update({ ...patch", what: 'settings saved offline', offline: 'sync' },
    { file: 'App.tsx', match: 'withoutPaymentColumns(patch)', what: 'settings saved offline (database without payment columns)', offline: 'sync' },
    { file: 'App.tsx', match: "from('reminder_settings').upsert({ ...settingsRow", what: 'reminder settings saved offline', offline: 'sync' },
    { file: 'App.tsx', match: 'from(table).insert(row)', what: 'client / inventory / price-book / punch-list item created offline', offline: 'sync' },
    { file: 'App.tsx', match: 'from(table).update(patch)', what: 'job / client / inventory / price-book / punch-list edit made offline', offline: 'sync' },

    // ------------------------------------------------------------------------------------------- clients
    { file: 'components/ClientDetails.tsx', match: 'update({ notes: withTempTag', what: 'temporary ↔ regular client', offline: 'queue' },
    { file: 'components/ClientDetails.tsx', match: "from('clients').insert(row)", what: 'add client', offline: 'queue' },
    { file: 'components/ClientDetails.tsx', match: '.update(cleanDraft(draft))', what: 'edit client', offline: 'queue' },
    { file: 'components/ClientDetails.tsx', match: "from('clients').delete()", what: 'delete clients', offline: 'needs_connection' },
    { file: 'components/ClientDetails.tsx', match: "update({ data: { ...data, status: 'Sent' } })", what: '"Ask again" on a declined estimate', offline: 'needs_connection' },
    { file: 'components/ClientDetails.tsx', match: "from('clients').update({ notes })", what: 'client notes', offline: 'queue' },
    { file: 'components/ClientsView.tsx', match: "rpc('mark_documents_viewed', args)", what: 'client decisions marked seen', offline: 'background' },
    { file: 'components/ClientsView.tsx', match: 'insert(chunk.map', what: 'import clients (CSV)', offline: 'needs_connection' },
    { file: 'components/ClientsView.tsx', match: 'insert(toRow(r.draft))', what: 'import clients (one by one at the plan limit)', offline: 'needs_connection' },
    { file: 'utils/clientLinks.ts', match: '.update({ portal_key: key })', what: 'client portal link', offline: 'needs_connection' },
    { file: 'utils/clientLinks.ts', match: '.update({ public_token: token })', what: 'document approval link', offline: 'needs_connection' },

    // ------------------------------------------------------------------------------------------- documents
    { file: 'lib/documentSave.ts', match: "from('documents').upsert(record)", what: 'document save (field documents, estimate / invoice drafts offline → outbox)', offline: 'queue' },
    { file: 'lib/documents.ts', match: "rpc('mark_documents_viewed'", what: 'documents marked viewed', offline: 'background' },
    { file: 'lib/costingApi.ts', match: "from('documents').insert(record)", what: 'bill time & materials (new invoice)', offline: 'needs_connection' },
    { file: 'lib/costingApi.ts', match: "from('documents').update({ data: next })", what: 'bill time & materials (mark sheets billed)', offline: 'needs_connection' },
    { file: 'services/recurringService.ts', match: '.update({ data: { ...data, recurrence: next } })', what: 'recurring invoices', offline: 'background' },
    { file: 'services/recurringService.ts', match: "rpc('generate_due_recurring_invoices')", what: 'recurring invoices', offline: 'background' },

    // ------------------------------------------------------------------------------------------- payments
    { file: 'lib/paymentsApi.ts', match: "from('profiles').update(paymentSettingsRow(settings))", what: 'payment / review links (offline: part of the settings save → outbox)', offline: 'queue' },
    { file: 'lib/paymentsApi.ts', match: "rpc('report_payment_via_portal'", what: 'client "I\'ve paid" (portal)', offline: 'public' },
    { file: 'lib/paymentsApi.ts', match: "rpc('report_payment_by_token'", what: 'client "I\'ve paid" (link)', offline: 'public' },
    { file: 'lib/paymentsApi.ts', match: 'update(REPORT_COLUMNS_CLEARED)', what: 'dismiss a payment report', offline: 'needs_connection' },
    { file: 'lib/paymentsApi.ts', match: "from('documents').insert(", what: 'Mark as paid (receipt)', offline: 'needs_connection' },
    { file: 'lib/paymentsApi.ts', match: "from('documents').update({ data, ...REPORT_COLUMNS_CLEARED })", what: 'Mark as paid (invoice)', offline: 'needs_connection' },
    { file: 'lib/paymentsApi.ts', match: "from('documents').update({ data }).eq('id', invoice.id).select", what: 'Mark as paid (invoice, older database)', offline: 'needs_connection' },
    { file: 'lib/paymentsApi.ts', match: "from('documents').update({ data }).eq('id', invoice.id);", what: 'review request sent', offline: 'needs_connection' },
    { file: 'components/DocumentApprovalView.tsx', match: 'supabase.rpc(fn', what: 'client signs / declines (approval link)', offline: 'public' },
    { file: 'components/DocumentApprovalView.tsx', match: 'supabase.rpc(plan.rpc.name', what: 'client picks an estimate option', offline: 'public' },

    // ------------------------------------------------------------------------------------------- inventory, price book
    { file: 'components/InventoryView.tsx', match: "rpc('adjust_inventory'", what: 'stock + / − (offline → outbox)', offline: 'queue' },
    { file: 'components/InventoryView.tsx', match: "from('inventory').insert(p)", what: 'add inventory item', offline: 'queue' },
    { file: 'components/InventoryView.tsx', match: "from('inventory').update(p)", what: 'edit inventory item', offline: 'queue' },
    { file: 'components/InventoryView.tsx', match: "from('inventory').delete()", what: 'delete inventory item (one only on this device is discarded offline)', offline: 'needs_connection' },
    { file: 'components/InventoryView.tsx', match: "rpc('checkout_inventory'", what: 'check out to a job / client (offline: the same stock moves → outbox)', offline: 'queue' },
    { file: 'components/InventoryView.tsx', match: "from('jobs').insert(row)", what: 'new job inside check-out (fallback when the app gives none; the app\'s own create works offline)', offline: 'needs_connection' },
    { file: 'components/PriceBookView.tsx', match: 'storage.from(BUCKET).remove(paths)', what: 'unused item photos removed', offline: 'background' },
    { file: 'components/PriceBookView.tsx', match: "from('saved_items').update(p)", what: 'edit price-book item', offline: 'queue' },
    { file: 'components/PriceBookView.tsx', match: "from('saved_items').insert(p)", what: 'add / duplicate price-book item', offline: 'queue' },
    { file: 'components/PriceBookView.tsx', match: "from('saved_items').delete()", what: 'delete price-book item (one only on this device is discarded offline)', offline: 'needs_connection' },
    { file: 'components/forms/inventory.ts', match: "from('saved_items').insert(row)", what: 'line item → price book (from a form)', offline: 'queue' },
    { file: 'components/viewKit.tsx', match: 'storage.from(bucket).upload(path, file', what: 'price-book item photo upload', offline: 'needs_connection' },
    { file: 'lib/suppliersApi.ts', match: "from('documents').insert(record)", what: 'purchase orders (reorder)', offline: 'needs_connection' },
    { file: 'lib/suppliersApi.ts', match: "from('documents').update({ data }).eq('id', doc.id)", what: 'purchase order update', offline: 'needs_connection' },
    { file: 'lib/suppliersApi.ts', match: '.update({ data: { ...base, [RECEIPT_KEY]: receipt } })', what: 'receive a purchase order', offline: 'needs_connection' },
    { file: 'lib/suppliersApi.ts', match: "rpc('adjust_inventory', { p_item_id: m.itemId", what: 'receive a purchase order / record a delivery (stock)', offline: 'needs_connection' },
    { file: 'lib/suppliersApi.ts', match: "update({ data: claimData }).eq('id', documentId)", what: 'record a delivery (claim, compare-and-set)', offline: 'needs_connection' },
    { file: 'lib/suppliersApi.ts', match: "update({ data: next }).eq('id', documentId)", what: 'record a delivery (finish, compare-and-set)', offline: 'needs_connection' },
    { file: 'lib/suppliersApi.ts', match: 'storage.from(PO_FILES_BUCKET).upload(path, file', what: 'supplier invoice file upload (purchase order)', offline: 'needs_connection' },
    { file: 'lib/suppliersApi.ts', match: 'storage.from(PO_FILES_BUCKET).remove([path])', what: 'replaced / removed supplier invoice file', offline: 'background' },

    // ------------------------------------------------------------------------------------------- job photos
    { file: 'components/photos/photosApi.ts', match: "from('job_photos').insert(row).select", what: 'add photo (offline: kept on this device → outbox)', offline: 'queue' },
    { file: 'components/photos/photosApi.ts', match: 'bucket.upload(paths.main', what: 'add photo: file (offline → outbox)', offline: 'queue' },
    { file: 'components/photos/photosApi.ts', match: 'bucket.upload(paths.thumb', what: 'add photo: preview (offline → outbox)', offline: 'queue' },
    { file: 'components/photos/photosApi.ts', match: "await supabase.from('job_photos').delete().eq('id', id);", what: 'undo a photo row whose upload failed (online add, and a photo taken offline when it syncs)', offline: 'queue' },
    { file: 'components/photos/photosApi.ts', match: "from('job_photos').update(row)", what: 'photo stage / caption (offline → outbox)', offline: 'queue' },
    { file: 'components/photos/photosApi.ts', match: "from('job_photos').delete().in('id', ids)", what: 'delete photos (ones only on this device are deleted offline)', offline: 'needs_connection' },
    { file: 'components/photos/photosApi.ts', match: 'update({ shared_in_portal: false', what: 'hide from the portal (offline → outbox)', offline: 'queue' },
    { file: 'components/photos/photosApi.ts', match: '.copy(photo.storagePath, portalPath', what: 'show in the portal (offline → outbox)', offline: 'queue' },
    { file: 'components/photos/photosApi.ts', match: 'storage.from(PORTAL_PHOTOS_BUCKET).upload(portalPath', what: 'show in the portal, older storage (offline → outbox)', offline: 'queue' },
    { file: 'components/photos/photosApi.ts', match: 'update({ shared_in_portal: true', what: 'show in the portal (offline → outbox)', offline: 'queue' },
    { file: 'components/photos/photosApi.ts', match: 'storage.from(PORTAL_PHOTOS_BUCKET).remove([portalPath])', what: 'undo a failed portal copy', offline: 'queue' },
    { file: 'components/photos/photosApi.ts', match: "const { error } = await supabase.from('job_photos').insert(row);", what: 'photo taken offline', offline: 'sync' },
    { file: 'components/photos/photosApi.ts', match: 'storage.from(JOB_PHOTOS_BUCKET).upload(path, file', what: 'photo taken offline: files', offline: 'sync' },
    { file: 'components/photos/photosApi.ts', match: "from('job_photos').update(patch)", what: 'photo change made offline', offline: 'sync' },
    { file: 'components/photos/photoUpdatesApi.ts', match: "functions.invoke('ai-assistant'", what: 'AI client update / walkthrough', offline: 'needs_connection' },
    { file: 'lib/estimateReviewApi.ts', match: "functions.invoke('ai-assistant'", what: 'AI estimate review (the free checks work offline)', offline: 'needs_connection' },
    { file: 'components/photos/photoUpdatesApi.ts', match: "from('documents').update({ data })", what: 'AI client update: record', offline: 'needs_connection' },
    { file: 'components/photos/photoUpdatesApi.ts', match: "from('documents').insert(row)", what: 'AI client update: record', offline: 'needs_connection' },

    // ------------------------------------------------------------------------------------------- requests
    { file: 'components/requests/requestsApi.ts', match: "rpc('submit_quote_request'", what: 'request-a-quote form (client)', offline: 'public' },
    { file: 'components/requests/requestsApi.ts', match: 'storage.from(REQUEST_PHOTOS_BUCKET).upload', what: 'request-a-quote photos (client)', offline: 'public' },
    { file: 'components/requests/requestsApi.ts', match: "from('quote_requests').update({ status })", what: 'request seen / archived', offline: 'needs_connection' },
    { file: 'components/requests/requestsApi.ts', match: "from('quote_requests').delete()", what: 'delete request', offline: 'needs_connection' },
    { file: 'components/requests/requestsApi.ts', match: "rpc('convert_quote_request'", what: 'request → job', offline: 'needs_connection' },
    { file: 'components/requests/requestsApi.ts', match: "rpc('update_request_page'", what: 'request page settings', offline: 'needs_connection' },
    { file: 'components/requests/requestsApi.ts', match: "rpc('regenerate_request_slug')", what: 'new request link', offline: 'needs_connection' },
    { file: 'components/requests/requestsApi.ts', match: 'storage.from(bucket).remove(entry.paths)', what: 'storage clean-up', offline: 'background' },
    { file: 'components/requests/requestsApi.ts', match: "from('storage_cleanup_queue').delete()", what: 'storage clean-up', offline: 'background' },

    // ------------------------------------------------------------------------------------------- settings, account
    { file: 'lib/reminders.ts', match: ".upsert({ user_id: userId, ...settingsToRow(settings) }", what: 'reminder settings (offline → outbox)', offline: 'queue' },
    { file: 'lib/reminders.ts', match: "from('reminder_overrides').delete()", what: 'reminders on/off for a document / client', offline: 'needs_connection' },
    { file: 'lib/reminders.ts', match: '.upsert({ user_id: userId, [column]: id, enabled }', what: 'reminders on/off for a document / client', offline: 'needs_connection' },
    { file: 'lib/reminders.ts', match: "rpc('skip_reminder'", what: 'skip a reminder', offline: 'needs_connection' },
    { file: 'lib/reminders.ts', match: "rpc('unskip_reminder'", what: 'undo skip', offline: 'needs_connection' },
    { file: 'lib/userData.ts', match: "from('profit_calculations').upsert(", what: 'profit calculator', offline: 'device' },
    { file: 'lib/userData.ts', match: "from('profit_calculations').delete()", what: 'profit calculator', offline: 'device' },
    { file: 'lib/userData.ts', match: "from('profiles').update(patch)", what: 'labor rate / signature / theme / language', offline: 'device' },
    { file: 'lib/userData.ts', match: "from('user_settings').upsert(", what: 'device preferences (label sheet, theme, language)', offline: 'device' },
    { file: 'lib/account.ts', match: ".insert({ id: user.id, email: user.email", what: 'first profile row at sign-up', offline: 'background' },
    { file: 'lib/account.ts', match: "rpc('record_usage'", what: 'usage counters', offline: 'background' },
    { file: 'lib/notifications/sources.ts', match: "from('notifications').update({ is_read: true })", what: 'community notifications read', offline: 'background' },
    { file: 'lib/aiCredits.ts', match: "invokeFunction<unknown>('kelviq-checkout', { action: 'credits_status' })", what: 'AI credits balance', offline: 'needs_connection' },
    { file: 'lib/aiCredits.ts', match: "invokeFunction<{ url?: string }>('kelviq-checkout'", what: 'buy AI credits', offline: 'needs_connection' },
    { file: 'lib/aiCredits.ts', match: "invokeFunction<unknown>('kelviq-checkout', {", what: 'AI credits settings', offline: 'needs_connection' },
    { file: 'lib/billing.ts', match: "invokeFunction<CheckoutResult>('kelviq-checkout'", what: 'upgrade checkout', offline: 'needs_connection' },
    { file: 'lib/billing.ts', match: "action: 'portal'", what: 'billing portal', offline: 'needs_connection' },
    { file: 'lib/supabase.ts', match: 'supabase.functions.invoke(name', what: 'edge functions (all of them)', offline: 'needs_connection' },
    { file: 'services/gmailService.ts', match: "functions.invoke('gmail'", what: 'Gmail: send, accounts, connect', offline: 'needs_connection' },

    // ------------------------------------------------------------------------------------------- community, AI
    { file: 'components/ForumView.tsx', match: "rpc('toggle_forum_vote'", what: 'vote', offline: 'needs_connection' },
    { file: 'components/ForumView.tsx', match: "rpc('toggle_forum_comment_vote'", what: 'vote', offline: 'needs_connection' },
    { file: 'components/ForumView.tsx', match: 'storage.from(BUCKET).remove([path])', what: 'unused post image removed', offline: 'background' },
    { file: 'components/ForumView.tsx', match: "from('forum_posts').update(fields)", what: 'edit post', offline: 'needs_connection' },
    { file: 'components/ForumView.tsx', match: "from('forum_posts').insert(", what: 'new post', offline: 'needs_connection' },
    { file: 'components/ForumView.tsx', match: "from(table).delete({ count: 'exact' })", what: 'delete post / comment', offline: 'needs_connection' },
    { file: 'components/ForumView.tsx', match: "from('forum_reports').insert(row)", what: 'report', offline: 'needs_connection' },
    { file: 'components/ForumView.tsx', match: "from('forum_comments').insert(", what: 'comment', offline: 'needs_connection' },
    { file: 'components/ForumView.tsx', match: "from('forum_comments').update({ content: text })", what: 'edit comment', offline: 'needs_connection' },
    { file: 'components/ForumView.tsx', match: "from('notifications').update({ is_read: true }).eq('id'", what: 'notification read', offline: 'needs_connection' },
    { file: 'components/ForumView.tsx', match: "from('notifications').update({ is_read: true }).eq('user_id'", what: 'all notifications read', offline: 'needs_connection' },
    { file: 'src/hooks/useAIAssistant.ts', match: 'rpc(', what: 'AI "Do it all": stock', offline: 'needs_connection' },
    { file: 'src/hooks/useAIAssistant.ts', match: "from('jobs').update(", what: 'AI "Do it all": job status', offline: 'needs_connection' },
    { file: 'src/hooks/useAIAssistant.ts', match: "from('jobs').insert(r)", what: 'AI "Do it all": job', offline: 'needs_connection' },
    { file: 'src/hooks/useAIAssistant.ts', match: "from('documents').insert(record)", what: 'AI "Do it all": document', offline: 'needs_connection' },
    { file: 'src/hooks/useAIAssistant.ts', match: "from('inventory').insert(r)", what: 'AI "Do it all": inventory item', offline: 'needs_connection' },
    { file: 'src/hooks/useAIAssistant.ts', match: "from('saved_items').insert(r)", what: 'AI "Do it all": price-book item', offline: 'needs_connection' },
    { file: 'src/hooks/useContractorAI.ts', match: "functions.invoke<RouterResponse>('ai-assistant'", what: 'AI form fill', offline: 'needs_connection' },
    { file: 'src/hooks/useMasterAIRouter.ts', match: "functions.invoke<RouterResponse>('ai-assistant'", what: 'AI assistant', offline: 'needs_connection' },
    { file: 'src/hooks/useMasterAIRouter.ts', match: "from('ai_chat_history').upsert(", what: 'AI chat history', offline: 'needs_connection' },
    { file: 'src/hooks/useMasterAIRouter.ts', match: "from('ai_chat_history').delete()", what: 'AI chat history', offline: 'needs_connection' },

    // ------------------------------------------------------------------------------------------- crew clock-in (owner)
    { file: 'lib/crew/crewApi.ts', match: "from('crew_members').insert(memberPayload(input))", what: 'add crew member', offline: 'needs_connection' },
    { file: 'lib/crew/crewApi.ts', match: "from('crew_members').update(memberPayload(input))", what: 'edit crew member', offline: 'needs_connection' },
    { file: 'lib/crew/crewApi.ts', match: "rpc('crew_member_link'", what: 'new / turn off a clock-in link', offline: 'needs_connection' },
    { file: 'lib/crew/crewApi.ts', match: 'storage.from(CREW_PHOTOS_BUCKET).remove(paths)', what: 'remove crew member: their punch photos', offline: 'needs_connection' },
    { file: 'lib/crew/crewApi.ts', match: "from('crew_members').delete()", what: 'remove crew member', offline: 'needs_connection' },
    { file: 'lib/crew/crewApi.ts', match: '.upsert({ member_id: memberId, job_id: jobId }', what: 'assign a crew member to a job', offline: 'needs_connection' },
    { file: 'lib/crew/crewApi.ts', match: "from('crew_assignments').delete()", what: 'unassign a crew member from a job', offline: 'needs_connection' },
    { file: 'lib/crew/crewApi.ts', match: "from('crew_job_sites').delete()", what: 'remove a job site pin', offline: 'needs_connection' },
    { file: 'lib/crew/crewApi.ts', match: '.upsert({ job_id: jobId, lat: site.lat', what: 'job site pin (clock-in location)', offline: 'needs_connection' },
    { file: 'lib/crew/crewApi.ts', match: "from('time_punches').insert({", what: 'owner adds a punch (missed clock-out / day)', offline: 'needs_connection' },
    { file: 'lib/crew/crewApi.ts', match: "from('time_punches').update(body)", what: 'edit a punch', offline: 'needs_connection' },
    { file: 'lib/crew/crewApi.ts', match: 'storage.from(CREW_PHOTOS_BUCKET).remove([p.photoPath])', what: 'delete a punch: its photo', offline: 'needs_connection' },
    { file: 'lib/crew/crewApi.ts', match: "from('time_punches').delete()", what: 'delete a punch', offline: 'needs_connection' },
    { file: 'lib/crew/crewApi.ts', match: 'update({ approved_at: at })', what: 'approve / un-approve punches', offline: 'needs_connection' },
    { file: 'lib/crew/crewApi.ts', match: 'update({ timesheet_id: docId })', what: 'punches linked to their time sheet', offline: 'needs_connection' },
    { file: 'lib/crew/crewTimesheetApi.ts', match: "from('documents').update({ data: next })", what: 'crew hours → update the time sheet', offline: 'needs_connection' },
    { file: 'lib/crew/crewTimesheetApi.ts', match: "from('documents').insert(record)", what: 'crew hours → new time sheet', offline: 'needs_connection' },
    // crew clock-in (worker's link, no login: their phone keeps punches made offline and sends them later, lib/crew/punchQueue.ts)
    { file: 'lib/crew/crewPublicApi.ts', match: "rpc('crew_portal_get'", what: 'crew link page (worker)', offline: 'public' },
    { file: 'lib/crew/crewPublicApi.ts', match: "rpc('crew_punch'", what: 'clock in / out (worker)', offline: 'public' },
    { file: 'lib/crew/crewPublicApi.ts', match: 'storage.from(CREW_PHOTOS_BUCKET).upload(path, blob', what: 'clock-in photo (worker)', offline: 'public' },

    // ------------------------------------------------------------------------------------------- punch lists
    { file: 'components/punch/punchApi.ts', match: "from('punch_items').insert(row)", what: 'add punch item (offline → outbox)', offline: 'queue' },
    { file: 'components/punch/punchApi.ts', match: "from('punch_items').update(", what: 'check off / edit punch item (offline → outbox)', offline: 'queue' },
    { file: 'components/punch/punchApi.ts', match: "from('punch_items').delete().in('id', ids)", what: 'delete punch items', offline: 'needs_connection' },
    { file: 'components/punch/punchApi.ts', match: "from('punch_lists').upsert(", what: 'show / hide the punch list in the portal', offline: 'needs_connection' },
    { file: 'components/punch/PortalPunchList.tsx', match: "rpc('punch_item_feedback_via_portal'", what: 'client "Looks good" / "Needs work" (portal)', offline: 'public' },
    { file: 'lib/noteDocuments.ts', match: "from('documents').insert(row)", what: 'punch-list sign-off / lien waiver saved as a job note', offline: 'needs_connection' },

    // ------------------------------------------------------------------------------------------- job tasks + schedule (D2)
    { file: 'lib/tasks/tasksApi.ts', match: "from('job_tasks').insert(row)", what: 'add a job task', offline: 'needs_connection' },
    { file: 'lib/tasks/tasksApi.ts', match: "from('job_tasks').insert(rows)", what: 'add several job tasks (AI / work order / template)', offline: 'needs_connection' },
    { file: 'lib/tasks/tasksApi.ts', match: 'update({ depends_on: wanted })', what: 'link the dependencies of tasks added together', offline: 'needs_connection' },
    { file: 'lib/tasks/tasksApi.ts', match: "from('job_tasks').update(row)", what: 'edit a job task / its status', offline: 'needs_connection' },
    { file: 'lib/tasks/tasksApi.ts', match: 'update(taskPatchRow({ startDate: p.startDate', what: 'move the tasks that wait for a moved task', offline: 'needs_connection' },
    { file: 'lib/tasks/tasksApi.ts', match: 'update({ sort_order: p.sortOrder })', what: 'reorder job tasks', offline: 'needs_connection' },
    { file: 'lib/tasks/tasksApi.ts', match: "from('job_tasks').delete()", what: 'delete a job task', offline: 'needs_connection' },
    { file: 'lib/tasks/tasksApi.ts', match: 'storage.from(TASK_PHOTOS_BUCKET).remove([task.completedPhotoPath])', what: 'delete a job task: the worker\'s done photo', offline: 'needs_connection' },
    { file: 'lib/tasks/tasksApi.ts', match: "from('task_comments').insert(row)", what: 'comment on a job task', offline: 'needs_connection' },
    { file: 'lib/tasks/tasksApi.ts', match: "from('task_comments').delete()", what: 'delete a task comment', offline: 'needs_connection' },
    { file: 'src/ai/extractTasks.ts', match: "functions.invoke('ai-assistant'", what: 'AI: turn a note / daily report into proposed tasks', offline: 'needs_connection' },
    // job tasks on the crew link (worker, no login)
    { file: 'lib/tasks/tasksPublicApi.ts', match: "rpc('crew_tasks_get'", what: 'crew link: the worker\'s tasks', offline: 'public' },
    { file: 'lib/tasks/tasksPublicApi.ts', match: "rpc('crew_task_update'", what: 'crew link: mark a task started / done, comment', offline: 'public' },
    { file: 'lib/tasks/tasksPublicApi.ts', match: 'storage.from(CREW_TASK_PHOTOS_BUCKET).upload(path, blob', what: 'crew link: task done photo', offline: 'public' },

    // ------------------------------------------------------------------------------------------- papers vault
    { file: 'components/papers/papersApi.ts', match: "from('company_papers').insert(row)", what: 'add paper (insurance, license, permit)', offline: 'needs_connection' },
    { file: 'components/papers/papersApi.ts', match: "from('company_papers').update((", what: 'edit paper', offline: 'needs_connection' },
    { file: 'components/papers/papersApi.ts', match: 'storage.from(PAPERS_BUCKET).upload(path, file', what: 'paper file upload', offline: 'needs_connection' },
    { file: 'components/papers/papersApi.ts', match: 'storage.from(PAPERS_BUCKET).remove([path])', what: 'replaced / deleted paper file removed', offline: 'background' },
    { file: 'components/papers/papersApi.ts', match: "from('company_papers').delete()", what: 'delete paper', offline: 'needs_connection' },
    { file: 'components/papers/papersApi.ts', match: 'update({ last_sent_at:', what: 'paper emailed: last sent (after the email)', offline: 'background' },

    // ------------------------------------------------------------------------------------------- service plans
    { file: 'components/service/servicePlansApi.ts', match: "rpc('generate_due_service_visits')", what: 'service plan visits that came due', offline: 'background' },
    { file: 'components/service/servicePlansApi.ts', match: "from('documents').insert(row)", what: 'service plan: its recurring invoice', offline: 'needs_connection' },
    { file: 'components/service/servicePlansApi.ts', match: 'update({ invoice_source_id: row.id })', what: 'service plan: link its recurring invoice', offline: 'needs_connection' },
    { file: 'components/service/servicePlansApi.ts', match: "from('service_plans').insert(row)", what: 'add service plan', offline: 'needs_connection' },
    { file: 'components/service/servicePlansApi.ts', match: "from('service_plans').update((", what: 'edit service plan', offline: 'needs_connection' },
    { file: 'components/service/servicePlansApi.ts', match: "from('service_plans').update({ status })", what: 'pause / resume / end a service plan', offline: 'needs_connection' },
    { file: 'components/service/servicePlansApi.ts', match: "from('service_plans').delete()", what: 'delete service plan', offline: 'needs_connection' },
    { file: 'components/service/servicePlansApi.ts', match: "rpc('complete_service_visit'", what: 'visit done / skipped', offline: 'needs_connection' },

    // ------------------------------------------------------------------------------- suppliers + product library (D4)
    { file: 'lib/suppliers/suppliersDb.ts', match: "from('suppliers').insert(row)", what: 'add supplier', offline: 'needs_connection' },
    { file: 'lib/suppliers/suppliersDb.ts', match: "from('suppliers').update(row)", what: 'edit / archive supplier', offline: 'needs_connection' },
    { file: 'lib/suppliers/suppliersDb.ts', match: "from('suppliers').insert(legacyRow)", what: 'copy the old supplier list into the suppliers table (once)', offline: 'needs_connection' },
    { file: 'lib/suppliers/suppliersDb.ts', match: "from('supplier_items').insert(row)", what: 'add supplier item', offline: 'needs_connection' },
    { file: 'lib/suppliers/suppliersDb.ts', match: "from('supplier_items').update(row)", what: 'edit supplier item / price / price-book link', offline: 'needs_connection' },
    { file: 'lib/suppliers/suppliersDb.ts', match: "from('supplier_items').delete()", what: 'delete supplier item', offline: 'needs_connection' },
    { file: 'lib/suppliers/suppliersDb.ts', match: "from('saved_items').update(row)", what: 'price-book item: link, specs, preferred supplier', offline: 'needs_connection' },
    { file: 'lib/suppliers/suppliersDb.ts', match: "from('supplier_items').insert(chunk)", what: 'supplier price list import: new items', offline: 'needs_connection' },

    // ------------------------------------------------------------------- job files + questions / submittals (D3)
    { file: 'lib/jobFiles/jobFilesApi.ts', match: "from('job_files').insert(row)", what: 'add a job file / version / link', offline: 'needs_connection' },
    { file: 'lib/jobFiles/jobFilesApi.ts', match: 'storage.from(JOB_FILES_BUCKET).upload(storagePath, input.file', what: 'job file upload (document-assets)', offline: 'needs_connection' },
    { file: 'lib/jobFiles/jobFilesApi.ts', match: "from('job_files').delete().eq('id', saved.id)", what: 'failed job file upload: remove its row again', offline: 'needs_connection' },
    { file: 'lib/jobFiles/jobFilesApi.ts', match: "from('job_files').update(row)", what: 'edit a job file / link (title, category, tags, notes, url)', offline: 'needs_connection' },
    { file: 'lib/jobFiles/jobFilesApi.ts', match: "from('job_files').update(body)", what: 'show / hide a link, hide a file in the client portal', offline: 'needs_connection' },
    { file: 'lib/jobFiles/jobFilesApi.ts', match: '.copy(file.storagePath, portalPath', what: 'share an image file in the portal: public copy', offline: 'needs_connection' },
    { file: 'lib/jobFiles/jobFilesApi.ts', match: 'storage.from(JOB_FILES_PORTAL_BUCKET).upload(portalPath, blob', what: 'share an image file in the portal: public copy (older storage servers)', offline: 'needs_connection' },
    { file: 'lib/jobFiles/jobFilesApi.ts', match: "from('job_files').update({ shared_in_portal: true, portal_path: portalPath })", what: 'share an image file in the portal', offline: 'needs_connection' },
    { file: 'lib/jobFiles/jobFilesApi.ts', match: 'storage.from(JOB_FILES_PORTAL_BUCKET).remove([portalPath])', what: 'failed share: remove the public copy again', offline: 'needs_connection' },
    { file: 'lib/jobFiles/jobFilesApi.ts', match: "from('job_files').delete().in('id', ids)", what: 'delete a job file / every version of a document', offline: 'needs_connection' },
    { file: 'lib/jobFiles/jobFilesApi.ts', match: 'storage.from(JOB_FILES_BUCKET).remove(paths)', what: 'delete a job file: its private file', offline: 'needs_connection' },
    { file: 'lib/questions/questionsApi.ts', match: "from('job_questions').insert(row)", what: 'add a client question / submittal (draft or sent)', offline: 'needs_connection' },
    { file: 'lib/questions/questionsApi.ts', match: "from('job_questions').update(row)", what: 'edit a client question / submittal', offline: 'needs_connection' },
    { file: 'lib/questions/questionsApi.ts', match: "from('job_questions').update({ status })", what: 'send / close / ask again / reopen a question', offline: 'needs_connection' },
    { file: 'lib/questions/questionsApi.ts', match: "from('job_questions').delete()", what: 'delete a client question / submittal', offline: 'needs_connection' },
    { file: 'lib/portal/questionsApi.ts', match: "rpc('answer_portal_question'", what: 'client answers a question / approves or rejects a submittal (portal)', offline: 'public' },

    // ------------------------------------------------------------------------------- leads + appointments (D1)
    { file: 'lib/leads/leadsApi.ts', match: "from('quote_requests').insert(row)", what: 'add a lead by hand', offline: 'needs_connection' },
    { file: 'lib/leads/leadsApi.ts', match: "from('quote_requests').update(row)", what: 'edit a lead / stage / follow-up / lost reason / attachments list', offline: 'needs_connection' },
    { file: 'lib/leads/leadsApi.ts', match: 'storage.from(LEAD_FILES_BUCKET).remove(paths)', what: 'delete a lead: its attachment files', offline: 'needs_connection' },
    { file: 'lib/leads/leadsApi.ts', match: 'storage.from(LEAD_FILES_BUCKET).upload(path, file', what: 'lead attachment upload', offline: 'needs_connection' },
    { file: 'lib/leads/leadsApi.ts', match: 'storage.from(LEAD_FILES_BUCKET).remove([path])', what: 'remove a lead attachment file (also undo of a failed add)', offline: 'needs_connection' },
    { file: 'lib/leads/leadsApi.ts', match: "from('appointments').insert(row)", what: 'book an appointment', offline: 'needs_connection' },
    { file: 'lib/leads/leadsApi.ts', match: "from('appointments').update(row)", what: 'edit / cancel / mark done an appointment', offline: 'needs_connection' },
    { file: 'lib/leads/leadsApi.ts', match: "from('appointments').delete()", what: 'delete an appointment', offline: 'needs_connection' },
];

/** Rows of the table that cover a scanned line. */
export const auditRowsFor = (file: string, text: string): WritePathEntry[] => WRITE_PATHS.filter(r => r.file === file && text.includes(r.match));
