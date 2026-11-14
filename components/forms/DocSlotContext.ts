import { createContext, useContext } from 'react';

/**
 * Free plan: "does this job still have a new-document slot this month?" (App.tsx ensureDocSlot for the open form's
 * job). Called BEFORE a form opens already filled from another document (Convert to invoice, Create revision), so
 * the user never types into a form whose save the database would refuse; when the slot is used up it opens the
 * upgrade window and resolves false. Null outside the app (tests, previews): nothing is checked.
 */
export const DocSlotContext = createContext<(() => Promise<boolean>) | null>(null);

export const useEnsureDocSlot = () => useContext(DocSlotContext);
