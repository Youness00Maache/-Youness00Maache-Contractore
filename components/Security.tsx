import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/Card.tsx';
import { Button } from './ui/Button.tsx';
import { BackArrowIcon, ShieldIcon } from './Icons.tsx';

interface Props {
    onBack: () => void;
}

const Security: React.FC<Props> = ({ onBack }) => {
    return (
        <div className="min-h-screen bg-background text-foreground p-4 md:p-8">
            <header className="flex items-center mb-8 gap-4 max-w-4xl mx-auto">
                <Button variant="ghost" size="sm" onClick={onBack} className="w-10 h-10 p-0 flex items-center justify-center hover:bg-secondary/80 rounded-full" aria-label="Back">
                    <BackArrowIcon className="h-6 w-6" />
                </Button>
                <h1 className="text-2xl font-bold flex items-center gap-2">
                    <ShieldIcon className="w-6 h-6 text-primary" /> Security
                </h1>
            </header>

            <Card className="max-w-4xl mx-auto animate-fade-in-down">
                <CardHeader>
                    <CardTitle>Security Practices</CardTitle>
                    <p className="text-sm text-muted-foreground">Last Updated: {new Date().toLocaleDateString()}</p>
                </CardHeader>
                <CardContent className="space-y-6 text-sm md:text-base leading-relaxed">
                    <section>
                        <h2 className="text-lg font-bold mb-2">1. Data Encryption</h2>
                        <p>
                            Security is our top priority. All data transmitted between your device and our servers is encrypted using <strong>TLS 1.2+ (Transport Layer Security)</strong>. 
                            Data stored in our database is encrypted at rest using industry-standard AES-256 encryption standards.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-lg font-bold mb-2">2. Authentication & Access Control</h2>
                        <p>
                            We use secure authentication methods including Google OAuth to manage user identities. We do not store your Google passwords.
                        </p>
                        <ul className="list-disc ml-6 mt-2 space-y-1">
                            <li><strong>Row Level Security (RLS):</strong> Our database uses strict RLS policies. Your data is isolated so only you can access your records.</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-lg font-bold mb-2">3. Google API Security</h2>
                        <p>
                            We adhere to the principle of least privilege. We only request the <code>gmail.send</code> scope to send emails on your behalf and do not request read access to your inbox.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-lg font-bold mb-2">4. Vulnerability Reporting</h2>
                        <p>
                            If you believe you have found a security vulnerability in ContractorDocs, please report it to us immediately at 
                            <span className="font-medium ml-1">younessmaache6@gmail.com</span>.
                        </p>
                    </section>
                </CardContent>
            </Card>
        </div>
    );
};

export default Security;