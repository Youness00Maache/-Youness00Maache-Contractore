
import React, { useState } from 'react';
import type { EstimateData, LineItem } from '../types';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from './ui/Card.tsx';
import { Label } from './ui/Label.tsx';
import { Input } from './ui/Input.tsx';
import { Button } from './ui/Button.tsx';
import { BackArrowIcon, ExportIcon } from './Icons.tsx';
import { generateEstimatePDF } from '../services/pdfGenerator.ts';
import TemplateSelector from './TemplateSelector.tsx';
import SignaturePad from './SignaturePad.tsx';

interface Props {
  job: any;
  profile: any;
  data: EstimateData | null;
  onSave: (data: EstimateData) => void;
  onBack: () => void;
}

const EstimateForm: React.FC<Props> = ({ job, profile, data, onSave, onBack }) => {
  const [formData, setFormData] = useState<EstimateData>(data || {
    estimateNumber: `EST-${Date.now().toString().slice(-4)}`,
    issueDate: new Date().toISOString().split('T')[0],
    expiryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    lineItems: [{ id: crypto.randomUUID(), description: '', quantity: 1, rate: 0 }],
    terms: 'Valid for 7 days.',
    notes: '',
    status: 'Draft',
    signatureUrl: '',
    templateId: 'standard',
    themeColors: { primary: '#000000', secondary: '#666666' }
  });
  const [isDownloading, setIsDownloading] = useState(false);

  const updateItem = (id: string, field: keyof LineItem, value: any) => {
    setFormData(prev => ({
      ...prev,
      lineItems: prev.lineItems.map(item => item.id === id ? { ...item, [field]: value } : item)
    }));
  };
  
  const addItem = () => setFormData(prev => ({ ...prev, lineItems: [...prev.lineItems, { id: crypto.randomUUID(), description: '', quantity: 1, rate: 0 }] }));
  const removeItem = (id: string) => setFormData(prev => ({ ...prev, lineItems: prev.lineItems.filter(i => i.id !== id) }));

  const total = formData.lineItems.reduce((acc, item) => acc + (item.quantity * item.rate), 0);
  
  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      await generateEstimatePDF(profile, job, formData, formData.templateId || 'standard');
    } catch (e) { console.error(e); alert('Error'); }
    finally { setIsDownloading(false); }
  }

  return (
    <div className="w-full h-full bg-background text-foreground flex flex-col p-4 md:p-8">
      <header className="grid grid-cols-3 items-center pb-4 border-b border-border mb-4">
        <div className="flex justify-start">
            <Button variant="ghost" size="sm" onClick={onBack} className="w-12 h-12 p-0 flex items-center justify-center"><BackArrowIcon className="h-9 w-9" /></Button>
        </div>
        <h1 className="text-xl font-bold text-center">Estimate</h1>
        <div className="flex justify-end"></div>
      </header>
      <div className="flex-1 overflow-y-auto">
          <Card className="max-w-4xl mx-auto w-full">
            <CardHeader><CardTitle>Create Estimate</CardTitle></CardHeader>
            <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div><Label>Estimate #</Label><Input value={formData.estimateNumber} onChange={e => setFormData({...formData, estimateNumber: e.target.value})} /></div>
                    <div>
                        <Label>Status</Label>
                        <select 
                            value={formData.status} 
                            onChange={e => setFormData({...formData, status: e.target.value as any})}
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        >
                            <option value="Draft">Draft</option>
                            <option value="Sent">Sent</option>
                            <option value="Accepted">Accepted</option>
                            <option value="Rejected">Rejected</option>
                        </select>
                    </div>
                    <div><Label>Issue Date</Label><Input type="date" value={formData.issueDate} onChange={e => setFormData({...formData, issueDate: e.target.value})} /></div>
                    <div><Label>Expiry Date</Label><Input type="date" value={formData.expiryDate} onChange={e => setFormData({...formData, expiryDate: e.target.value})} /></div>
                </div>
                <div className="space-y-2">
                    <div className="grid grid-cols-12 gap-2 text-sm font-medium text-muted-foreground"><div className="col-span-6">Description</div><div className="col-span-2">Qty</div><div className="col-span-3">Rate</div></div>
                    {formData.lineItems.map((item) => (
                        <div key={item.id} className="grid grid-cols-12 gap-2 items-center">
                            <div className="col-span-6"><Input value={item.description} onChange={e => updateItem(item.id, 'description', e.target.value)} /></div>
                            <div className="col-span-2"><Input type="number" value={item.quantity} onChange={e => updateItem(item.id, 'quantity', parseFloat(e.target.value))} /></div>
                            <div className="col-span-3"><Input type="number" value={item.rate} onChange={e => updateItem(item.id, 'rate', parseFloat(e.target.value))} /></div>
                            <div className="col-span-1"><Button variant="ghost" size="sm" onClick={() => removeItem(item.id)}>x</Button></div>
                        </div>
                    ))}
                    <Button variant="outline" size="sm" onClick={addItem}>+ Item</Button>
                </div>
                <div className="flex justify-end text-xl font-bold">Total: ${total.toFixed(2)}</div>
                <div><Label>Terms</Label><textarea className="w-full p-2 border rounded-md bg-background" rows={2} value={formData.terms} onChange={e => setFormData({...formData, terms: e.target.value})} /></div>
                
                <div className="mt-4">
                    <Label>Client Acceptance Signature</Label>
                    <div className="mt-2">
                        <SignaturePad 
                            onSave={(url) => setFormData(prev => ({...prev, signatureUrl: url}))}
                            initialDataUrl={formData.signatureUrl}
                        />
                    </div>
                </div>

                 <div className="pt-4 border-t border-border">
                     <TemplateSelector 
                         selectedTemplateId={formData.templateId || 'standard'} 
                         onSelectTemplate={(id) => setFormData(prev => ({ ...prev, templateId: id }))} 
                         themeColors={formData.themeColors}
                         onColorsChange={(colors) => setFormData(prev => ({ ...prev, themeColors: colors }))}
                     />
                </div>
            </CardContent>
            <CardFooter className="flex justify-end gap-2 flex-wrap">
                <Button variant="outline" onClick={() => onSave(formData)}>Save Only</Button>
                <Button variant="secondary" onClick={handleDownload} disabled={isDownloading}>
                    <ExportIcon className="h-4 w-4 mr-2"/> Download PDF
                </Button>
                <Button onClick={async () => { onSave(formData); await handleDownload(); }} disabled={isDownloading}>
                    Save & Download
                </Button>
            </CardFooter>
          </Card>
      </div>
    </div>
  );
};
export default EstimateForm;
