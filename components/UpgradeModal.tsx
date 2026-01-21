
import React from 'react';
import { StarIcon, CheckCircleIcon, XCircleIcon } from './Icons.tsx';

interface UpgradeModalProps {
    isOpen: boolean;
    onClose: () => void;
    featureName: string;
    onUpgrade?: () => void;
    userId?: string;
}

const UpgradeModal: React.FC<UpgradeModalProps> = ({ isOpen, onClose, featureName, onUpgrade, userId }) => {
    React.useEffect(() => {
        if (isOpen && (window as any).paypal) {
            const containerId = 'paypal-button-container-P-65E58669J9805670ENFP23EA';
            const container = document.getElementById(containerId);
            if (container) {
                container.innerHTML = '';
                (window as any).paypal.Buttons({
                    style: { shape: 'rect', color: 'black', layout: 'vertical', label: 'subscribe' },
                    createSubscription: function (data: any, actions: any) {
                        return actions.subscription.create({
                            plan_id: 'P-65E58669J9805670ENFP23EA',
                            custom_id: userId // Pass User ID for Webhook tracking
                        });
                    },
                    onApprove: function (data: any, actions: any) {
                        if (onUpgrade) onUpgrade();
                        onClose();
                    }
                }).render('#' + containerId);
            }
        }
    }, [isOpen]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-[2px] flex items-center justify-center z-[100] p-4 animate-in fade-in duration-200">
            <div className="w-full max-w-lg bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl overflow-hidden relative animate-in zoom-in-95 duration-200 ring-1 ring-white/10" onClick={(e) => e.stopPropagation()}>

                {/* Close Button */}
                <button onClick={onClose} className="absolute top-4 right-4 p-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors z-20 bg-transparent hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full">
                    <XCircleIcon className="w-6 h-6" />
                </button>

                <div className="p-8 pb-4 text-center">
                    <div className="w-14 h-14 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg rotate-3">
                        <StarIcon className="w-8 h-8 text-white fill-current" />
                    </div>

                    <h2 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-zinc-900 to-zinc-600 dark:from-white dark:to-zinc-400 mb-2">
                        Unlock Premium
                    </h2>
                    <p className="text-zinc-500 dark:text-zinc-400 text-lg leading-relaxed">
                        <span className="font-semibold text-zinc-900 dark:text-white">{featureName}</span> requires a Pro plan.
                    </p>
                </div>

                <div className="px-8 py-2">
                    <div className="p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl border border-zinc-100 dark:border-zinc-800 space-y-3">
                        <div className="flex items-center gap-3">
                            <CheckCircleIcon className="w-5 h-5 text-green-500 shrink-0" />
                            <span className="text-zinc-700 dark:text-zinc-300">Unlimited Active Jobs</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <CheckCircleIcon className="w-5 h-5 text-green-500 shrink-0" />
                            <span className="text-zinc-700 dark:text-zinc-300">Unlimited Documents</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <CheckCircleIcon className="w-5 h-5 text-green-500 shrink-0" />
                            <span className="text-zinc-700 dark:text-zinc-300">Unlimited Email Sending</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <CheckCircleIcon className="w-5 h-5 text-green-500 shrink-0" />
                            <span className="text-zinc-700 dark:text-zinc-300">Client Portal Access</span>
                        </div>
                    </div>
                </div>

                <div className="p-8 pt-4">
                    <div className="flex items-baseline justify-center gap-1 mb-6">
                        <span className="text-4xl font-bold text-zinc-900 dark:text-white">$5</span>
                        <span className="text-zinc-500">/month</span>
                    </div>

                    <div id="paypal-button-container-P-65E58669J9805670ENFP23EA" className="w-full relative z-10 min-h-[55px]"></div>

                    <button onClick={onClose} className="w-full mt-4 py-2 text-sm text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors">
                        Maybe Later
                    </button>
                </div>
            </div>
        </div>
    );
};

export default UpgradeModal;
