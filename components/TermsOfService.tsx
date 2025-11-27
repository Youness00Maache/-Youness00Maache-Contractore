import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/Card.tsx';
import { Button } from './ui/Button.tsx';
import { BackArrowIcon, FileTextIcon } from './Icons.tsx';

interface Props {
    onBack: () => void;
}

const TermsOfService: React.FC<Props> = ({ onBack }) => {
    return (
        <div className="min-h-screen bg-background text-foreground p-4 md:p-8">
            <header className="flex items-center mb-8 gap-4 max-w-4xl mx-auto">
                <Button variant="ghost" size="sm" onClick={onBack} className="w-10 h-10 p-0 flex items-center justify-center hover:bg-secondary/80 rounded-full" aria-label="Back">
                    <BackArrowIcon className="h-6 w-6" />
                </Button>
                <h1 className="text-2xl font-bold flex items-center gap-2">
                    <FileTextIcon className="w-6 h-6 text-primary" /> Terms of Service
                </h1>
            </header>

            <Card className="max-w-4xl mx-auto animate-fade-in-down">
                <CardHeader>
                    <CardTitle>Terms of Service</CardTitle>
                    <p className="text-sm text-muted-foreground">Last Updated: {new Date().toLocaleDateString()}</p>
                </CardHeader>
                <CardContent className="space-y-6 text-sm md:text-base leading-relaxed">
                    <section>
                        <h2 className="text-lg font-bold mb-2">1. Acceptance of Terms</h2>
                        <p>
                            By accessing or using ContractorDocs (the "Service"), you agree to be bound by these Terms. 
                            If you disagree with any part of the terms, then you may not access the Service.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-lg font-bold mb-2">2. Description of Service</h2>
                        <p>
                            ContractorDocs provides tools for contractors to generate, manage, and send professional documents such as invoices, estimates, work orders, daily reports, and more. 
                            The Service includes features for client management, inventory tracking, and communication via Gmail integration.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-lg font-bold mb-2">3. Document Generation Disclaimer</h2>
                        <p>
                            ContractorDocs provides templates for various business documents. <strong>We are not a law firm and do not provide legal advice.</strong> 
                            You acknowledge that any documents generated using the Service (including contracts, waivers, and change orders) are for informational and administrative purposes only. 
                            It is your responsibility to ensure that any legal documents you use comply with applicable local, state, and federal laws.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-lg font-bold mb-2">4. User Responsibilities</h2>
                        <ul className="list-disc ml-6 mt-2 space-y-1">
                            <li>You are responsible for maintaining the confidentiality of your account and password.</li>
                            <li>You are responsible for all content (data, text, images) that you upload or generate using the Service.</li>
                            <li>You agree not to use the Service for any illegal or unauthorized purpose.</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-lg font-bold mb-2">5. Gmail Integration</h2>
                        <p>
                            If you opt to use the Gmail integration feature to send documents, you authorize ContractorDocs to send emails on your behalf via the Google Gmail API using the `gmail.send` scope. 
                            You retain full ownership of your email data.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-lg font-bold mb-2">6. Limitation of Liability</h2>
                        <p>
                            In no event shall ContractorDocs be liable for any indirect, incidental, special, consequential or punitive damages, 
                            including without limitation, loss of profits, data, use, goodwill, or other intangible losses, resulting from your access to or use of the Service.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-lg font-bold mb-2">7. Governing Law</h2>
                        <p>
                            These terms and conditions are governed by and construed in accordance with the laws of the jurisdiction in which ContractorDocs operates.
                        </p>
                    </section>
                </CardContent>
            </Card>
        </div>
    );
};

export default TermsOfService;