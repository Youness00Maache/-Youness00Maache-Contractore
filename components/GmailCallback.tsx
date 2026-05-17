
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SupabaseClient } from '@supabase/supabase-js';
import { Card, CardContent, CardHeader, CardTitle } from './ui/Card.tsx';
import { GoogleIcon } from './Icons.tsx';

interface GmailCallbackProps {
    supabase: SupabaseClient;
}

const GmailCallback: React.FC<GmailCallbackProps> = ({ supabase }) => {
    const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
    const [message, setMessage] = useState('Exchanging authorization code...');
    const navigate = useNavigate();

    // React 18 Strict Mode causes useEffect to fire twice. 
    // We MUST use a ref to prevent exchanging the code twice (which causes an invalid_grant error)
    const hasExchanged = React.useRef(false);

    useEffect(() => {
        const exchangeCode = async () => {
            if (hasExchanged.current) return;
            hasExchanged.current = true;

            const params = new URLSearchParams(window.location.search);
            const code = params.get('code');
            const error = params.get('error');

            if (error) {
                setStatus('error');
                setMessage(`OAuth Error: ${error}`);
                return;
            }

            if (!code) {
                setStatus('error');
                setMessage('No authorization code found in URL.');
                return;
            }

            try {
                // 1. Get the currently logged-in user (Account A)
                const { data: { user }, error: userError } = await supabase.auth.getUser();
                if (userError || !user) {
                    throw new Error('You must be logged in to link a Gmail account.');
                }

                // 2. Call the Supabase Edge Function to exchange code securely
                // This keeps the Client Secret on the server side
                const { data, error: functionError } = await supabase.functions.invoke('gmail-auth', {
                    body: {
                        action: 'exchange',
                        code: code,
                        redirect_uri: `${window.location.origin}/gmail-callback`
                    }
                });

                if (functionError) throw functionError;
                if (data.error) throw new Error(data.error);

                setStatus('success');
                setMessage(`Successfully linked ${data.email || 'Gmail account'}! Redirecting...`);

                // Keep the token in memory/state for immediate use if needed, 
                // but it's now securely stored in user_gmail_accounts table.

                setTimeout(() => {
                    navigate('/communication');
                }, 2000);

            } catch (err: any) {
                console.error('Gmail exchange failed:', err);
                setStatus('error');

                // Try to extract detailed error message from Supabase Function response
                let errorMsg = 'Failed to exchange authorization code.';
                if (err.context && typeof err.context.json === 'function') {
                    try {
                        const body = await err.context.json();
                        errorMsg = body.error || body.message || errorMsg;
                    } catch (parseErr) {
                        errorMsg = err.message || errorMsg;
                    }
                } else {
                    errorMsg = err.message || errorMsg;
                }

                setMessage(errorMsg);
            }
        };

        exchangeCode();
    }, [supabase, navigate]);

    return (
        <div className="flex items-center justify-center min-h-screen bg-background p-4">
            <Card className="w-full max-w-md shadow-xl border-border bg-card">
                <CardHeader className="text-center">
                    <CardTitle className="flex items-center justify-center gap-2">
                        <GoogleIcon className="w-6 h-6" />
                        Gmail Integration
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6 py-6">
                    <div className="flex flex-col items-center gap-4">
                        {status === 'loading' && (
                            <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                        )}
                        {status === 'success' && (
                            <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 text-green-600 rounded-full flex items-center justify-center">
                                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                            </div>
                        )}
                        {status === 'error' && (
                            <div className="w-12 h-12 bg-destructive/10 text-destructive rounded-full flex items-center justify-center">
                                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </div>
                        )}
                        <p className={`text-center font-medium ${status === 'error' ? 'text-destructive' :
                            status === 'success' ? 'text-green-600' :
                                'text-foreground'
                            }`}>
                            {message}
                        </p>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};

export default GmailCallback;
