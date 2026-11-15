import type { UserProfile } from '../../types.ts';
import type { PaymentSettings } from '../../lib/payments.ts';
import type { SetupProgress, SetupStepId } from '../../lib/setup/steps.ts';
import type { SetupState } from '../../lib/setup/state.ts';
import type { ExampleTracking } from '../../lib/setup/example.ts';

/** What a step screen gets from the sheet (the sheet and host own the saving of the wizard's own memory). */
export interface SetupCtx {
    userId: string;
    profile: UserProfile;
    plan: string;
    isOnline: boolean;
    progress: SetupProgress;
    state: SetupState;
    example: ExampleTracking;
    /** English chrome strings of the app's translation table */
    t: Record<string, string>;
    /** Settings save path of the app (profile fields, logo, payment links). Throws with a readable message. */
    saveProfile: (updated: UserProfile, logoFile?: File | null, extras?: { paymentSettings?: PaymentSettings | null }) => Promise<void>;
    /** Updates the app's copy of profile values saved elsewhere (labor rate) */
    patchProfile: (patch: Partial<UserProfile>) => void;
    /** Re-reads the account (price book, design, tax defaults, crew) so progress is exact */
    refresh: () => Promise<void>;
    setTrades: (ids: string[]) => void;
    /** go to the next screen / back */
    next: () => void;
    back: (() => void) | null;
    skip: () => void;
    /** marks a step as skipped without leaving it (the logo was left out on purpose) */
    markSkipped: (id: SetupStepId) => void;
    go: (screen: SetupStepId | 'finish') => void;
    upgrade: (reason?: string) => void;
    /** navigation actions of the summary */
    navigate: (path: string) => void;
    close: () => void;
    /** example project */
    addExample: () => Promise<string>;
    removeExample: () => Promise<string>;
}
