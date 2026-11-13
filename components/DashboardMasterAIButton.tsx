import React from 'react';
import { SparklesIcon } from './Icons.tsx';

interface DashboardMasterAIButtonProps {
    onOpen: () => void;
    /** Hide the floating mobile button (e.g. when another FAB is shown). */
    hideMobileFab?: boolean;
    /** Button text on desktop (default "AI Command", as in the original app). */
    label?: string;
}

/**
 * The original ContractorDocs AI trigger: rainbow-bordered "AI Command" pill on desktop and a floating
 * rainbow button on mobile. Opens the AI assistant panel (<AIAssistantPanel>, mounted once by App).
 */
export const DashboardMasterAIButton: React.FC<DashboardMasterAIButtonProps> = ({ onOpen, hideMobileFab, label = 'AI Command' }) => (
    <>
        <button
            type="button"
            id="dashboard-master-ai-btn-desktop"
            onClick={onOpen}
            className="ai-button-premium-wrapper group relative hidden shrink-0 md:inline-flex"
        >
            <span className="ai-button-premium-inner flex items-center gap-2.5 px-4 py-2">
                <SparklesIcon className="h-4 w-4 text-primary" />
                <span className="text-sm font-black uppercase tracking-widest">{label}</span>
            </span>
        </button>
        {!hideMobileFab && (
            <button
                type="button"
                id="dashboard-master-ai-btn-mobile"
                onClick={onOpen}
                aria-label="Open the AI assistant"
                className="ai-button-premium-wrapper fixed bottom-24 right-4 z-[150] shadow-2xl md:hidden"
            >
                <span className="ai-button-premium-inner rounded-full p-4">
                    <SparklesIcon className="h-6 w-6 text-primary" />
                </span>
            </button>
        )}
    </>
);

/** Same look, inline (job page header): rainbow border, "AI Assistant" label. */
export const InlineAIButton: React.FC<{ onClick: () => void; label?: string }> = ({ onClick, label = 'AI Assistant' }) => (
    <button type="button" onClick={onClick} className="ai-button-premium-wrapper group relative inline-flex shrink-0">
        <span className="ai-button-premium-inner flex items-center gap-2 px-3.5 py-1.5">
            <SparklesIcon className="h-4 w-4 text-primary" />
            <span className="text-xs font-black uppercase tracking-widest">{label}</span>
        </span>
    </button>
);

export default DashboardMasterAIButton;
