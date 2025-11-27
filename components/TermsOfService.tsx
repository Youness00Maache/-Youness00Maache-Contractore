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
                        <h2 className="text-lg font-bold mb-2">2. Use License</h2>
                        <p>
                            Permission is granted to temporarily download one copy of the materials (information or software) on ContractorDocs for personal, 
                            non-commercial transitory viewing only. This is the grant of a license, not a transfer of title, and under this license you may not:
                        </p>
                        <ul className="list-disc ml-6 mt-2 space-y-1">
                            <li>Modify or copy the materials;</li>
                            <li>Use the materials for any commercial purpose, or for any public display (commercial or non-commercial);</li>
                            <li>Attempt to decompile or reverse engineer any software contained on ContractorDocs;</li>
                            <li>Transfer the materials to another person or "mirror" the materials on any other server.</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-lg font-bold mb-2">3. Disclaimer</h2>
                        <p>
                            The materials on ContractorDocs are provided on an 'as is' basis. ContractorDocs makes no warranties, expressed or implied, 
                            and hereby disclaims and negates all other warranties including, without limitation, implied warranties or conditions of merchantability, 
                            fitness for a particular purpose, or non-infringement of intellectual property or other violation of rights.
                        </p>
                        <p className="mt-2">
                            Further, ContractorDocs does not warrant or make any representations concerning the accuracy, likely results, or reliability of the use of the 
                            materials on its website or otherwise relating to such materials or on any sites linked to this site.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-lg font-bold mb-2">4. Limitations</h2>
                        <p>
                            In no event shall ContractorDocs or its suppliers be liable for any damages (including, without limitation, damages for loss of data or profit, 
                            or due to business interruption) arising out of the use or inability to use the materials on ContractorDocs, even if ContractorDocs or a ContractorDocs 
                            authorized representative has been notified orally or in writing of the possibility of such damage.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-lg font-bold mb-2">5. Accuracy of Materials</h2>
                        <p>
                            The materials appearing on ContractorDocs could include technical, typographical, or photographic errors. ContractorDocs does not warrant that any of the 
                            materials on its website are accurate, complete, or current. ContractorDocs may make changes to the materials contained on its website at any time without notice. 
                            However, ContractorDocs does not make any commitment to update the materials.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-lg font-bold mb-2">6. Modifications</h2>
                        <p>
                            ContractorDocs may revise these terms of service for its website at any time without notice. By using this website you are agreeing to be bound by the then 
                            current version of these terms of service.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-lg font-bold mb-2">7. Governing Law</h2>
                        <p>
                            These terms and conditions are governed by and construed in accordance with the laws and you irrevocably submit to the exclusive jurisdiction of the courts in that location.
                        </p>
                    </section>
                </CardContent>
            </Card>
        </div>
    );
};

export default TermsOfService;