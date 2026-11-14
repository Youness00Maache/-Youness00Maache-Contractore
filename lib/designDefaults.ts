/**
 * The user's default document design, bound to this browser and the account (user_settings 'documents.design').
 * Rules (who may use which design, Free-plan fallback) live in lib/designAccess.ts; storage in lib/userData.ts.
 */
import { loadDesignDefaultRaw, readDesignDefaultRaw, saveDesignDefaultRaw } from './userData.ts';
import {
    normalizeDesignDefault, readUserDesignDefault, saveUserDesignDefault, type DesignDefault, type DesignDefaultStore,
} from './designAccess.ts';

export const designDefaultStore: DesignDefaultStore = {
    readLocal: () => readDesignDefaultRaw(),
    load: loadDesignDefaultRaw,
    save: saveDesignDefaultRaw,
};

/** This device's copy (instant): what a new document starts with. */
export const currentDesignDefault = (): DesignDefault | null => readUserDesignDefault(designDefaultStore);

/** The account's copy (every device), refreshing this device's copy. */
export const loadDesignDefault = async (): Promise<DesignDefault | null> => {
    try { return normalizeDesignDefault(await loadDesignDefaultRaw()); } catch { return currentDesignDefault(); }
};

/** Saves the default ('locked' = a Premium design on the Free plan: open the upgrade window). */
export const saveDesignDefault = (value: DesignDefault | null, plan: string | null | undefined): Promise<string> =>
    saveUserDesignDefault(designDefaultStore, value, plan);
