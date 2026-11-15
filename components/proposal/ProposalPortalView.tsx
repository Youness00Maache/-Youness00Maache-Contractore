/**
 * What the client sees of a proposal on the approval link / portal (read-only): scope sections, optional add-ons
 * (with their price, NOT in the total: choosing them online comes with D13), payment schedule and photos.
 * Money: utils/money.ts (the same rule as the PDF and the forms).
 */
import React from 'react';
import { isExcludedOptionalLine, lineItemScheduledValue } from '../../utils/money.ts';
import { bulletItems, computeMilestones, filledSections, readProposal } from '../../lib/proposal.ts';

export const ProposalPortalView: React.FC<{ data: Record<string, any>; total: number; money: (v: number) => string }> = ({ data, total, money }) => {
    const p = readProposal(data);
    const sections = filledSections(p);
    const addOns = (Array.isArray(data.lineItems) ? data.lineItems : []).filter((li: unknown) => li && typeof li === 'object' && isExcludedOptionalLine(li as never));
    const sched = computeMilestones(p.milestones, total);
    if (!sections.length && !addOns.length && !sched.rows.length && !p.images.length) return null;
    return (
        <div className="space-y-6">
            {sections.map(s => (
                <section key={s.id}>
                    <h3 className="label">{s.title}</h3>
                    {s.style === 'bullets'
                        ? <ul className="list-disc space-y-1 pl-5 text-sm text-foreground">{bulletItems(s.text).map((b, i) => <li key={i} className="break-words">{b}</li>)}</ul>
                        : <p className="whitespace-pre-wrap break-words text-sm text-foreground">{s.text.trim()}</p>}
                </section>
            ))}
            {addOns.length > 0 && (
                <section>
                    <h3 className="label">Optional add-ons</h3>
                    <p className="mb-2 text-sm text-muted-foreground">Not included in the total. Ask the contractor to add any of them.</p>
                    <ul className="divide-y divide-border rounded-xl border border-dashed border-border">
                        {addOns.map((li: any, i: number) => (
                            <li key={String(li.id || i)} className="flex items-start justify-between gap-3 p-3 text-sm">
                                <span className="min-w-0 whitespace-pre-wrap break-words text-foreground">
                                    <span className="mr-2 inline-block rounded border border-border px-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Optional</span>
                                    {String(li.description || '').trim() || 'Add-on'}
                                </span>
                                <span className="shrink-0 font-medium tabular-nums text-muted-foreground">{money(lineItemScheduledValue(li))}</span>
                            </li>
                        ))}
                    </ul>
                </section>
            )}
            {sched.rows.length > 0 && (
                <section>
                    <h3 className="label">Payment schedule</h3>
                    <ol className="divide-y divide-border rounded-xl border border-border">
                        {sched.rows.map(m => (
                            <li key={m.id} className="flex items-baseline justify-between gap-3 p-3 text-sm">
                                <span className="min-w-0">
                                    <span className="font-medium text-foreground">{m.label}</span>
                                    {m.due && <span className="text-muted-foreground"> · {m.due}</span>}
                                </span>
                                <span className="shrink-0 tabular-nums"><span className="mr-2 text-xs text-muted-foreground">{Math.round(m.percent * 100) / 100}%</span><span className="font-semibold">{money(m.amount)}</span></span>
                            </li>
                        ))}
                    </ol>
                </section>
            )}
            {p.images.length > 0 && (
                <section>
                    <h3 className="label">Project photos</h3>
                    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                        {p.images.map((im, i) => (
                            <li key={im.id}>
                                <figure>
                                    <img src={im.url} alt={im.caption || `Project photo ${i + 1}`} loading="lazy" className="aspect-[4/3] w-full rounded-lg object-cover" />
                                    {im.caption && <figcaption className="mt-1 text-xs text-muted-foreground">{im.caption}</figcaption>}
                                </figure>
                            </li>
                        ))}
                    </ul>
                </section>
            )}
        </div>
    );
};

export default ProposalPortalView;
