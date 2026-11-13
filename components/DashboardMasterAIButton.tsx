import React from 'react';
import { createPortal } from 'react-dom';
import { SparklesIcon } from './Icons.tsx';
import { useHeaderSlot } from './AppNav.tsx';

interface DashboardMasterAIButtonProps {
    onOpen: () => void;
    /** Hide the mobile button (e.g. when another FAB is shown). */
    hideMobileFab?: boolean;
    /** Button text on desktop (default "AI Command", as in the original app). */
    label?: string;
}

/**
 * The original ContractorDocs AI trigger: rainbow-bordered "AI Command" pill on desktop. On phones the same rainbow
 * button sits in the app bar (next to the avatar), so it never floats over the page's controls; a floating button
 * above the tab bar is the fallback when the app bar isn't shown. Opens the AI assistant panel (<AIAssistantPanel>).
 */
export const DashboardMasterAIButton: React.FC<DashboardMasterAIButtonProps> = ({ onOpen, hideMobileFab, label = 'AI Command' }) => {
    const headerActions = useHeaderSlot('actions');
    const mobile = hideMobileFab ? null : headerActions ? createPortal(
        <button
            type="button"
            id="dashboard-master-ai-btn-mobile"
            onClick={onOpen}
            aria-label="Open the AI assistant"
            title="AI assistant"
            className="ai-button-premium-wrapper shrink-0 md:hidden"
        >
            <span className="ai-button-premium-inner h-[34px] gap-1.5 !px-3 !py-0">
                <SparklesIcon className="h-4 w-4 text-primary" />
                <span className="text-xs font-black uppercase tracking-widest">AI</span>
            </span>
        </button>,
        headerActions,
    ) : (
        <button
            type="button"
            id="dashboard-master-ai-btn-mobile"
            onClick={onOpen}
            aria-label="Open the AI assistant"
            className="ai-button-premium-wrapper fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-4 z-[45] shadow-lift md:hidden"
        >
            <span className="ai-button-premium-inner rounded-full p-3.5">
                <SparklesIcon className="h-5 w-5 text-primary" />
            </span>
        </button>
    );
    return (
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
            {mobile}
        </>
    );
};

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
