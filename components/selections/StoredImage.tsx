/**
 * A picture from the owner's private storage (option images, board uploads): its signed link is fetched once and kept for
 * 50 minutes, so a list of options does not ask again on every render. `src` shows first when given (a picture just
 * picked on this device). Renders a quiet placeholder while loading, or when there is no picture.
 */
import React, { useEffect, useState } from 'react';
import { optionImageUrl } from '../../lib/selections/selectionsApi.ts';
import { boardImageUrl } from '../../lib/boards/boardsApi.ts';
import { cx } from '../commsKit.tsx';

const cache = new Map<string, { url: string; exp: number }>();
const TTL_MS = 50 * 60 * 1000;

export type StoredKind = 'selection' | 'board';

export async function signedUrlFor(kind: StoredKind, path: string): Promise<string | null> {
    const key = `${kind}:${path}`;
    const hit = cache.get(key);
    if (hit && hit.exp > Date.now()) return hit.url;
    const url = await (kind === 'board' ? boardImageUrl(path) : optionImageUrl(path));
    if (url) cache.set(key, { url, exp: Date.now() + TTL_MS });
    return url;
}

/** Signed links of many paths at once (the board gallery preview). */
export function useSignedUrls(kind: StoredKind, paths: readonly string[]): Record<string, string | null> {
    const key = paths.join('|');
    const [urls, setUrls] = useState<Record<string, string | null>>({});
    useEffect(() => {
        let alive = true;
        const list = key ? key.split('|') : [];
        if (!list.length) { setUrls({}); return; }
        void Promise.all(list.map(async p => [p, await signedUrlFor(kind, p).catch(() => null)] as const)).then(pairs => {
            if (alive) setUrls(Object.fromEntries(pairs));
        });
        return () => { alive = false; };
    }, [kind, key]);
    return urls;
}

const StoredImage: React.FC<{
    kind?: StoredKind;
    path: string | null;
    /** a picture already in hand (picked on this device): shown instead of asking for the link */
    src?: string | null;
    alt: string;
    className?: string;
    /** shown when there is no picture */
    fallback?: React.ReactNode;
}> = ({ kind = 'selection', path, src, alt, className, fallback }) => {
    const [url, setUrl] = useState<string | null>(src ?? null);
    const [failed, setFailed] = useState(false);
    useEffect(() => {
        setFailed(false);
        if (src) { setUrl(src); return; }
        if (!path) { setUrl(null); return; }
        let alive = true;
        void signedUrlFor(kind, path).then(u => { if (alive) setUrl(u); }).catch(() => { if (alive) setUrl(null); });
        return () => { alive = false; };
    }, [kind, path, src]);
    if (!url || failed) {
        return <span className={cx('flex items-center justify-center bg-muted text-[11px] font-semibold uppercase tracking-wider text-muted-foreground', className)} aria-hidden={!fallback}>{fallback ?? (path ? '' : 'No photo')}</span>;
    }
    return <img src={url} alt={alt} loading="lazy" className={cx('object-cover', className)} onError={() => setFailed(true)} />;
};

export default StoredImage;
