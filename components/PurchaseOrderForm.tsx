import React, { useState, useEffect } from 'react';
import type { PurchaseOrderData, LineItem, UserProfile, Job, Client } from '../types';
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from './ui/Card.tsx';
import { Label } from './ui/Label.tsx';
import { Input } from './ui/Input.tsx';
import { Button } from './ui/Button.tsx';
import { BackArrowIcon, ExportIcon, TruckIcon } from './Icons.tsx';
import { generatePurchaseOrderPDF } from '../services/pdfGenerator.ts';
import TemplateSelector from './TemplateSelector.tsx';
import SignaturePad from './SignaturePad.tsx';

interface Props {
  job: Job;
  profile: UserProfile;
  data: PurchaseOrderData | null;
  clients?: Client[];
  onSave: (data: PurchaseOrderData) => void;
  onBack: () => void;
  onUploadImage?: (file: File) => Promise<string>;
}

const PurchaseOrderForm: React.FC<Props> = ({ job, profile, data, clients = [], onSave, onBack, onUploadImage }) => {
  const [page, setPage] = useState(1);
  const [formData, setFormData] = useState<PurchaseOrderData>(data || {
    title: '',
    poNumber: `PO-${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${Math.floor(Math.random() * 1000)}`,
    date: new Date().toISOString().split('T')[0],
    deliveryDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    status: 'Draft',
    
    // Vendor
    vendorName: '',
    vendorAddress: '',
    vendorPhone: '',
    vendorEmail: '',

    // Ship To
    shipToType: 'Job Site',
    shipToName: job.clientName || profile.companyName,
    shipToAddress: job.clientAddress || '',
    shipToPhone: '',
    deliveryInstructions: '',

    lineItems: [{ id: crypto.randomUUID(), description: '', quantity: 1, rate: 0 }],
    notes: '',
    
    companyName: profile.companyName,
    companyAddress: profile.address,
    companyPhone: profile.phone,
    companyWebsite: profile.website,
    logoUrl: profile.logoUrl,
    signatureUrl: '',
    templateId: 'standard',
    themeColors: { primary: '#000000', secondary: '#666666' }
  });
  const [isDownloading, setIsDownloading] = useState(false);

  // Sync company details
  useEffect(() => {
      if (!data) {
          setFormData(prev => ({
              ...prev,
              companyName: profile.companyName || prev.companyName,
              companyAddress: profile.address || prev.companyAddress,
              companyPhone: profile.phone || prev.companyPhone,
              companyWebsite: profile.website || prev.companyWebsite,
              logoUrl: profile.logoUrl || prev.logoUrl
          }));
      }
  }, [profile, data]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (onUploadImage) {
          try {
              const newUrl = await onUploadImage(file);
              if (newUrl) setFormData(prev => ({ ...prev, logoUrl: newUrl }));
          } catch (e) { console.error(e); }
      } else {
          const reader = new FileReader();
          reader.onload = (event) => {
            setFormData(prev => ({ ...prev, logoUrl: event.target?.result as string }));
          };
          reader.readAsDataURL(file);
      }
    }
  };

  const toggleShipTo = (type: 'Job Site' | 'Company Office') => {
      if (type === 'Job Site') {
          setFormData(prev => ({
              ...prev,
              shipToType: 'Job Site',
              shipToName: job.clientName, // Often ship to site c/o client or job name
              shipToAddress: job.clientAddress,
          }));
      } else {
          setFormData(prev => ({
              ...prev,
              shipToType: 'Company Office',
              shipToName: profile.companyName,
              shipToAddress: profile.address,
              shipToPhone: profile.phone
          }));
      }
  };

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
      await generatePurchaseOrderPDF(profile, job, formData, formData.templateId || 'standard');
    } catch (e) { console.error(e); alert('Error generating PDF'); }
    finally { setIsDownloading(false); }
  }

  const renderPageOne = () => (
      <Card className="max-w-3xl mx-auto w-full animate-fade-in-down">
          <CardHeader>
              <CardTitle>Purchase Order Setup</CardTitle>
              <CardDescription>Logistics and Vendor Information</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
              <div className="space-y-1.5">
                  <Label htmlFor="title">Document Title (Dashboard)</Label>
                  <Input id="title" name="title" value={formData.title || ''} onChange={handleChange} placeholder="e.g. Lumber Order - Home Depot" className="font-medium"/>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-t border-border pt-4">
                  {/* Meta Info */}
                  <div className="space-y-3">
                      <div className="space-y-1.5">
                          <Label>P.O. #</Label>
                          <Input name="poNumber" value={formData.poNumber} onChange={handleChange} />
                      </div>
                      <div className="space-y-1.5">
                          <Label>Order Date</Label>
                          <Input type="date" name="date" value={formData.date} onChange={handleChange} />
                      </div>
                      <div className="space-y-1.5">
                          <Label className="text-red-600 font-medium dark:text-red-400">Required By Date</Label>
                          <Input 
                            type="date" 
                            name="deliveryDate" 
                            value={formData.deliveryDate} 
                            onChange={handleChange} 
                            className="border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800 dark:text-red-100" 
                          />
                      </div>
                  </div>

                  {/* Vendor Info */}
                  <div className="space-y-3 bg-muted/20 p-3 rounded-md border border-border/50">
                      <Label className="text-xs text-muted-foreground uppercase font-bold">Vendor (Supplier)</Label>
                      <Input name="vendorName" value={formData.vendorName} onChange={handleChange} placeholder="Vendor Name (e.g. Home Depot)" />
                      <Input name="vendorAddress" value={formData.vendorAddress} onChange={handleChange} placeholder="Vendor Address" />
                      <Input name="vendorPhone" value={formData.vendorPhone} onChange={handleChange} placeholder="Vendor Phone" />
                  </div>
              </div>

              {/* Logistics Section */}
              <div className="pt-4 border-t border-border">
                  <div className="flex items-center justify-between mb-3">
                      <Label className="text-base font-semibold">Ship To / Delivery</Label>
                      <div className="flex bg-muted rounded-md p-1 gap-1">
                          <button 
                            onClick={() => toggleShipTo('Job Site')}
                            className={`px-3 py-1 text-xs rounded-sm transition-all ${formData.shipToType === 'Job Site' ? 'bg-background shadow text-primary font-bold' : 'hover:bg-background/50'}`}
                          >
                              Job Site
                          </button>
                          <button 
                            onClick={() => toggleShipTo('Company Office')}
                            className={`px-3 py-1 text-xs rounded-sm transition-all ${formData.shipToType === 'Company Office' ? 'bg-background shadow text-primary font-bold' : 'hover:bg-background/50'}`}
                          >
                              Company Office
                          </button>
                      </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                          <Input name="shipToName" value={formData.shipToName} onChange={handleChange} placeholder="Attention To" />
                          <Input name="shipToAddress" value={formData.shipToAddress} onChange={handleChange} placeholder="Delivery Address" />
                          <Input name="shipToPhone" value={formData.shipToPhone} onChange={handleChange} placeholder="Site Contact Phone" />
                      </div>
                      <div className="space-y-1.5">
                          <Label>Delivery Instructions</Label>
                          <textarea 
                            name="deliveryInstructions" 
                            value={formData.deliveryInstructions} 
                            onChange={handleChange} 
                            className="w-full p-2 border rounded-md bg-background text-sm h-24" 
                            placeholder="e.g. Gate Code 1234, Call upon arrival, Drop in driveway..." 
                          />
                      </div>
                  </div>
              </div>
          </CardContent>
          <CardFooter className="flex justify-end gap-2">
              <Button variant="outline" onClick={onBack}>Cancel</Button>
              <Button onClick={() => setPage(2)}>Next: Items</Button>
          </CardFooter>
      </Card>
  );

  const renderPageTwo = () => (
      <Card className="max-w-3xl mx-auto w-full animate-fade-in-down">
          <CardHeader><CardTitle>Order Items</CardTitle></CardHeader>
          <CardContent className="space-y-6">
              <div className="space-y-2">
                  <div className="grid grid-cols-12 gap-2 text-sm font-medium text-muted-foreground px-2"><div className="col-span-6">Item</div><div className="col-span-2">Qty</div><div className="col-span-3">Rate</div></div>
                  {formData.lineItems.map((item) => (
                      <div key={item.id} className="grid grid-cols-12 gap-2 items-center">
                          <div className="col-span-6"><Input value={item.description} onChange={e => updateItem(item.id, 'description', e.target.value)} placeholder="Product name / SKU" /></div>
                          <div className="col-span-2"><Input type="number" value={item.quantity} onChange={e => updateItem(item.id, 'quantity', parseFloat(e.target.value))} /></div>
                          <div className="col-span-3"><Input type="number" value={item.rate} onChange={e => updateItem(item.id, 'rate', parseFloat(e.target.value))} /></div>
                          <div className="col-span-1"><Button variant="ghost" size="sm" onClick={() => removeItem(item.id)} className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10">×</Button></div>
                      </div>
                  ))}
                  <Button variant="outline" size="sm" onClick={addItem} className="mt-2">+ Add Item</Button>
              </div>
              
              <div className="flex justify-end border-t border-border pt-4">
                  <div className="text-right">
                      <span className="text-muted-foreground mr-4">Total Order Value:</span>
                      <span className="text-2xl font-bold">${total.toFixed(2)}</span>
                  </div>
              </div>

              <div className="pt-4">
                  <Label className="mb-2 block">Authorized Signature</Label>
                  <div className="mt-1 border rounded-md overflow-hidden">
                      <SignaturePad onSave={(url) => setFormData(prev => ({...prev, signatureUrl: url}))} initialDataUrl={formData.signatureUrl} />
                  </div>
              </div>

              <div className="pt-4 border-t border-border">
                   <TemplateSelector selectedTemplateId={formData.templateId || 'standard'} onSelectTemplate={(id) => setFormData(prev => ({ ...prev, templateId: id }))} themeColors={formData.themeColors} onColorsChange={(colors) => setFormData(prev => ({ ...prev, themeColors: colors }))} />
              </div>
          </CardContent>
          <CardFooter className="flex flex-col sm:flex-row gap-2 w-full">
                <Button variant="outline" onClick={() => setPage(1)} className="w-full sm:w-auto order-2 sm:order-1">Back</Button>
                <div className="grid grid-cols-2 gap-2 w-full sm:flex sm:w-auto sm:order-2 sm:ml-auto sm:justify-end">
                    <Button variant="outline" onClick={() => onSave(formData)} className="w-full sm:w-auto">Save Draft</Button>
                    <Button variant="secondary" onClick={handleDownload} disabled={isDownloading} className="w-full sm:w-auto"><ExportIcon className="h-4 w-4 mr-2"/> Download</Button>
                    <Button onClick={async () => { onSave(formData); await handleDownload(); }} disabled={isDownloading} className="col-span-2 sm:col-span-1 w-full sm:w-auto">Save & Download</Button>
                </div>
            </CardFooter>
      </Card>
  );

  return (
    <div className="w-full h-full bg-background text-foreground flex flex-col p-4 md:p-8">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
         <div className="flex items-center">
            <Button variant="ghost" size="sm" onClick={onBack} className="w-10 h-10 p-0 flex items-center justify-center mr-3 hover:bg-secondary/80 rounded-full" aria-label="Back">
                <BackArrowIcon className="h-6 w-6" />
            </Button>
            <div>
                <h1 className="text-2xl font-bold flex items-center gap-3 tracking-tight">
                    <TruckIcon className="w-6 h-6 text-primary" /> Purchase Order
                </h1>
            </div>
        </div>
      </header>
      <div className="flex-1 overflow-y-auto pb-10">{page === 1 ? renderPageOne() : renderPageTwo()}</div>
    </div>
  );
};
export default PurchaseOrderForm;