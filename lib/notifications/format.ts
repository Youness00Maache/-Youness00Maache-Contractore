/**
 * Display helpers of the notification bell (kept apart from model.ts so the app bar doesn't load the derivation code).
 */
import { daysBetween, toLocalYMD } from '../../utils/localDates.ts';
import type { ShownNotification } from './model.ts';

export interface NotificationGroup {
    id: 'today' | 'earlier';
    label: string;
    items: ShownNotification[];
}

/** Today / Earlier (local days), empty groups left out. */
export const groupByDay = (list: readonly ShownNotification[], now: number): NotificationGroup[] => {
    const today = toLocalYMD(new Date(now));
    const groups: NotificationGroup[] = [
        { id: 'today', label: 'Today', items: [] },
        { id: 'earlier', label: 'Earlier', items: [] },
    ];
    for (const n of list) (toLocalYMD(new Date(n.at)) === today ? groups[0] : groups[1]).items.push(n);
    return groups.filter(g => g.items.length > 0);
};

/** "now", "5m", "3h", "Yesterday", "4d", "Nov 3". */
export const timeLabel = (at: number, now: number): string => {
    const diff = Math.max(0, now - at);
    if (diff < 60_000) return 'now';
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
    const days = daysBetween(new Date(at), new Date(now));
    if (days === 0) return `${Math.floor(diff / 3_600_000)}h`;
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days}d`;
    return new Date(at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

/** Bell badge text: '' (nothing), '•' (quiet), '1'…'99+'. */
export const badgeText = (unread: number, quiet: boolean): string => {
    if (unread <= 0) return '';
    if (quiet) return '•';
    return unread > 99 ? '99+' : String(unread);
};

