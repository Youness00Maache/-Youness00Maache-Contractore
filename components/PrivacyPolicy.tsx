import React from 'react';
import { Button } from './ui/Button.tsx';
import { BackArrowIcon } from './Icons.tsx';

interface Props {
    onBack: () => void;
}

const PrivacyPolicy: React.FC<Props> = ({ onBack }) => {
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
                        Privacy <br className="hidden lg:block" />
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-violet-600">Policy</span>
                    </h1>
                    <p className="text-slate-500">Last Updated: {new Date().toLocaleDateString()}</p>
                </section>
                
                <section className="pb-24">
                    <div className="max-w-3xl mx-auto px-6 space-y-8">
                        <div className="text-slate-600 leading-relaxed space-y-4">
                            <h2 className="text-2xl font-bold text-slate-800 mt-8 mb-4 border-b pb-2">1. Introduction</h2>
                            <p>ContractorDocs ("we," "our," or "us") respects your privacy and is committed to protecting it. This policy describes how we collect, use, and handle your information when you use our application.</p>
                        
                            <h2 className="text-2xl font-bold text-slate-800 mt-8 mb-4 border-b pb-2">2. Information We Collect</h2>
                            <p>We collect information to provide and improve our service, including:</p>
                            <ul className="list-disc list-inside space-y-2 pl-4">
                                <li><strong>Account Information:</strong> Your name and email address provided during sign-up (either via email/password or Google).</li>
                                <li><strong>User-Generated Content:</strong> All data you input into the application, such as client details, job information, line items, notes, and generated documents (invoices, estimates, etc.).</li>
                                <li><strong>Uploaded Files:</strong> Your company logo, signatures, and any images you upload within the application.</li>
                            </ul>

                            <div className="p-6 rounded-lg bg-blue-50 border border-blue-200 mt-6">
                                <h2 className="text-2xl font-bold text-blue-900 mb-4 border-b pb-2 border-blue-200">3. Google User Data & Limited Use Policy</h2>
                                <p className="mb-4">ContractorDocs's use and transfer of information received from Google APIs to any other app will adhere to the <a href="https://developers.google.com/terms/api-services-user-data-policy#additional_requirements_for_specific_api_scopes" target="_blank" rel="noopener noreferrer" className="text-blue-600 font-semibold hover:underline">Google API Services User Data Policy</a>, including the Limited Use requirements.</p>
                                <p><strong>Gmail Integration:</strong> If you connect your Gmail account, we request the <code>https://www.googleapis.com/auth/gmail.send</code> scope. This permission is used <strong>exclusively</strong> to send emails with your generated PDF documents attached, on your behalf. We do not read, store, or analyze your emails for any other purpose. We do not use this data for advertising, nor do we sell it.</p>
                            </div>

                            <h2 className="text-2xl font-bold text-slate-800 mt-8 mb-4 border-b pb-2">4. How We Use Your Information</h2>
                            <p>Your data is used solely to:</p>
                            <ul className="list-disc list-inside space-y-2 pl-4">
                                <li>Operate and maintain the ContractorDocs service.</li>
                                <li>Generate professional documents as you direct.</li>
                                <li>Enable you to send these documents via email.</li>
                                <li>Provide customer support.</li>
                            </ul>

                            <h2 className="text-2xl font-bold text-slate-800 mt-8 mb-4 border-b pb-2">5. Data Storage and Security</h2>
                            <p>We use Supabase as our backend provider. Your data is stored in a secure PostgreSQL database and protected by industry-standard security measures, including Row Level Security (RLS) to ensure your data is isolated and accessible only by you.</p>

                            <h2 className="text-2xl font-bold text-slate-800 mt-8 mb-4 border-b pb-2">6. Contact Us</h2>
                            <p>If you have any questions about this Privacy Policy, please contact us at <a href="mailto:younessmaache6@gmail.com" className="text-blue-600 font-semibold hover:underline">younessmaache6@gmail.com</a>.</p>
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

export default PrivacyPolicy;
