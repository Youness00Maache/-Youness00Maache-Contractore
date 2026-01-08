import React from 'react';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { DropdownMenu, DropdownItem } from './ui/DropdownMenu';
import { MoreVerticalIcon, TrashIcon, InvoiceIcon, EstimateIcon, ChangeOrderIcon, TruckIcon } from './Icons';
import { FormType, FormData as FormDataType } from '../types';

interface DocumentCardProps {
    form: FormDataType;
    onClick: () => void;
    onDelete: () => void;
}

const getDocTitle = (form: FormDataType) => {
    const d = form.data as any;
    return d.title || d.invoiceNumber || d.estimateNumber || d.reportNumber || d.workOrderNumber || d.warrantyNumber || d.changeOrderNumber || d.poNumber || form.type;
};

const getDocIcon = (type: FormType) => {
    switch (type) {
        case FormType.Invoice: return InvoiceIcon;
        case FormType.Estimate: return EstimateIcon;
        case FormType.ChangeOrder: return ChangeOrderIcon;
        case FormType.PurchaseOrder: return TruckIcon;
        default: return InvoiceIcon;
    }
};

const getStatusBadge = (form: FormDataType) => {
    const status = (form.data as any).status;
    return status ? (
        <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-secondary/80 text-secondary-foreground border border-border/50">
            {status}
        </span>
    ) : null;
};

export const DocumentCard: React.FC<DocumentCardProps> = ({ form, onClick, onDelete }) => {
    return (
        <Card className="hover:shadow-md transition-all duration-200 group relative bg-card border-border overflow-visible">
            <div onClick={onClick} className="p-4 flex items-center justify-between gap-4 cursor-pointer">
                <div className="flex items-center gap-4 min-w-0 flex-grow">
                    <div className="bg-primary/5 text-primary p-3 rounded-xl shrink-0">
                        {React.createElement(getDocIcon(form.type), { className: "w-6 h-6" })}
                    </div>
                    <div className="flex flex-col gap-1 min-w-0">
                        <h4 className="font-semibold text-foreground truncate text-base leading-tight">
                            {getDocTitle(form)}
                        </h4>
                        <p className="text-xs text-muted-foreground font-medium">
                            {form.type} • {new Date(form.createdAt).toLocaleDateString()}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                    {getStatusBadge(form)}
                    <div onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu
                            align="right"
                            trigger={
                                <Button variant="ghost" size="icon" className="h-8 w-8 p-0 rounded-full hover:bg-secondary">
                                    <MoreVerticalIcon className="h-4 w-4 text-muted-foreground" />
                                </Button>
                            }
                        >
                            <DropdownItem onClick={(e) => { e.stopPropagation(); onDelete(); }} destructive>
                                <TrashIcon className="w-4 h-4 mr-2" />
                                Delete
                            </DropdownItem>
                        </DropdownMenu>
                    </div>
                </div>
            </div>
        </Card>
    );
};
