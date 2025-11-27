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
                            Data stored in our database is encrypted at rest using industry-standard AES-256 encryption standards managed by Supabase.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-lg font-bold mb-2">2. Authentication & Access Control</h2>
                        <p>
                            We use <strong>Supabase Auth</strong> to manage user identities. We do not store your passwords directly; we rely on secure, salted hash verification or OAuth providers (like Google).
                        </p>
                        <ul className="list-disc ml-6 mt-2 space-y-1">
                            <li><strong>Row Level Security (RLS):</strong> Our database is configured with strict RLS policies. This means your data (clients, invoices, jobs) is cryptographically isolated—no other user can access your records.</li>
                            <li><strong>Google OAuth:</strong> When you sign in with Google, we use secure tokens directly from Google's identity servers. We never see or store your Google password.</li>
                        </ul>
                    </section>

                    <section className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-100 dark:border-blue-800">
                        <h2 className="text-lg font-bold mb-2 text-blue-800 dark:text-blue-300">3. Google API Security</h2>
                        <p className="mb-2">
                            For features requiring Google API access (specifically the Gmail integration):
                        </p>
                        <ul className="list-disc ml-6 mt-2 space-y-1">
                            <li><strong>Least Privilege:</strong> We only request the <code>gmail.send</code> scope, which is the minimum permission required to send emails on your behalf. We do not request read access to your inbox.</li>
                            <li><strong>Token Handling:</strong> Access tokens are stored in your browser's local storage for your active session and are not permanently stored on our backend servers in a way that allows offline access without your consent.</li>
                            <li><strong>Limited Use:</strong> Our use of information received from Google APIs adheres to the Google API Services User Data Policy, including the Limited Use requirements.</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-lg font-bold mb-2">4. Infrastructure</h2>
                        <p>
                            Our application is hosted on Vercel, a platform that complies with SOC 2 Type 2 standards. Our database is hosted by Supabase on AWS infrastructure, benefiting from AWS's world-class physical and network security.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-lg font-bold mb-2">5. Vulnerability Reporting</h2>
                        <p>
                            If you believe you have found a security vulnerability in ContractorDocs, please report it to us immediately at 
                            <span className="font-medium ml-1">younessmaache6@gmail.com</span>. We will investigate all reports and address any issues promptly.
                        </p>
                    </section>
                </CardContent>
            </Card>
        </div>
    );
};

export default Security;