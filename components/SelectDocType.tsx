



import React from 'react';
import { FormType } from '../types';
// FIX: Added .tsx extension to the import path to resolve the module error.
import { InvoiceIcon, DailyReportIcon, TimeSheetIcon, MaterialLogIcon, EstimateIcon, ExpenseLogIcon, WarrantyIcon, NoteIcon, ReceiptIcon, WorkOrderIcon, BackArrowIcon, ChangeOrderIcon, TruckIcon, PlusIcon } from './Icons.tsx';
import { Button } from './ui/Button.tsx';

interface SelectDocTypeProps {
  onSelect: (type: FormType) => void;
  onBack: () => void;
}

const docTypes = [
  { type: FormType.Invoice, description: 'Bill clients for work', icon: InvoiceIcon },
  { type: FormType.Estimate, description: 'Project quotes', icon: EstimateIcon },
  { type: FormType.PurchaseOrder, description: 'Order materials/supplies', icon: TruckIcon },
  { type: FormType.ChangeOrder, description: 'Manage scope changes', icon: ChangeOrderIcon },
  { type: FormType.Receipt, description: 'Record payments', icon: ReceiptIcon },
  { type: FormType.WorkOrder, description: 'Track service requests', icon: WorkOrderIcon },
  { type: FormType.TimeSheet, description: 'Log hours worked', icon: TimeSheetIcon },
  { type: FormType.MaterialLog, description: 'Track materials', icon: MaterialLogIcon },
  { type: FormType.DailyJobReport, description: 'Daily progress', icon: DailyReportIcon },
  { type: FormType.ExpenseLog, description: 'Track expenses', icon: ExpenseLogIcon },
  { type: FormType.Warranty, description: 'Issue warranties', icon: WarrantyIcon },
  { type: FormType.Note, description: 'Quick notes', icon: NoteIcon },
];

// FIX: Correctly typed DocTypeFeature as a React.FC to allow React-specific props like `key` to be passed without causing a TypeScript error.
interface DocTypeFeatureProps {
  type: FormType;
  description: string;
  icon: React.ElementType;
  index: number;
  onSelect: (type: FormType) => void;
}

const DocTypeFeature: React.FC<DocTypeFeatureProps> = ({
  type,
  description,
  icon: Icon,
  index,
  onSelect,
}) => {
  const borderClasses = [
    "flex flex-col py-10 relative group/feature dark:border-border",
    // In a 4-col grid, add a right border unless it's the last in the row
    "lg:border-r",
    (index + 1) % 4 === 0 && "lg:border-r-0",
    // In a 2-col grid, add a right border if it's the first in the row
    "border-r",
    (index + 1) % 2 === 0 && "border-r-0",
    // Add bottom border for all but the last row
    index < 8 && "border-b",
  ].filter(Boolean).join(" ");

  return (
    <button
      onClick={() => onSelect(type)}
      className={borderClasses}
    >
      {index < 4 && (
        <div className="opacity-0 group-hover/feature:opacity-100 transition duration-200 absolute inset-0 h-full w-full bg-gradient-to-t from-secondary dark:from-secondary to-transparent pointer-events-none" />
      )}
      {index >= 4 && (
        <div className="opacity-0 group-hover/feature:opacity-100 transition duration-200 absolute inset-0 h-full w-full bg-gradient-to-b from-secondary dark:from-secondary to-transparent pointer-events-none" />
      )}
      <div className="mb-4 relative z-10 px-10 text-muted-foreground group-hover/feature:text-primary transition-colors duration-200">
        <Icon className="h-8 w-8" />
      </div>
      <div className="text-lg font-bold mb-2 relative z-10 px-10 text-left">
        <div className="absolute left-0 inset-y-0 h-6 group-hover/feature:h-8 w-1 rounded-tr-full rounded-br-full bg-muted dark:bg-muted group-hover/feature:bg-primary transition-all duration-200 origin-center" />
        <span className="group-hover/feature:translate-x-2 transition duration-200 inline-block text-foreground">
          {type}
        </span>
      </div>
      <p className="text-sm text-muted-foreground max-w-xs relative z-10 px-10 text-left">
        {description}
      </p>
    </button>
  );
};

const SelectDocType: React.FC<SelectDocTypeProps> = ({ onSelect, onBack }) => {
  return (
    <div className="w-full h-full bg-background text-foreground flex flex-col p-4 md:p-8">
       <header className="flex items-center mb-8 gap-4">
        <Button variant="ghost" size="sm" onClick={onBack} className="w-10 h-10 p-0 flex items-center justify-center mr-3 hover:bg-secondary/80 rounded-full" aria-label="Back">
            <BackArrowIcon className="h-6 w-6" />
        </Button>
        <div>
            <h1 className="text-2xl font-bold flex items-center gap-3 tracking-tight">
                Select Document
            </h1>
            <p className="text-muted-foreground text-sm">Choose the type of document you want to create.</p>
        </div>
      </header>
      
      <main className="flex-1 overflow-y-auto pb-10">
        <div className="max-w-7xl mx-auto bg-card rounded-2xl border border-border shadow-sm overflow-hidden animate-fade-in-down">
            <div className="grid grid-cols-2 lg:grid-cols-4 relative z-10">
                {docTypes.map((feature, index) => (
                    <DocTypeFeature
                        key={feature.type}
                        type={feature.type}
                        description={feature.description}
                        icon={feature.icon}
                        index={index}
                        onSelect={onSelect}
                    />
                ))}
            </div>
        </div>
      </main>
    </div>
  );
};

export default SelectDocType;
