/**
 * "Open this" handed from the notification bell to a screen that may not be mounted yet: the quote-request window on
 * the dashboard (components/requests/RequestsInbox.tsx) and an inventory item (components/InventoryView.tsx, which
 * also reads /inventory?item=<id> when it mounts). The screen takes the pending id when it loads, or hears the event
 * when it is already open.
 */
export const OPEN_REQUEST_EVENT = 'cd:open-quote-request';
export const OPEN_INVENTORY_ITEM_EVENT = 'cd:open-inventory-item';

let pendingRequestId: string | null = null;

/** Asks the dashboard's request inbox to open this request (the caller navigates to the dashboard). */
export const requestOpenQuoteRequest = (id: string): void => {
    pendingRequestId = id;
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(OPEN_REQUEST_EVENT, { detail: id }));
};

/** The request to open, once (null when none is waiting). */
export const takePendingQuoteRequest = (): string | null => {
    const id = pendingRequestId;
    pendingRequestId = null;
    return id;
};

/** Asks an open inventory screen to show this item (the caller also navigates to /inventory?item=<id>). */
export const requestOpenInventoryItem = (id: string): void => {
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(OPEN_INVENTORY_ITEM_EVENT, { detail: id }));
};
