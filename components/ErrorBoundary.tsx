import React from 'react';
import { AlertTriangleIcon } from './Icons.tsx';

interface ErrorBoundaryProps {
    children: React.ReactNode;
    /** Changing this value clears the error (e.g. pass the current route so navigating away recovers). */
    resetKey?: string;
    /** Compact inline fallback (inside a page) instead of a full-screen one. */
    inline?: boolean;
    onHome?: () => void;
}

interface ErrorBoundaryState {
    error: Error | null;
}

/** Catches render errors so one broken screen never white-screens the whole app (CORE-023). */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
    state: ErrorBoundaryState = { error: null };

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { error };
    }

    componentDidCatch(error: Error, info: React.ErrorInfo) {
        // Keep one line in the console for debugging/monitoring; no user data.
        console.error('[ContractorDocs] Screen crashed:', error?.message, info?.componentStack?.split('\n').slice(0, 3).join(' '));
    }

    componentDidUpdate(prevProps: ErrorBoundaryProps) {
        if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
            this.setState({ error: null });
        }
    }

    private isChunkError() {
        const msg = this.state.error?.message || '';
        return /Loading chunk|dynamically imported module|Failed to fetch dynamically|Importing a module script failed/i.test(msg);
    }

    render() {
        if (!this.state.error) return this.props.children;

        const chunk = this.isChunkError();
        const title = chunk ? 'A new version is available' : 'Something went wrong';
        const body = chunk
            ? 'ContractorDocs was updated while this page was open. Reload to continue.'
            : 'This screen hit an unexpected error. Your saved data is safe. Try again, or go back to the dashboard.';

        return (
            <div className={this.props.inline ? 'page' : 'flex min-h-[70vh] items-center justify-center p-4'}>
                <div className="card card-pad mx-auto max-w-md text-center">
                    <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
                        <AlertTriangleIcon className="h-6 w-6" />
                    </div>
                    <h2 className="text-lg font-bold text-foreground">{title}</h2>
                    <p className="mt-2 text-sm text-muted-foreground">{body}</p>
                    <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-center">
                        {this.props.onHome && !chunk && (
                            <button
                                type="button"
                                className="btn btn-outline"
                                onClick={() => { this.setState({ error: null }); this.props.onHome?.(); }}
                            >
                                Go to dashboard
                            </button>
                        )}
                        <button
                            type="button"
                            className="btn btn-primary"
                            onClick={() => (chunk ? window.location.reload() : this.setState({ error: null }))}
                        >
                            {chunk ? 'Reload' : 'Try again'}
                        </button>
                    </div>
                </div>
            </div>
        );
    }
}

export default ErrorBoundary;
