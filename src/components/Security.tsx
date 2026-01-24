import React from 'react';
import { Button } from './ui/Button.tsx';
import { BackArrowIcon } from './Icons.tsx';

interface Props {
    onBack: () => void;
}

const Security: React.FC<Props> = ({ onBack }) => {
    return (
        <div className="min-h-screen w-full bg-slate-50 text-slate-900 font-sans">
            <header className="fixed top-0 left-0 right-0 z-50 transition-all duration-300 bg-white/80 backdrop-blur-lg shadow-sm py-3">
                <div className="max-w-7xl mx-auto px-6 lg:px-8">
                    <Button variant="ghost" onClick={onBack} className="flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-primary">
                        <BackArrowIcon className="w-4 h-4" /> Back to Home
                    </Button>
                </div>
            </header>

            <main>
                <section className="relative pt-32 pb-16 text-center overflow-hidden">
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full max-w-7xl pointer-events-none">
                        <div className="absolute top-20 left-10 w-72 h-72 bg-blue-400/20 rounded-full blur-[100px] mix-blend-multiply animate-pulse"></div>
                        <div className="absolute top-40 right-10 w-72 h-72 bg-purple-400/20 rounded-full blur-[100px] mix-blend-multiply animate-pulse" style={{ animationDelay: '1s' }}></div>
                    </div>
                    
                    <h1 className="text-5xl lg:text-7xl font-bold tracking-tight text-slate-900 mb-4 leading-[1.1]">
                        Platform <br className="hidden lg:block" />
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-violet-600">Security</span>
                    </h1>
                     <p className="text-slate-500">How we protect your data.</p>
                </section>
                
                <section className="pb-24">
                    <div className="max-w-3xl mx-auto px-6 space-y-8">
                        <div className="text-slate-600 leading-relaxed space-y-4">
                            <h2 className="text-2xl font-bold text-slate-800 mt-8 mb-4 border-b pb-2">Data Encryption</h2>
                            <p>All data transmitted between your device and our servers is encrypted in transit using industry-standard TLS 1.2+. All data at rest, including your documents, client information, and uploaded files, is encrypted using AES-256.</p>
                        
                            <h2 className="text-2xl font-bold text-slate-800 mt-8 mb-4 border-b pb-2">Access Control</h2>
                            <p>Your account is protected by your choice of a secure password or Google OAuth 2.0. We do not store your passwords directly. Our database is built on Supabase and utilizes PostgreSQL's Row Level Security (RLS) to ensure that you, and only you, can access your own data.</p>
                            
                            <h2 className="text-2xl font-bold text-slate-800 mt-8 mb-4 border-b pb-2">API Security</h2>
                            <p>We follow the principle of least privilege. When connecting to Google for the Gmail integration, we only request the <code>gmail.send</code> scope. This allows the application to send emails on your behalf and does not grant us permission to read or manage your inbox.</p>
                        </div>
                    </div>
                </section>
            </main>

            <footer className="bg-white border-t border-slate-200 py-8">
                <div className="max-w-7xl mx-auto px-6 lg:px-8 text-center text-xs text-slate-500">
                    <p>© 2024 ContractorDocs. All rights reserved.</p>
                </div>
            </footer>
        </div>
    );
};

export default Security;
