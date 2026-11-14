/**
 * Settings › Notifications (id settings-notifications): browser pop-ups on this device (off by default), quiet mode
 * and a switch per notification type. Types and quiet mode follow the account; pop-ups are per device because the
 * browser's permission is. Nothing here sends email.
 */
import React, { useState, useSyncExternalStore } from 'react';
import { notificationStore } from '../../lib/notifications/store.ts';
import { NOTIFICATION_CATEGORIES, isCategoryOn, setCategory } from '../../lib/notifications/model.ts';
import { popupSupport, requestPopupPermission, showPopup, type PopupSupport } from '../../lib/notifications/popups.ts';

/** A compact switch for list rows (the bordered Toggle box would turn 12 rows into 12 cards). */
const Switch: React.FC<{ checked: boolean; onChange: (on: boolean) => void; label: string; disabled?: boolean; describedBy?: string }> = ({ checked, onChange, label, disabled, describedBy }) => (
    <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        aria-describedby={describedBy}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 ${checked ? 'bg-primary' : 'bg-muted ring-1 ring-inset ring-border'}`}
    >
        <span className={`inline-block h-5 w-5 rounded-full bg-card shadow transition-transform ${checked ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
    </button>
);

const SettingRow: React.FC<{ id: string; title: string; hint: React.ReactNode; checked: boolean; onChange: (on: boolean) => void; disabled?: boolean }> = ({ id, title, hint, checked, onChange, disabled }) => (
    <li className="flex items-start justify-between gap-4 py-3">
        <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">{title}</p>
            <p id={`${id}-hint`} className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
        </div>
        <Switch checked={checked} onChange={onChange} label={title} disabled={disabled} describedBy={`${id}-hint`} />
    </li>
);

const NotificationSettingsCard: React.FC = () => {
    const snap = useSyncExternalStore(notificationStore.subscribe, notificationStore.getSnapshot, notificationStore.getSnapshot);
    const [support, setSupport] = useState<PopupSupport>(() => popupSupport());
    const [asking, setAsking] = useState(false);
    const ready = Boolean(snap.uid);
    const { prefs } = snap;
    const popupsOn = snap.device.popups && support === 'granted';

    const togglePopups = async (on: boolean) => {
        if (!on) { notificationStore.setDevice({ popups: false }); return; }
        let s = popupSupport();
        if (s === 'default') {
            setAsking(true);
            s = await requestPopupPermission();
            setAsking(false);
        }
        setSupport(s);
        if (s !== 'granted') return;
        notificationStore.setDevice({ popups: true });
        showPopup('Pop-up notifications are on', 'New activity shows here while ContractorDocs is open in another tab or window.', 'cd-popups-on');
    };

    const popupHint = support === 'unsupported'
        ? 'This browser can’t show pop-up notifications. The bell still works.'
        : support === 'denied'
            ? 'Blocked by this browser. Allow notifications for this site in the browser’s site settings, then switch this on.'
            : asking
                ? 'Allow notifications in the browser’s prompt…'
                : 'While ContractorDocs is open in another tab or window, new activity also pops up from the browser. This device only; off unless you switch it on.';

    return (
        <section id="settings-notifications" className="card scroll-mt-24" aria-labelledby="settings-notifications-title">
            <div className="border-b border-border px-4 py-4 sm:px-6">
                <h2 id="settings-notifications-title" className="text-base font-semibold">Notifications</h2>
                <p className="mt-0.5 text-sm text-muted-foreground">What the bell at the top shows. Nothing here is emailed: notifications stay in the app.</p>
            </div>
            <div className="p-4 sm:p-6">
                <ul className="-my-3 divide-y divide-border">
                    <SettingRow
                        id="notif-popups"
                        title="Pop-up notifications on this device"
                        hint={popupHint}
                        checked={popupsOn}
                        onChange={(on) => { void togglePopups(on); }}
                        disabled={!ready || support === 'unsupported' || support === 'denied' || asking}
                    />
                    <SettingRow
                        id="notif-quiet"
                        title="Quiet mode"
                        hint="No pop-ups, and the bell shows a small dot instead of a number. Everything still collects in the list."
                        checked={prefs.quiet}
                        onChange={(on) => notificationStore.setPrefs({ ...prefs, quiet: on })}
                        disabled={!ready}
                    />
                </ul>

                <h3 className="mt-6 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Show in the bell</h3>
                <ul className="divide-y divide-border">
                    {NOTIFICATION_CATEGORIES.map(c => (
                        <SettingRow
                            key={c.id}
                            id={`notif-type-${c.id}`}
                            title={c.label}
                            hint={c.hint}
                            checked={isCategoryOn(prefs, c.id)}
                            onChange={(on) => notificationStore.setPrefs(setCategory(prefs, c.id, on, Date.now()))}
                            disabled={!ready}
                        />
                    ))}
                </ul>
                <p className="mt-3 text-xs text-muted-foreground">
                    These choices follow your account to every device. The Clients, Tools and Community badges keep working as before.
                </p>
            </div>
        </section>
    );
};

export default NotificationSettingsCard;
