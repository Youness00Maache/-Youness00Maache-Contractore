
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
            <div className="w-full max-w-3xl bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl overflow-hidden relative animate-in zoom-in-95 duration-200 ring-1 ring-white/10" onClick={(e) => e.stopPropagation()}>

                {/* Close Button */}
                <button onClick={onClose} className="absolute top-4 right-4 p-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors z-20 bg-transparent hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full">
                    <XCircleIcon className="w-6 h-6" />
                </button>

                <div className="p-8 pb-4 text-center">
                    <div className="w-14 h-14 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg rotate-3">
                        <StarIcon className="w-8 h-8 text-white fill-current" />
                    </div>

                    <h2 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-zinc-900 to-zinc-600 dark:from-white dark:to-zinc-400 mb-2">
                        Choose Your Plan
                    </h2>
                    <p className="text-zinc-500 dark:text-zinc-400 text-lg leading-relaxed">
                        Elevate your business with professional tools.
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-8 pt-4">
                    {/* Premium Plan */}
                    <div className="flex flex-col p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/30">
                        <h3 className="text-xl font-bold mb-1 text-zinc-900 dark:text-white">Premium Plan</h3>
                        <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">Professional infrastructure</p>

                        <div className="flex items-baseline gap-1 mb-6">
                            <span className="text-3xl font-bold text-zinc-900 dark:text-white">$5</span>
                            <span className="text-zinc-500 text-sm">/month</span>
                        </div>

                        <div className="flex-1 space-y-3 mb-8">
                            <div className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                                <CheckCircleIcon className="w-4 h-4 text-green-500 shrink-0" />
                                <span>Unlimited Active Jobs</span>
                            </div>
                            <div className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                                <CheckCircleIcon className="w-4 h-4 text-green-500 shrink-0" />
                                <span>Unlimited Documents</span>
                            </div>
                            <div className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                                <CheckCircleIcon className="w-4 h-4 text-green-500 shrink-0" />
                                <span>Unlimited Email Sending</span>
                            </div>
                            <div className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                                <CheckCircleIcon className="w-4 h-4 text-green-500 shrink-0" />
                                <span>Client Portal Access</span>
                            </div>
                        </div>

                        <div id="paypal-button-container-P-65E58669J9805670ENFP23EA" className="w-full relative z-10 min-h-[55px]"></div>
                    </div>

                    {/* AI Plan */}
                    <div className="flex flex-col p-6 rounded-2xl border-2 border-primary bg-primary/5 relative overflow-hidden">
                        <div className="absolute top-0 right-0 flex items-center">
                            <div className="bg-zinc-800 text-white text-[9px] font-bold px-3 py-1.5 rounded-bl-lg uppercase tracking-tighter">
                                Coming Soon
                            </div>
                        </div>

                        <h3 className="text-xl font-bold mb-1 text-zinc-900 dark:text-white">AI Plan</h3>
                        <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">Unlock Premium AI</p>

                        <div className="flex items-baseline gap-1 mb-6">
                            <span className="text-3xl font-bold text-zinc-900 dark:text-white">$10</span>
                            <span className="text-zinc-500 text-sm">/month</span>
                        </div>

                        <div className="flex-1 space-y-3 mb-8">
                            <div className="flex items-center gap-2 text-sm font-bold text-primary">
                                <CheckCircleIcon className="w-4 h-4 shrink-0" />
                                <span>Includes Premium Plan</span>
                            </div>
                            <div className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                                <CheckCircleIcon className="w-4 h-4 text-green-500 shrink-0" />
                                <span>200 AI Generation Credits</span>
                            </div>
                            <div className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                                <CheckCircleIcon className="w-4 h-4 text-green-500 shrink-0" />
                                <span>AI Job Descriptions</span>
                            </div>
                            <div className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                                <CheckCircleIcon className="w-4 h-4 text-green-500 shrink-0" />
                                <span>Smart Note Summaries</span>
                            </div>
                        </div>

                        <button className="w-full py-3 px-4 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-xl font-bold hover:opacity-90 transition-opacity">
                            Get Started with AI
                        </button>
                    </div>
                </div>

                <div className="px-8 pb-8 text-center">
                    <button onClick={onClose} className="text-sm text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors">
                        Maybe Later
                    </button>
                </div>
            </div>
        </div>
    );
};

export default UpgradeModal;
