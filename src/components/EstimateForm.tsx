import React, { useState, useEffect } from 'react';
import type { EstimateData, LineItem, UserProfile, Job, Client, SavedItem } from '../types';
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from './ui/Card.tsx';
import { Label } from './ui/Label.tsx';
import { Input } from './ui/Input.tsx';
import { Button } from './ui/Button.tsx';
import { BackArrowIcon, ExportIcon, EstimateIcon, TrendingUpIcon, EyeIcon, EyeOffIcon, TagIcon, SearchIcon, GlobeIcon, CheckIcon } from './Icons.tsx';
import { generateEstimatePDF } from '../services/pdfGenerator.ts';
import TemplateSelector from './TemplateSelector.tsx';
import SignaturePad from './SignaturePad.tsx';

interface Props {
  job: Job;
  profile: UserProfile;
  data: EstimateData | null;
  clients?: Client[];
  savedItems?: SavedItem[]; // New Prop
  onSave: (data: EstimateData) => void;
  onBack: () => void;
  onUploadImage?: (file: File) => Promise<string>;
  publicToken?: string;
}

const EstimateForm: React.FC<Props> = ({ job, profile, data, clients = [], savedItems = [], onSave, onBack, onUploadImage, publicToken }) => {
  const [page, setPage] = useState(1);
  const [showCosts, setShowCosts] = useState(false);
  const [showItemPicker, setShowItemPicker] = useState<string | null>(null); // Stores ID of line item being picked for
  const [itemSearch, setItemSearch] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);
  
  const [formData, setFormData] = useState<EstimateData>(data || {
    title: '',
    estimateNumber: `EST-${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${Math.floor(Math.random() * 1000)}`,
    issueDate: new Date().toISOString().split('T')[0],
    expiryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    lineItems: [{ id: crypto.randomUUID(), description: '', quantity: 1, rate: 0, unitCost: 0 }],
    terms: 'This estimate is valid for 30 days. Payment schedule: 50% deposit, 50% upon completion.',
    notes: '',
    status: 'Draft',
    companyName: profile.companyName,
    companyAddress: profile.address,
    companyPhone: profile.phone,
    companyWebsite: profile.website,
    clientName: job.clientName,
    clientAddress: job.clientAddress,
    logoUrl: profile.logoUrl,
    signatureUrl: '',
    templateId: 'standard',
    themeColors: { primary: '#000000', secondary: '#666666' }
  });
  const [isDownloading, setIsDownloading] = useState(false);

  // Sync company details and logo from profile
  useEffect(() => {
      if (!data) {
          // New Document
          setFormData(prev => ({
              ...prev,
              companyName: profile.companyName || prev.companyName,
              companyAddress: profile.address || prev.companyAddress,
              companyPhone: profile.phone || prev.companyPhone,
              companyWebsite: profile.website || prev.companyWebsite,
              logoUrl: profile.logoUrl || prev.logoUrl
          }));
      } else if (formData.status === 'Draft') {
          // Existing Draft: Sync missing info
          setFormData(prev => ({
              ...prev,
              logoUrl: (profile.logoUrl && profile.logoUrl !== prev.logoUrl && !data.logoUrl) ? profile.logoUrl : prev.logoUrl,
              companyName: prev.companyName || profile.companyName,
              companyAddress: prev.companyAddress || profile.address,
              companyPhone: prev.companyPhone || profile.phone,
              companyWebsite: prev.companyWebsite || profile.website,
          }));
      }
  }, [profile, data, formData.status]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleClientSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
      const clientId = e.target.value;
      if (clientId === 'custom') return;
      const client = clients.find(c => c.id === clientId);
      if (client) {
          setFormData(prev => ({
              ...prev,
              clientName: client.name,
              clientAddress: client.address || prev.clientAddress
          }));
      }
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

  const updateItem = (id: string, field: keyof LineItem, value: any) => {
    setFormData(prev => ({
      ...prev,
      lineItems: prev.lineItems.map(item => item.id === id ? { ...item, [field]: value } : item)
    }));
  };
  
  const addItem = () => setFormData(prev => ({ ...prev, lineItems: [...prev.lineItems, { id: crypto.randomUUID(), description: '', quantity: 1, rate: 0, unitCost: 0 }] }));
  const removeItem = (id: string) => setFormData(prev => ({ ...prev, lineItems: prev.lineItems.filter(i => i.id !== id) }));

  // Pick Item Logic
  const handlePickItem = (item: SavedItem) => {
      if (!showItemPicker) return;
      
      setFormData(prev => ({
          ...prev,
          lineItems: prev.lineItems.map(lineItem => 
              lineItem.id === showItemPicker 
              ? { 
                  ...lineItem, 
                  description: item.name + (item.description ? ` - ${item.description}` : ''),
                  rate: item.rate,
                  unitCost: item.unit_cost || 0
                } 
              : lineItem
          )
      }));
      setShowItemPicker(null);
      setItemSearch('');
  };

  const filteredSavedItems = savedItems.filter(i => i.name.toLowerCase().includes(itemSearch.toLowerCase()));

  // Profit Calculations
  const totalRevenue = formData.lineItems.reduce((acc, item) => acc + (item.quantity * item.rate), 0);
  const totalCost = formData.lineItems.reduce((acc, item) => acc + (item.quantity * (item.unitCost || 0)), 0);
  const estimatedProfit = totalRevenue - totalCost;
  const profitMargin = totalRevenue > 0 ? (estimatedProfit / totalRevenue) * 100 : 0;
  
  const getMarginColor = (margin: number) => {
      if (margin >= 30) return 'text-green-600 bg-green-100 dark:bg-green-900/30';
      if (margin >= 15) return 'text-yellow-600 bg-yellow-100 dark:bg-yellow-900/30';
      return 'text-red-600 bg-red-100 dark:bg-red-900/30';
  };

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      await generateEstimatePDF(profile, job, formData, formData.templateId || 'standard');
    } catch (e) { console.error(e); alert('Error generating PDF'); }
    finally { setIsDownloading(false); }
  }

  const handleGetApprovalLink = () => {
      if (!publicToken) {
          alert("Please save the estimate first to generate a link.");
          onSave(formData);
          return;
      }
      
      const link = `${window.location.origin}?approval_token=${publicToken}`;
      navigator.clipboard.writeText(link);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
  };

  const renderPageOne = () => (
      <Card className="max-w-3xl mx-auto w-full animate-fade-in-down">
          <CardHeader>
              <CardTitle>Estimate Setup</CardTitle>
              <CardDescription>Project details and client information.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
              <div className="space-y-1.5">
                  <Label htmlFor="title">Document Title (Dashboard)</Label>
                  <Input id="title" name="title" value={formData.title || ''} onChange={handleChange} placeholder="e.g. Kitchen Renovation Quote" className="font-medium"/>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-t border-border pt-4">
                  <div className="space-y-3 bg-muted/20 p-3 rounded-md border border-border/50">
                      <Label className="text-xs text-muted-foreground uppercase font-bold">From (You)</Label>
                      <Input name="companyName" value={formData.companyName} onChange={handleChange} placeholder="Company Name" />
                      <Input name="companyAddress" value={formData.companyAddress} onChange={handleChange} placeholder="Address" />
                      <div className="flex items-center gap-3 mt-2">
                          {formData.logoUrl && <img src={formData.logoUrl} className="w-10 h-10 object-contain bg-white rounded border p-1" />}
                          <div className="flex-1">
                              <Label htmlFor="logoUpload" className="text-xs cursor-pointer text-primary hover:underline">Update Logo</Label>
                              <Input id="logoUpload" type="file" className="h-8 text-xs" accept="image/*" onChange={handleLogoChange} />
                          </div>
                      </div>
                  </div>

                  <div className="space-y-3 bg-muted/20 p-3 rounded-md border border-border/50">
                      <div className="flex flex-col space-y-1.5">
                          <Label className="text-xs text-muted-foreground uppercase font-bold">To (Client)</Label>
                          <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm" onChange={handleClientSelect} defaultValue="custom">
                              <option value="custom">-- Manual Entry --</option>
                              {clients.map(c => (<option key={c.id} value={c.id}>{c.name}</option>))}
                          </select>
                      </div>
                      <Input name="clientName" value={formData.clientName} onChange={handleChange} placeholder="Client Name" />
                      <Input name="clientAddress" value={formData.clientAddress} onChange={handleChange} placeholder="Client Address" />
                  </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                  <div className="space-y-1.5"><Label>Estimate #</Label><Input name="estimateNumber" value={formData.estimateNumber} onChange={handleChange} /></div>
                  <div className="space-y-1.5"><Label>Status</Label><select name="status" value={formData.status} onChange={handleChange} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="Draft">Draft</option><option value="Sent">Sent</option><option value="Accepted">Accepted</option><option value="Rejected">Rejected</option></select></div>
                  <div className="space-y-1.5"><Label>Issue Date</Label><Input type="date" name="issueDate" value={formData.issueDate} onChange={handleChange} /></div>
                  <div className="space-y-1.5"><Label>Expiry Date</Label><Input type="date" name="expiryDate" value={formData.expiryDate} onChange={handleChange} /></div>
              </div>
          </CardContent>
          <CardFooter className="flex justify-end gap-2">
              <Button variant="outline" onClick={onBack}>Cancel</Button>
              <Button onClick={() => setPage(2)}>Next: Items</Button>
          </CardFooter>
      </Card>
  );

  const renderPageTwo = () => (
      <Card className="max-w-3xl mx-auto w-full animate-fade-in-down flex flex-col">
          <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Line Items & Profitability</CardTitle>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setShowCosts(!showCosts)}
                className={`text-xs ${showCosts ? 'bg-primary/10 text-primary border-primary/30' : ''}`}
              >
                  {showCosts ? <EyeOffIcon className="w-3 h-3 mr-1" /> : <EyeIcon className="w-3 h-3 mr-1" />}
                  {showCosts ? 'Hide Internal Costs' : 'Show Profit Tools'}
              </Button>
          </CardHeader>
          <CardContent className="space-y-6 flex-1">
              <div className="space-y-2">
                  {/* Table Header */}
                  <div className={`grid gap-2 text-sm font-medium text-muted-foreground px-2 ${showCosts ? 'grid-cols-12' : 'grid-cols-12'}`}>
                      <div className={showCosts ? "col-span-4" : "col-span-6"}>Description</div>
                      <div className="col-span-2 text-center">Qty</div>
                      {showCosts && <div className="col-span-2 text-red-500/80">Unit Cost (You)</div>}
                      <div className="col-span-3">Unit Price (Client)</div>
                  </div>
                  
                  {/* Line Items */}
                  {formData.lineItems.map((item) => (
                      <div key={item.id} className={`grid gap-2 items-center ${showCosts ? 'grid-cols-12' : 'grid-cols-12'}`}>
                          <div className={showCosts ? "col-span-4" : "col-span-6"} style={{ position: 'relative' }}>
                              <div className="flex gap-1">
                                  <Input value={item.description} onChange={e => updateItem(item.id, 'description', e.target.value)} placeholder="Item description" />
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-10 w-10 shrink-0 text-muted-foreground hover:text-primary" 
                                    onClick={() => { setShowItemPicker(item.id); setItemSearch(''); }}
                                    title="Pick from Price Book"
                                  >
                                      <TagIcon className="w-4 h-4" />
                                  </Button>
                              </div>
                          </div>
                          <div className="col-span-2">
                              <Input type="number" className="text-center" value={item.quantity} onChange={e => updateItem(item.id, 'quantity', parseFloat(e.target.value))} />
                          </div>
                          {showCosts && (
                              <div className="col-span-2">
                                  <Input 
                                    type="number" 
                                    value={item.unitCost || 0} 
                                    onChange={e => updateItem(item.id, 'unitCost', parseFloat(e.target.value))} 
                                    className="bg-red-50/50 dark:bg-red-950/10 border-red-100 dark:border-red-900/30 text-red-700 dark:text-red-400"
                                    placeholder="Cost"
                                  />
                              </div>
                          )}
                          <div className="col-span-3">
                              <Input type="number" value={item.rate} onChange={e => updateItem(item.id, 'rate', parseFloat(e.target.value))} />
                          </div>
                          <div className="col-span-1">
                              <Button variant="ghost" size="sm" onClick={() => removeItem(item.id)} className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10">×</Button>
                          </div>
                      </div>
                  ))}
                  <Button variant="outline" size="sm" onClick={addItem} className="mt-2">+ Add Item</Button>
              </div>
              
              {/* Profitability Dashboard (Visible only when Show Costs is on) */}
              {showCosts && (
                  <div className="mt-6 p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 grid grid-cols-2 md:grid-cols-4 gap-4 animate-in slide-in-from-top-2">
                      <div className="space-y-1">
                          <span className="text-xs text-muted-foreground uppercase font-bold">Total Revenue</span>
                          <div className="text-xl font-bold">${totalRevenue.toFixed(2)}</div>
                      </div>
                      <div className="space-y-1">
                          <span className="text-xs text-red-500/70 uppercase font-bold">Total Cost</span>
                          <div className="text-xl font-bold text-red-600/80">${totalCost.toFixed(2)}</div>
                      </div>
                      <div className="space-y-1">
                          <span className="text-xs text-muted-foreground uppercase font-bold">Est. Net Profit</span>
                          <div className={`text-xl font-bold ${estimatedProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              ${estimatedProfit.toFixed(2)}
                          </div>
                      </div>
                      <div className="space-y-1">
                          <span className="text-xs text-muted-foreground uppercase font-bold">Margin</span>
                          <div className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-bold ${getMarginColor(profitMargin)}`}>
                              {profitMargin.toFixed(1)}%
                          </div>
                      </div>
                  </div>
              )}
              
              {!showCosts && (
                  <div className="flex justify-end border-t border-border pt-4">
                      <div className="text-right">
                          <span className="text-muted-foreground mr-4">Total Estimate:</span>
                          <span className="text-2xl font-bold">${totalRevenue.toFixed(2)}</span>
                      </div>
                  </div>
              )}

              <div className="space-y-4 pt-4">
                  <div className="space-y-1.5"><Label>Notes</Label><textarea className="w-full p-2 border rounded-md bg-background text-sm" rows={2} name="notes" value={formData.notes} onChange={handleChange} placeholder="Additional notes..." /></div>
                  <div className="space-y-1.5"><Label>Terms & Conditions</Label><textarea className="w-full p-2 border rounded-md bg-background text-sm" rows={3} name="terms" value={formData.terms} onChange={handleChange} /></div>
              </div>

              <div className="pt-4 border-t border-border mt-4">
                   <div className="flex flex-col gap-2">
                       <h4 className="text-sm font-bold flex items-center gap-2"><GlobeIcon className="w-4 h-4 text-blue-600" /> Digital Sign-off (Quick Close)</h4>
                       <p className="text-xs text-muted-foreground">Share a public link. Client signs on their phone. Status updates to 'Accepted' automatically.</p>
                       <div className="flex gap-2">
                           <Button 
                                variant="outline" 
                                size="sm" 
                                className="bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100 w-full sm:w-auto"
                                onClick={handleGetApprovalLink}
                            >
                                <GlobeIcon className="w-4 h-4 mr-2" /> 
                                {copiedLink ? <span className="flex items-center gap-1"><CheckIcon className="w-4 h-4"/> Copied Link</span> : 'Get Approval Link'}
                            </Button>
                       </div>
                   </div>
              </div>

              <div className="pt-4">
                  <Label className="mb-2 block">Client Acceptance (Manual Signature)</Label>
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

            {/* Price Book Picker Modal */}
            {showItemPicker && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm" onClick={() => setShowItemPicker(null)}>
                    <Card className="w-full max-w-md animate-in zoom-in-95 shadow-2xl h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
                        <CardHeader className="border-b border-border pb-4">
                            <CardTitle className="flex items-center gap-2"><TagIcon className="w-5 h-5 text-primary"/> Select from Price Book</CardTitle>
                        </CardHeader>
                        <CardContent className="flex-1 overflow-hidden flex flex-col p-4 gap-4">
                            <div className="relative">
                                <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                                <Input 
                                    placeholder="Search items..." 
                                    className="pl-9" 
                                    value={itemSearch} 
                                    onChange={e => setItemSearch(e.target.value)}
                                    autoFocus
                                />
                            </div>
                            <div className="flex-1 overflow-y-auto space-y-2">
                                {filteredSavedItems.length === 0 ? (
                                    <div className="text-center py-10 text-muted-foreground text-sm">
                                        No items found. Add items in the Price Book from the dashboard.
                                    </div>
                                ) : (
                                    filteredSavedItems.map(item => (
                                        <button 
                                            key={item.id} 
                                            className="w-full text-left p-3 rounded-lg border border-border hover:bg-secondary transition-colors group"
                                            onClick={() => handlePickItem(item)}
                                        >
                                            <div className="flex justify-between items-start">
                                                <span className="font-semibold">{item.name}</span>
                                                <span className="font-mono text-primary font-bold">${item.rate}</span>
                                            </div>
                                            <div className="text-xs text-muted-foreground mt-1 truncate">{item.description}</div>
                                        </button>
                                    ))
                                )}
                            </div>
                        </CardContent>
                        <CardFooter className="border-t border-border pt-4 justify-end">
                            <Button variant="ghost" onClick={() => setShowItemPicker(null)}>Cancel</Button>
                        </CardFooter>
                    </Card>
                </div>
            )}
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
                    <EstimateIcon className="w-6 h-6 text-primary" /> Estimate
                </h1>
            </div>
        </div>
        
        {/* Header Summary Logic if needed, typically handled in Page Two toggle now */}
      </header>
      <div className="flex-1 overflow-y-auto pb-10">{page === 1 ? renderPageOne() : renderPageTwo()}</div>
    </div>
  );
};
export default EstimateForm;