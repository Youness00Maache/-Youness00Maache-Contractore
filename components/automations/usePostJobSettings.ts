/**
 * The after-the-job email settings (user_settings 'reminders.postjob') for Settings > Automations: loads them once, applies
 * a change at once (the screen never waits), and saves it through lib/userData.ts like every other account setting: on
 * this device straight away, in the account when it can be reached (every device, and the reminders server, read that copy).
 *
 *   const pj = usePostJobSettings();
 *   pj.settings            the settings (null while loading)
 *   pj.change((s, now) => setPostJobEnabled(s, 'completion', true, todayYmd, now))
 *   pj.sync                'saving' | 'account' | 'offline' | 'device' | 'failed' | null (last save)
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { defaultPostJobSettings, loadPostJobSettings, savePostJobSettings } from '../../lib/warranty/postJobSettings.ts';
import type { PostJobSettings } from '../../lib/warranty/types.ts';
import type { SyncMode } from '../../lib/userData.ts';

export type PostJobSync = SyncMode | 'saving' | null;

export function usePostJobSettings() {
    const [settings, setSettings] = useState<PostJobSettings | null>(null);
    const [sync, setSync] = useState<PostJobSync>(null);
    const latest = useRef<PostJobSettings | null>(null);
    const chain = useRef<Promise<unknown>>(Promise.resolve());
    const alive = useRef(true);

    useEffect(() => {
        alive.current = true;
        void loadPostJobSettings().then(s => {
            if (!alive.current || latest.current) return;
            latest.current = s;
            setSettings(s);
        });
        return () => { alive.current = false; };
    }, []);

    const change = useCallback((fn: (s: PostJobSettings, now: number) => PostJobSettings) => {
        const base = latest.current ?? defaultPostJobSettings();
        const next = fn(base, Date.now());
        if (next === base) return;
        latest.current = next;
        setSettings(next);
        setSync('saving');
        // saves go one after the other, so an older copy can never land after a newer one
        chain.current = chain.current
            .then(() => savePostJobSettings(latest.current as PostJobSettings))
            .then(mode => { if (alive.current) setSync(mode); })
            .catch(() => { if (alive.current) setSync('failed'); });
    }, []);

    return { settings, change, sync };
}
