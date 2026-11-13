import React from 'react';
import { AppLogo, MailIcon, AlertTriangleIcon, WifiOffIcon } from './Icons.tsx';

/** Full-screen centered card used for auth messages (check email, expired link). */
export const AuthMessage: React.FC<{
    title: string;
    body: React.ReactNode;
    icon?: 'mail' | 'warning';
    actionLabel: string;
    onAction: () => void;
    secondary?: { label: string; onClick: () => void };
}> = ({ title, body, icon = 'mail', actionLabel, onAction, secondary }) => {
    const Icon = icon === 'mail' ? MailIcon : AlertTriangleIcon;
    return (
        <div className="flex min-h-screen items-center justify-center bg-background p-4">
            <div className="card card-pad w-full max-w-md text-center animate-fade-in-up">
                <AppLogo className="mx-auto mb-6 h-10 w-10 rounded-lg" />
                <div className={`mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl ${icon === 'mail' ? 'bg-primary/10 text-primary' : 'bg-warning/15 text-warning'}`}>
                    <Icon className="h-6 w-6" />
                </div>
                <h1 className="text-xl font-bold">{title}</h1>
                <div className="mt-2 text-sm text-muted-foreground">{body}</div>
                <button type="button" className="btn btn-primary mt-6 w-full" onClick={onAction}>{actionLabel}</button>
                {secondary && (
                    <button type="button" className="btn btn-ghost mt-2 w-full" onClick={secondary.onClick}>{secondary.label}</button>
                )}
            </div>
        </div>
    );
};

/** First paint while the session is being restored. */
export const AppSplash: React.FC<{ label?: string }> = ({ label = 'Loading ContractorDocs' }) => (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background" role="status" aria-live="polite">
        <AppLogo className="h-12 w-12 animate-pulse-slow rounded-xl" />
        <span className="h-1 w-24 overflow-hidden rounded-full bg-muted">
            <span className="block h-full w-1/2 animate-shimmer rounded-full bg-primary/60" />
        </span>
        <span className="sr-only">{label}...</span>
    </div>
);

/** Shown when the account data could not be loaded (instead of a blank page or a permanent loader). */
export const LoadErrorScreen: React.FC<{ message: string; offline?: boolean; onRetry: () => void; onLogout: () => void }> = ({ message, offline, onRetry, onLogout }) => (
    <div className="flex min-h-[80vh] items-center justify-center p-4">
        <div className="card card-pad w-full max-w-md text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
                {offline ? <WifiOffIcon className="h-6 w-6" /> : <AlertTriangleIcon className="h-6 w-6" />}
            </div>
            <h1 className="text-lg font-bold">{offline ? "You're offline" : "We couldn't load your account"}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{message}</p>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
                <button type="button" className="btn btn-primary" onClick={onRetry}>Try again</button>
                <button type="button" className="btn btn-outline" onClick={onLogout}>Log out</button>
            </div>
        </div>
    </div>
);
