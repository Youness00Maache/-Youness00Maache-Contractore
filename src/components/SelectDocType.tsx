
import React, { useState } from 'react';
import { FormType, UserProfile } from '../types';
import { InvoiceIcon, DailyReportIcon, TimeSheetIcon, MaterialLogIcon, EstimateIcon, ExpenseLogIcon, WarrantyIcon, NoteIcon, ReceiptIcon, WorkOrderIcon, BackArrowIcon, ChangeOrderIcon, TruckIcon, PlusIcon, StarIcon } from './Icons.tsx';
import { Button } from './ui/Button.tsx';
import UpgradeModal from './UpgradeModal.tsx';

interface SelectDocTypeProps {
  onSelect: (type: FormType) => void;
  onBack: () => void;
  profile?: UserProfile;
  docCount?: number;
}

// Define which docs are PRO (Empty now as requested)
const proDocs: FormType[] = [];

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

interface DocTypeFeatureProps {
  type: FormType;
  description: string;
  icon: React.ElementType;
  index: number;
  onSelect: (type: FormType) => void;
  isPro: boolean;
  isLocked: boolean;
}

const DocTypeFeature: React.FC<DocTypeFeatureProps> = ({
  type,
  description,
  icon: Icon,
  index,
  onSelect,
  isPro,
  isLocked
}) => {
  const borderClasses = [
    "flex flex-col py-10 relative group/feature border-blue-200 dark:border-border",
    "lg:border-r",
    (index + 1) % 4 === 0 && "lg:border-r-0",
    "border-r",
    (index + 1) % 2 === 0 && "border-r-0",
    index < 8 && "border-b",
  ].filter(Boolean).join(" ");

  return (
    <button
      onClick={() => onSelect(type)}
      className={`${borderClasses} ${isLocked ? 'opacity-90' : ''}`}
    >
      {index < 4 && (
        <div className="opacity-0 group-hover/feature:opacity-100 transition duration-200 absolute inset-0 h-full w-full bg-gradient-to-t from-white/40 dark:from-secondary to-transparent pointer-events-none" />
      )}
      {index >= 4 && (
        <div className="opacity-0 group-hover/feature:opacity-100 transition duration-200 absolute inset-0 h-full w-full bg-gradient-to-b from-white/40 dark:from-secondary to-transparent pointer-events-none" />
      )}

      {/* Pro Badge */}
      {isPro && (
        <div className="absolute top-4 right-4 flex items-center gap-1 bg-gradient-to-r from-amber-400 to-amber-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm z-20">
          <StarIcon className="w-3 h-3 fill-current" /> PRO
        </div>
      )}

      <div className="mb-4 relative z-10 px-10 text-blue-400 dark:text-muted-foreground group-hover/feature:text-blue-600 dark:group-hover/feature:text-primary transition-colors duration-200">
        <Icon className="h-8 w-8" />
      </div>
      <div className="text-lg font-bold mb-2 relative z-10 px-10 text-left">
        <div className="absolute left-0 inset-y-0 h-6 group-hover/feature:h-8 w-1 rounded-tr-full rounded-br-full bg-blue-200 dark:bg-muted group-hover/feature:bg-blue-500 dark:group-hover/feature:bg-primary transition-all duration-200 origin-center" />
        <span className="group-hover/feature:translate-x-2 transition duration-200 inline-block text-blue-900 dark:text-foreground">
          {type}
        </span>
      </div>
      <p className="text-sm text-blue-700/70 dark:text-muted-foreground max-w-xs relative z-10 px-10 text-left">
        {description}
      </p>
    </button>
  );
};

const SelectDocType: React.FC<SelectDocTypeProps> = ({ onSelect, onBack, profile, docCount = 0 }) => {
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [selectedFeatureName, setSelectedFeatureName] = useState('');

  const isUserPro = profile?.subscriptionTier === 'Premium';
  const limit = isUserPro ? Infinity : 20;

  const handleSelect = (type: FormType) => {
    const isProDoc = proDocs.includes(type);
    if (isProDoc && !isUserPro) {
      setSelectedFeatureName(type);
      setShowUpgrade(true);
    } else {
      onSelect(type);
    }
  };

  return (
    <div className="w-full h-full bg-background text-foreground flex flex-col p-4 md:p-8">
      <header className="flex items-center mb-8 gap-4">
        <Button variant="ghost" size="sm" onClick={onBack} className="w-10 h-10 p-0 flex items-center justify-center mr-3 hover:bg-secondary/80 rounded-full" aria-label="Back">
          <BackArrowIcon className="h-6 w-6" />
        </Button>
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">
              Select Document
            </h1>
          </div>
          <p className="text-muted-foreground text-sm">Choose the type of document you want to create.</p>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto pb-10">
        <div className="max-w-7xl mx-auto bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-card dark:to-card rounded-2xl border border-blue-200 dark:border-border shadow-sm overflow-hidden animate-fade-in-down">
          <div className="grid grid-cols-2 lg:grid-cols-4 relative z-10">
            {docTypes.map((feature, index) => {
              const isProDoc = proDocs.includes(feature.type);
              return (
                <DocTypeFeature
                  key={feature.type}
                  type={feature.type}
                  description={feature.description}
                  icon={feature.icon}
                  index={index}
                  onSelect={handleSelect}
                  isPro={isProDoc}
                  isLocked={isProDoc && !isUserPro}
                />
              );
            })}
          </div>
        </div>
      </main>

      <UpgradeModal
        isOpen={showUpgrade}
        onClose={() => setShowUpgrade(false)}
        featureName={selectedFeatureName}
      />
    </div>
  );
};

export default SelectDocType;
