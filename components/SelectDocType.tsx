import React from 'react';
import { FormType, UserProfile } from '../types';
import { InvoiceIcon, DailyReportIcon, TimeSheetIcon, MaterialLogIcon, EstimateIcon, ExpenseLogIcon, WarrantyIcon, NoteIcon, ReceiptIcon, WorkOrderIcon, ChangeOrderIcon, TruckIcon, ChevronRightIcon, FileTextIcon } from './Icons.tsx';
import { PageHeader } from './ui/PageHeader.tsx';

interface SelectDocTypeProps {
  onSelect: (type: FormType) => void;
  onBack: () => void;
  profile?: UserProfile;
  /** Legacy, unused. */
  docCount?: number;
  /** Shown in the subtitle. */
  jobName?: string;
  /** Offline: only these types can be saved (the others are shown greyed out with the reason). Unset = all. */
  offlineTypes?: readonly FormType[];
}

export interface DocTypeMeta {
  type: FormType;
  description: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  /** tailwind classes for the icon tile */
  tone: string;
  group: 'Money' | 'Field' | 'Records';
}

export const DOC_TYPE_META: DocTypeMeta[] = [
  { type: FormType.Invoice, description: 'Bill your client for work done', icon: InvoiceIcon, tone: 'bg-primary/10 text-primary', group: 'Money' },
  { type: FormType.Estimate, description: 'Quote a project before it starts', icon: EstimateIcon, tone: 'bg-violet-500/10 text-violet-600 dark:text-violet-400', group: 'Money' },
  { type: FormType.ChangeOrder, description: 'Approve scope or price changes', icon: ChangeOrderIcon, tone: 'bg-amber-500/10 text-amber-600 dark:text-amber-400', group: 'Money' },
  { type: FormType.PurchaseOrder, description: 'Order materials from suppliers', icon: TruckIcon, tone: 'bg-sky-500/10 text-sky-600 dark:text-sky-400', group: 'Money' },
  { type: FormType.Receipt, description: 'Confirm a payment you received', icon: ReceiptIcon, tone: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400', group: 'Money' },
  { type: FormType.WorkOrder, description: 'Assign and track a task', icon: WorkOrderIcon, tone: 'bg-orange-500/10 text-orange-600 dark:text-orange-400', group: 'Field' },
  { type: FormType.DailyJobReport, description: 'Log progress, weather and crew', icon: DailyReportIcon, tone: 'bg-teal-500/10 text-teal-600 dark:text-teal-400', group: 'Field' },
  { type: FormType.TimeSheet, description: 'Record hours worked', icon: TimeSheetIcon, tone: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400', group: 'Field' },
  { type: FormType.MaterialLog, description: 'Track materials used on site', icon: MaterialLogIcon, tone: 'bg-lime-500/10 text-lime-700 dark:text-lime-400', group: 'Field' },
  { type: FormType.ExpenseLog, description: 'Keep job expenses and receipts', icon: ExpenseLogIcon, tone: 'bg-rose-500/10 text-rose-600 dark:text-rose-400', group: 'Records' },
  { type: FormType.Warranty, description: 'Issue a warranty to your client', icon: WarrantyIcon, tone: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400', group: 'Records' },
  { type: FormType.Note, description: 'Write a quick note for the file', icon: NoteIcon, tone: 'bg-slate-500/10 text-slate-600 dark:text-slate-300', group: 'Records' },
];

export const getDocTypeMeta = (type: FormType | string): DocTypeMeta =>
  DOC_TYPE_META.find(m => m.type === type) || { type: type as FormType, description: '', icon: FileTextIcon, tone: 'bg-muted text-muted-foreground', group: 'Records' };

const GROUP_LABELS: Record<DocTypeMeta['group'], string> = {
  Money: 'Billing & purchasing',
  Field: 'On the job',
  Records: 'Records',
};

const SelectDocType: React.FC<SelectDocTypeProps> = ({ onSelect, onBack, jobName, offlineTypes }) => {
  const groups: DocTypeMeta['group'][] = ['Money', 'Field', 'Records'];
  return (
    <div className="page max-w-5xl">
      <PageHeader
        title="New document"
        subtitle={jobName ? <>For <span className="font-medium text-foreground">{jobName}</span></> : 'Choose the type of document to create.'}
        onBack={onBack}
      />

      {offlineTypes && (
        <p className="mb-6 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-foreground" role="status">
          You're offline. These documents save on this device and sync when you reconnect; the greyed-out ones need a connection.
        </p>
      )}

      <div className="space-y-8">
        {groups.map(group => (
          <section key={group} aria-labelledby={`doc-group-${group}`}>
            <h2 id={`doc-group-${group}`} className="label mb-3">{GROUP_LABELS[group]}</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {DOC_TYPE_META.filter(m => m.group === group).map(({ type, description, icon: Icon, tone }) => {
                const unavailable = Boolean(offlineTypes && !offlineTypes.includes(type));
                return (
                <button
                  key={type}
                  type="button"
                  onClick={() => onSelect(type)}
                  disabled={unavailable}
                  title={unavailable ? 'Needs a connection' : undefined}
                  className="card group flex min-h-[72px] items-center gap-4 p-4 text-left transition-all duration-150 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-card disabled:pointer-events-none disabled:opacity-50"
                >
                  <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tone}`}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-foreground">{type}</span>
                    <span className="block truncate text-sm text-muted-foreground">{unavailable ? 'Needs a connection' : description}</span>
                  </span>
                  <ChevronRightIcon className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
};

export default SelectDocType;
