import React from 'react';
import { SparklesIcon } from './Icons.tsx';

interface DashboardMasterAIButtonProps {
    onOpen: () => void;
    /** Hide the floating mobile button (e.g. when another FAB is shown). */
    hideMobileFab?: boolean;
}

/**
 * Opens the AI assistant from the dashboard header (desktop) or a floating button (mobile).
 * The panel itself is <AIAssistantPanel> mounted once by App.
 */
export const DashboardMasterAIButton: React.FC<DashboardMasterAIButtonProps> = ({ onOpen, hideMobileFab }) => (
    <>
        <button
            type="button"
            id="dashboard-master-ai-btn-desktop"
            onClick={onOpen}
            className="hidden h-9 shrink-0 items-center gap-2 rounded-full bg-gradient-to-r from-brand-600 to-brand-500 px-4 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 active:scale-[.98] md:inline-flex"
        >
            <SparklesIcon className="h-4 w-4" />
            Ask AI
        </button>
        {!hideMobileFab && (
            <button
                type="button"
                id="dashboard-master-ai-btn-mobile"
                onClick={onOpen}
                aria-label="Open the AI assistant"
                className="fixed bottom-24 right-4 z-[150] inline-flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-lift transition active:scale-95 md:hidden"
            >
                <SparklesIcon className="h-6 w-6" />
            </button>
        )}
    </>
);

export default DashboardMasterAIButton;
