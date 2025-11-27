import React from 'react';
import { Button } from './ui/Button.tsx';
import { BackArrowIcon } from './Icons.tsx';

interface Props {
    onBack: () => void;
}

const TermsOfService: React.FC<Props> = ({ onBack }) => {
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
                        Terms of <br className="hidden lg:block" />
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-violet-600">Service</span>
                    </h1>
                    <p className="text-slate-500">Last Updated: {new Date().toLocaleDateString()}</p>
                </section>
                
                <section className="pb-24">
                    <div className="max-w-3xl mx-auto px-6 space-y-8">
                        <div className="text-slate-600 leading-relaxed space-y-4">
                            <p>Please read these Terms of Service carefully before using the ContractorDocs application (the "Service"). Your access to and use of the Service is conditioned on your acceptance of and compliance with these Terms.</p>
                        
                            <h2 className="text-2xl font-bold text-slate-800 mt-8 mb-4 border-b pb-2">1. Service Description</h2>
                            <p>ContractorDocs provides a suite of tools for contractors to create, manage, and share business documents. The Service is provided "as is" and we make no guarantees regarding its suitability for any particular purpose.</p>
                        
                            <h2 className="text-2xl font-bold text-slate-800 mt-8 mb-4 border-b pb-2">2. User Accounts</h2>
                            <p>You are responsible for safeguarding your account and for any activities or actions under your account. You must notify us immediately upon becoming aware of any breach of security or unauthorized use of your account.</p>

                            <h2 className="text-2xl font-bold text-slate-800 mt-8 mb-4 border-b pb-2">3. User Content</h2>
                            <p>You retain full ownership of all data and content you create or upload to the Service ("User Content"). We do not claim any ownership rights over your User Content.</p>

                            <h2 className="text-2xl font-bold text-slate-800 mt-8 mb-4 border-b pb-2">4. Legal Disclaimer</h2>
                            <p>ContractorDocs is not a law firm and does not provide legal advice. The document templates provided are for informational purposes only and may not be legally compliant in your jurisdiction. You are solely responsible for ensuring that any documents you create are legally sound.</p>

                            <h2 className="text-2xl font-bold text-slate-800 mt-8 mb-4 border-b pb-2">5. Limitation of Liability</h2>
                            <p>In no event shall ContractorDocs be liable for any indirect, incidental, special, consequential or punitive damages, including loss of profits, data, or goodwill, arising out of your use of the Service.</p>

                            <h2 className="text-2xl font-bold text-slate-800 mt-8 mb-4 border-b pb-2">6. Changes to Terms</h2>
                            <p>We reserve the right to modify these terms at any time. We will provide notice of changes by updating the "Last Updated" date. Your continued use of the Service constitutes acceptance of the revised terms.</p>
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

export default TermsOfService;
