import React from 'react';
import { XCircleIcon } from './Icons';
import { Button } from './ui/Button';

interface ConfirmationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: React.ReactNode;
    confirmLabel?: string;
    cancelLabel?: string;
    isDestructive?: boolean;
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    confirmLabel = "Confirm",
    cancelLabel = "Cancel",
    isDestructive = false,
}) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div
                className="w-full max-w-md bg-white dark:bg-card border border-white/20 dark:border-border rounded-2xl shadow-2xl p-6 relative animate-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors p-1"
                >
                    <XCircleIcon className="w-6 h-6" />
                </button>

                <div className="mb-6">
                    <h2 className="text-xl font-bold text-foreground mb-2 pr-8">
                        {title}
                    </h2>
                    <div className="text-muted-foreground text-sm leading-relaxed">
                        {message}
                    </div>
                </div>

                <div className="flex items-center justify-end gap-3">
                    <Button
                        variant="ghost"
                        onClick={onClose}
                        className="font-medium"
                    >
                        {cancelLabel}
                    </Button>
                    <Button
                        variant={isDestructive ? "destructive" : "default"}
                        onClick={() => {
                            onConfirm();
                            onClose();
                        }}
                        className={isDestructive ? "bg-red-600 hover:bg-red-700 text-white shadow-md shadow-red-500/20" : "shadow-md"}
                    >
                        {confirmLabel}
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default ConfirmationModal;
