import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { SupabaseClient } from '@supabase/supabase-js';
import { CheckCircleIcon, GoogleIcon, XCircleIcon, AlertTriangleIcon } from './Icons.tsx';
import { Spinner } from './commsKit.tsx';
import { consumeStoredReturnTo, exchangeGmailCode, GmailError, startGmailConnect } from '../services/gmailService.ts';

interface GmailCallbackProps {
    /** Legacy prop, unused (the shared client from lib/supabase.ts is used). */
    supabase?: SupabaseClient;
}

type Status = 'loading' | 'success' | 'cancelled' | 'error';

const safePath = (p: string | null | undefined) =>
    p && p.startsWith('/') && !p.startsWith('//') && !p.startsWith('/gmail-callback') ? p : '/communication';

const describeReturn = (path: string) => {
    if (path.startsWith('/communication')) return 'Communication';
    if (path.startsWith('/settings')) return 'Settings';
    if (path.startsWith('/dashboard') || path === '/') return 'Dashboard';
    return 'the app';
};

const GmailCallback: React.FC<GmailCallbackProps> = () => {
    const navigate = useNavigate();
    const [status, setStatus] = useState<Status>('loading');
    const [title, setTitle] = useState('Connecting your Gmail…');
    const [message, setMessage] = useState('This takes a few seconds.');
    const [canRetry, setCanRetry] = useState(false);
    const [retrying, setRetrying] = useState(false);
    const [returnTo, setReturnTo] = useState('/communication');
    // React StrictMode runs effects twice; an authorization code can only be exchanged once.
    const started = useRef(false);

    useEffect(() => {
        if (started.current) return;
        started.current = true;

        const params = new URLSearchParams(window.location.search);
        const code = params.get('code');
        const state = params.get('state');
        const oauthError = params.get('error');
        const back = safePath(consumeStoredReturnTo());
        setReturnTo(back);
        // Remove the one-time code from the address bar and history right away (COMM-038).
        window.history.replaceState({}, document.title, '/gmail-callback');

        if (oauthError) {
            if (oauthError === 'access_denied') {
                setStatus('cancelled');
                setTitle('Connection cancelled');
                setMessage('You cancelled the Google screen, so nothing was changed. You can connect Gmail any time.');
            } else {
                setStatus('error');
                setTitle('Google could not connect');
                setMessage('Google returned an error. Please try again.');
            }
            setCanRetry(true);
            return;
        }
        if (!code || !state) {
            setStatus('error');
            setTitle('Nothing to connect');
            setMessage('This page opens automatically after you approve Gmail access. Start again from Communication.');
            setCanRetry(true);
            return;
        }

        (async () => {
            try {
                const res = await exchangeGmailCode(code, state);
                const destination = safePath(res.return_to || back);
                setReturnTo(destination);
                setStatus('success');
                setTitle('Gmail connected');
                setMessage(`Emails will be sent from ${res.email}. Taking you back to ${describeReturn(destination)}…`);
                window.setTimeout(() => navigate(destination, { replace: true }), 1600);
            } catch (e) {
                const code = e instanceof GmailError ? e.code : '';
                setStatus('error');
                setTitle(code === 'SCOPE_MISSING' ? 'Permission needed' : 'Could not connect Gmail');
                setMessage((e as Error)?.message || 'Something went wrong. Please try again.');
                setCanRetry(!['NOT_CONFIGURED', 'REDIRECT_MISMATCH', 'UNAUTHORIZED'].includes(code));
            }
        })();
    }, [navigate]);

    const retry = async () => {
        setRetrying(true);
        try {
            await startGmailConnect({ returnTo });
        } catch (e) {
            setRetrying(false);
            setStatus('error');
            setMessage((e as Error)?.message || 'Could not start the Google connection.');
        }
    };

    return (
        <div className="flex min-h-[100dvh] items-center justify-center bg-background p-4">
            <div className="card w-full max-w-md p-6 text-center sm:p-8 animate-fade-in-up" role="status" aria-live="polite">
                <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                    {status === 'loading' && <GoogleIcon className="h-7 w-7" />}
                    {status === 'success' && <CheckCircleIcon className="h-8 w-8 text-success" />}
                    {status === 'cancelled' && <AlertTriangleIcon className="h-7 w-7 text-warning" />}
                    {status === 'error' && <XCircleIcon className="h-8 w-8 text-destructive" />}
                </div>
                <h1 className="text-xl font-bold text-foreground">{title}</h1>
                <p className="mt-2 text-sm text-muted-foreground">{message}</p>

                {status === 'loading' && (
                    <div className="mt-6 flex justify-center text-primary"><Spinner label="Linking account" /></div>
                )}

                {status !== 'loading' && (
                    <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-center">
                        <button type="button" className="btn btn-outline min-h-[44px]" onClick={() => navigate(returnTo, { replace: true })}>
                            Back to {describeReturn(returnTo)}
                        </button>
                        {status !== 'success' && canRetry && (
                            <button type="button" className="btn btn-primary min-h-[44px]" onClick={retry} disabled={retrying}>
                                {retrying ? <Spinner label="Opening Google…" /> : <><GoogleIcon className="h-4 w-4" /> Try again</>}
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default GmailCallback;
