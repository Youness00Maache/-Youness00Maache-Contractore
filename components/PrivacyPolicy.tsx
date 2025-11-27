import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/Card.tsx';
import { Button } from './ui/Button.tsx';
import { BackArrowIcon, ShieldIcon } from './Icons.tsx';

interface Props {
    onBack: () => void;
}

const PrivacyPolicy: React.FC<Props> = ({ onBack }) => {
    return (
        <div className="min-h-screen bg-background text-foreground p-4 md:p-8">
            <header className="flex items-center mb-8 gap-4 max-w-4xl mx-auto">
                <Button variant="ghost" size="sm" onClick={onBack} className="w-10 h-10 p-0 flex items-center justify-center hover:bg-secondary/80 rounded-full" aria-label="Back">
                    <BackArrowIcon className="h-6 w-6" />
                </Button>
                <h1 className="text-2xl font-bold flex items-center gap-2">
                    <ShieldIcon className="w-6 h-6 text-primary" /> Privacy Policy
                </h1>
            </header>

            <Card className="max-w-4xl mx-auto animate-fade-in-down">
                <CardHeader>
                    <CardTitle>Privacy Policy for ContractorDocs</CardTitle>
                    <p className="text-sm text-muted-foreground">Last Updated: {new Date().toLocaleDateString()}</p>
                </CardHeader>
                <CardContent className="space-y-6 text-sm md:text-base leading-relaxed">
                    <section>
                        <h2 className="text-lg font-bold mb-2">1. Introduction</h2>
                        <p>
                            ContractorDocs ("we," "our," or "us") respects your privacy and is committed to protecting it. 
                            This policy describes the types of information we may collect from you or that you may provide when you use the ContractorDocs application.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-lg font-bold mb-2">2. Information We Collect</h2>
                        <p>We collect information from and about users of our Application, including:</p>
                        <ul className="list-disc ml-6 mt-2 space-y-1">
                            <li><strong>Account Information:</strong> When you register, we collect your email address and name via Google Sign-In or email/password registration.</li>
                            <li><strong>Business Data:</strong> Information you input into the app, such as client details (names, addresses, emails), job descriptions, pricing, inventory items, and company profile information.</li>
                            <li><strong>Documents:</strong> Data related to the invoices, estimates, daily reports, work orders, and other documents you generate.</li>
                        </ul>
                    </section>

                    <section className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-100 dark:border-blue-800">
                        <h2 className="text-lg font-bold mb-2 text-blue-800 dark:text-blue-300">3. Google User Data & Limited Use Policy</h2>
                        <p className="mb-2">
                            ContractorDocs uses Google APIs when you sign in with Google or use the Gmail integration feature.
                        </p>
                        <p className="mb-2">
                            <strong>Gmail Integration:</strong> If you choose to connect your Gmail account, ContractorDocs requests the <code>https://www.googleapis.com/auth/gmail.send</code> scope. 
                            We use this permission <strong>solely</strong> to allow you to send PDF documents (such as invoices, estimates, or reports) generated within the application directly to your clients from your own email address.
                        </p>
                        <p className="font-semibold mt-4">
                            ContractorDocs's use and transfer to any other app of information received from Google APIs will adhere to 
                            <a href="https://developers.google.com/terms/api-services-user-data-policy#additional_requirements_for_specific_api_scopes" target="_blank" rel="noreferrer" className="text-primary hover:underline ml-1">
                                Google API Services User Data Policy
                            </a>, including the Limited Use requirements.
                        </p>
                        <ul className="list-disc ml-6 mt-2 space-y-1">
                            <li>We do not read, view, or scrape your emails.</li>
                            <li>We do not use your data for advertising purposes.</li>
                            <li>We do not sell your data to third parties.</li>
                            <li>We only store the authentication token locally on your device to perform the action you explicitly requested (sending an email).</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-lg font-bold mb-2">4. How We Use Your Information</h2>
                        <p>We use information that we collect about you or that you provide to us:</p>
                        <ul className="list-disc ml-6 mt-2 space-y-1">
                            <li>To present our Application and its contents to you.</li>
                            <li>To provide you with information, products, or services that you request from us (e.g., generating PDF documents).</li>
                            <li>To store your business data securely so you can access it across devices.</li>
                            <li>To support offline functionality by caching data locally on your device.</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-lg font-bold mb-2">5. Data Security</h2>
                        <p>
                            We have implemented measures designed to secure your personal information from accidental loss and from unauthorized access, use, alteration, and disclosure. 
                            Your data is stored securely using Supabase (PostgreSQL database), which employs industry-standard encryption and security practices.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-lg font-bold mb-2">6. Contact Information</h2>
                        <p>
                            To ask questions or comment about this privacy policy and our privacy practices, contact us at: 
                            <span className="font-medium block mt-1">younessmaache6@gmail.com</span>
                        </p>
                    </section>
                </CardContent>
            </Card>
        </div>
    );
};

export default PrivacyPolicy;