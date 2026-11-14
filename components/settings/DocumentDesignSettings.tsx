import React, { useEffect, useState } from 'react';
import { CheckIcon, LockIcon } from '../Icons.tsx';
import { TEMPLATE_PREVIEWS } from '../../content/templatePreviews.ts';
import { DESIGN_GROUPS, DEFAULT_TEMPLATE_ID, getTemplateMeta, resolveTemplateId } from '../../utils/templates/registry.ts';
import { canUseDesign, designDefaultFor, requestDesignUpgrade, type DesignDefault } from '../../lib/designAccess.ts';
import { currentDesignDefault, loadDesignDefault, saveDesignDefault } from '../../lib/designDefaults.ts';

const PREVIEW_BY_ID = new Map(TEMPLATE_PREVIEWS.map(p => [p.id, p]));

/** Short text for the colors / font / paper / layout the saved default carries. */
export const designDefaultSummary = (def: DesignDefault | null): string => {
    if (!def) return 'Template colors';
    const parts: string[] = [];
    parts.push(def.themeColors?.custom && def.themeColors.primary ? `Accent ${def.themeColors.primary.toUpperCase()}` : 'Template colors');
    const font = def.themeColors?.font || def.fontFamily;
    if (font && font !== 'template') parts.push(`${font.replace(/_/g, ' ')} font`);
    const paper = def.themeColors?.paper || def.paperSize;
    if (paper) parts.push(paper === 'a4' ? 'A4' : 'US Letter');
    if (def.designOptions) parts.push('customized layout');
    return parts.join(' · ');
};

/** What changing the design in Settings saves: the new design, keeping colors, font and paper (layout options belong to one design). */
export const defaultWithDesign = (current: DesignDefault | null, templateId: string): DesignDefault => {
    const { designOptions: _drop, ...rest } = current || ({} as DesignDefault);
    return { ...rest, templateId: resolveTemplateId(templateId) };
};

const Preview: React.FC<{ id: string; name: string; className: string }> = ({ id, name, className }) => {
    const p = PREVIEW_BY_ID.get(id);
    return p
        ? <img src={p.src} alt={`${name} preview`} loading="lazy" className={`${className} object-cover object-top`} />
        : <span className={`${className} flex items-center justify-center bg-muted text-[10px] text-muted-foreground`}>{name}</span>;
};

/** Settings > Document design: the default design of NEW documents (same setting as "Use for new documents" in the form picker). */
const DocumentDesignSettings: React.FC<{ plan: string | null | undefined }> = ({ plan }) => {
    const [stored, setStored] = useState<DesignDefault | null>(() => currentDesignDefault());
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [status, setStatus] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

    useEffect(() => {
        let live = true;
        loadDesignDefault().then(d => { if (live) setStored(d); }).catch(() => { /* keep this device's copy */ });
        return () => { live = false; };
    }, []);

    const shown = designDefaultFor(stored, plan);
    const meta = getTemplateMeta(shown.templateId);
    const premium = meta.tier === 'premium';
    const keptPremium = !!stored && stored.templateId !== shown.templateId;
    const premiumLocked = !canUseDesign(plan, 'executive');

    const save = async (value: DesignDefault | null) => {
        setBusy(true); setStatus(null);
        try {
            const r = await saveDesignDefault(value, plan);
            if (r === 'locked') { requestDesignUpgrade(value ? getTemplateMeta(value.templateId).name : undefined); return; }
            if (r === 'failed') { setStatus({ tone: 'error', text: 'Could not save the default design. Try again.' }); return; }
            setStored(currentDesignDefault());
            setOpen(false);
            setStatus({ tone: 'ok', text: r === 'account' ? 'Saved. New documents will use this design.' : 'Saved on this device. New documents will use this design.' });
        } catch {
            setStatus({ tone: 'error', text: 'Could not save the default design. Try again.' });
        } finally { setBusy(false); }
    };

    const choose = (id: string) => {
        if (!canUseDesign(plan, id)) { requestDesignUpgrade(getTemplateMeta(id).name); return; }
        if (resolveTemplateId(id) === shown.templateId) { setOpen(false); return; }
        void save(defaultWithDesign(stored, id));
    };

    return (
        <div>
            <div className="flex items-start gap-4">
                <Preview id={meta.id} name={meta.name} className="h-28 w-[5.25rem] shrink-0 rounded-sm border border-border shadow-sm" />
                <div className="min-w-0 flex-1">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">New documents start with</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-2 text-lg font-semibold leading-tight">
                        {meta.name}
                        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${premium ? 'border-primary/40 text-primary' : 'border-border text-muted-foreground'}`}>{premium ? 'Premium' : 'Basic'}</span>
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">{designDefaultSummary(stored ? shown : null)}</p>
                    {keptPremium && <p className="mt-1 text-xs text-muted-foreground">Your saved design is Premium, so documents on the Free plan use Classic until you upgrade.</p>}
                    <div className="mt-3 flex flex-wrap gap-2">
                        <button type="button" className="btn btn-outline btn-sm h-9" aria-expanded={open} onClick={() => setOpen(o => !o)} disabled={busy}>{open ? 'Close' : 'Change design'}</button>
                        {stored && (stored.templateId !== DEFAULT_TEMPLATE_ID || !!stored.themeColors || !!stored.designOptions) && (
                            <button type="button" className="btn btn-ghost btn-sm h-9" onClick={() => void save(null)} disabled={busy}>Reset to Classic</button>
                        )}
                    </div>
                </div>
            </div>
            {status && <p role="status" className={`mt-3 flex items-center gap-1.5 text-sm ${status.tone === 'error' ? 'text-destructive' : 'text-success'}`}>{status.tone === 'ok' && <CheckIcon className="h-4 w-4" />}{status.text}</p>}
            {open && (
                <div className="mt-4 space-y-4 border-t border-border pt-4">
                    {DESIGN_GROUPS.map(g => {
                        const locked = g.id === 'premium' && premiumLocked;
                        const items = TEMPLATE_PREVIEWS.filter(p => p.premium === (g.id === 'premium'));
                        return (
                            <div key={g.id}>
                                <p className="text-sm font-semibold">{g.label} <span className="font-normal text-muted-foreground">· {g.description}</span></p>
                                <ul className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-6">
                                    {items.map(p => (
                                        <li key={p.id}>
                                            <button
                                                type="button"
                                                disabled={busy}
                                                onClick={() => choose(p.id)}
                                                aria-pressed={p.id === shown.templateId}
                                                aria-label={locked ? `${p.name} (Premium, upgrade to use)` : p.name}
                                                className={`block w-full rounded-sm text-left ${p.id === shown.templateId ? 'ring-2 ring-primary' : ''}`}
                                            >
                                                <span className="relative block">
                                                    <Preview id={p.id} name={p.name} className="aspect-[3/4] w-full rounded-sm border border-border" />
                                                    {locked && <span className="absolute right-1 top-1 rounded bg-background/90 p-1"><LockIcon className="h-3 w-3" /></span>}
                                                </span>
                                                <span className="mt-1 block truncate text-xs font-medium">{p.name}</span>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default DocumentDesignSettings;
