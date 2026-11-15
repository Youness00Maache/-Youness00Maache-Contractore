/**
 * Tax and terms defaults bound to this browser and the account (user_settings 'documents.money'). Rules and shape:
 * lib/setup/moneyDefaults.ts; raw storage: lib/userData.ts.
 */
import { loadMoneyDefaultsRaw, readMoneyDefaultsRaw, saveMoneyDefaultsRaw, type SyncMode } from '../userData.ts';
import { hasMoneyDefaults, normalizeMoneyDefaults, type MoneyDefaults } from './moneyDefaults.ts';

/** This device's copy (instant): what a new estimate or invoice starts with. null = nothing set. */
export const currentMoneyDefaults = (): MoneyDefaults | null => {
    try {
        const d = normalizeMoneyDefaults(readMoneyDefaultsRaw());
        return hasMoneyDefaults(d) ? d : null;
    } catch { return null; }
};

/** The account's copy (every device), refreshing this device's copy; null = nothing set. */
export const loadMoneyDefaults = async (): Promise<MoneyDefaults | null> => {
    try {
        const d = normalizeMoneyDefaults(await loadMoneyDefaultsRaw());
        return hasMoneyDefaults(d) ? d : null;
    } catch { return currentMoneyDefaults(); }
};

/** Saves the defaults on this device and in the account. */
export const saveMoneyDefaults = (value: MoneyDefaults): Promise<SyncMode> =>
    saveMoneyDefaultsRaw({ ...normalizeMoneyDefaults(value), updatedAt: new Date().toISOString() });
