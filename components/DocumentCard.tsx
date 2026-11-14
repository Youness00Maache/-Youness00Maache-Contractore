import React from 'react';
import { Button } from './ui/Button.tsx';
import { DropdownMenu, DropdownItem } from './ui/DropdownMenu.tsx';
import {
    MoreVerticalIcon, TrashIcon, CopyIcon, DownloadIcon, ShareIcon, SparklesIcon, CheckCircleIcon,
    InvoiceIcon, EstimateIcon, WorkOrderIcon, DailyReportIcon, TimeSheetIcon, MaterialLogIcon, ExpenseLogIcon,
    WarrantyIcon, NoteIcon, ReceiptIcon, ChangeOrderIcon, TruckIcon, FileTextIcon,
} from './Icons.tsx';
import { FormType, type FormData as FormDataType } from '../types.ts';
import { StatusBadge } from './forms/FormShell.tsx';
import { documentNumberOf, documentTotalTextOf } from './ShareModal.tsx';

interface DocumentCardProps {
    form: FormDataType;
    highlightAi?: boolean;
    onClick: () => void;
    onDelete: () => void;
    onDuplicate: () => void;
    /** optional quick actions */
    onDownload?: () => void;
    onShare?: () => void;
}

const ICONS: Record<string, React.ComponentType<React.SVGProps<SVGSVGElement>>> = {
    [FormType.Invoice]: InvoiceIcon,
    [FormType.Estimate]: EstimateIcon,
    [FormType.WorkOrder]: WorkOrderIcon,
    [FormType.DailyJobReport]: DailyReportIcon,
    [FormType.TimeSheet]: TimeSheetIcon,
    [FormType.MaterialLog]: MaterialLogIcon,
    [FormType.ExpenseLog]: ExpenseLogIcon,
    [FormType.Warranty]: WarrantyIcon,
    [FormType.Note]: NoteIcon,
    [FormType.Receipt]: ReceiptIcon,
    [FormType.ChangeOrder]: ChangeOrderIcon,
    [FormType.PurchaseOrder]: TruckIcon,
};

export const getDocTitle = (form: FormDataType): string => {
    const d = (form.data || {}) as any;
    return String(d.title || documentNumberOf(d) || d.vendor || d.workerName || form.type);
};

const formatDate = (iso?: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

export const DocumentCard: React.FC<DocumentCardProps> = ({ form, highlightAi, onClick, onDelete, onDuplicate, onDownload, onShare }) => {
    const d = (form.data || {}) as any;
    const isAi = Boolean(highlightAi || d.isAiGenerated);
    const Icon = ICONS[form.type] || FileTextIcon;
    const title = getDocTitle(form);
    const number = documentNumberOf(d);
    // "3 options from $…" for a good/better/best estimate without a choice yet
    const totalText = documentTotalTextOf(d);
    const signed = Boolean(d.clientSignatureUrl);
    const meta = [form.type, number && number !== title ? number : '', d.clientName, formatDate(form.createdAt)].filter(Boolean).join(' · ');

    return (
        <div className={isAi ? 'ai-doc-card-highlight' : ''}>
            <div
                role="button"
                tabIndex={0}
                onClick={onClick}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
                className="card group flex cursor-pointer items-center gap-3 p-4 transition-shadow hover:shadow-card focus-visible:ring-2 focus-visible:ring-ring"
            >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-2">
                        <h4 className="truncate text-sm font-semibold text-foreground sm:text-base">{title}</h4>
                        {isAi && <SparklesIcon className="h-3.5 w-3.5 shrink-0 text-primary" aria-label="AI drafted" />}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">{meta}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <StatusBadge status={d.status} />
                        {signed && <span className="badge badge-success"><CheckCircleIcon className="h-3 w-3" /> Signed</span>}
                    </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                    {totalText && <span className="hidden text-sm font-semibold tabular-nums text-foreground sm:inline">{totalText}</span>}
                    <div onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
                        <DropdownMenu
                            align="right"
                            portal
                            trigger={
                                <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full p-0" aria-label={`Actions for ${title}`}>
                                    <MoreVerticalIcon className="h-4 w-4 text-muted-foreground" />
                                </Button>
                            }
                        >
                            {onDownload && (
                                <DropdownItem onClick={e => { e.stopPropagation(); onDownload(); }}>
                                    <DownloadIcon className="mr-2 h-4 w-4 text-primary" /> Download PDF
                                </DropdownItem>
                            )}
                            {onShare && (
                                <DropdownItem onClick={e => { e.stopPropagation(); onShare(); }}>
                                    <ShareIcon className="mr-2 h-4 w-4 text-primary" /> Share
                                </DropdownItem>
                            )}
                            <DropdownItem onClick={e => { e.stopPropagation(); onDuplicate(); }}>
                                <CopyIcon className="mr-2 h-4 w-4 text-primary" /> Duplicate
                            </DropdownItem>
                            <DropdownItem onClick={e => { e.stopPropagation(); onDelete(); }} destructive>
                                <TrashIcon className="mr-2 h-4 w-4" /> Delete
                            </DropdownItem>
                        </DropdownMenu>
                    </div>
                </div>
                {totalText && <span className="sr-only">Total {totalText}</span>}
            </div>
        </div>
    );
};

export default DocumentCard;
