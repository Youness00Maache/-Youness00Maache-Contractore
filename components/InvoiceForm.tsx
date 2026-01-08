
import React, { useState, useEffect } from 'react';
import type { InvoiceData, LineItem, Job, UserProfile, SavedItem } from '../types';
import { generateInvoicePDF } from '../services/pdfGenerator';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './ui/Card.tsx';
import { Label } from './ui/Label.tsx';
import { Input } from './ui/Input.tsx';
import { Button } from './ui/Button.tsx';
import { BackArrowIcon, ExportIcon, InvoiceIcon, ShareIcon, ClockIcon, TagIcon, SearchIcon, PercentIcon } from './Icons.tsx';
import TemplateSelector from './TemplateSelector.tsx';
import SignaturePad from './SignaturePad.tsx';
import ShareModal from './ShareModal.tsx';

interface InvoiceFormProps {
  job: Job;
  userProfile: UserProfile;
  invoice: InvoiceData | null;
  onSave: (invoiceData: InvoiceData) => void;
  onClose: () => void;
  onUploadImage?: (file: File) => Promise<string>;
  savedItems?: SavedItem[]; // New prop
}

const defaultInvoice: Omit<InvoiceData, 'clientName' | 'clientAddress' | 'companyName' | 'companyAddress' | 'companyPhone' | 'companyWebsite' | 'logoUrl'> = {
  invoiceNumber: `INV-${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-001`,
  issueDate: new Date().toISOString().split('T')[0],
  dueDate: new Date(new Date().setDate(new Date().getDate() + 30)).toISOString().split('T')[0],
  lineItems: [{ id: crypto.randomUUID(), description: '', quantity: 1, rate: 0, percentComplete: 0 }],
  taxRate: 0,
  discount: 0,
  shipping: 0,
  notes: 'Thank you for your business.',
  paypalLink: '',
  status: 'Draft',
  signatureUrl: '',
  isProgressBilling: false,
  recurrence: {
      enabled: false,
      frequency: 'Monthly',
      nextRunDate: new Date(new Date().setDate(new Date().getDate() + 30)).toISOString().split('T')[0]
  }
};

const InvoiceForm: React.FC<InvoiceFormProps> = ({ job, userProfile, invoice, onSave, onClose, onUploadImage, savedItems = [] }) => {
  const [page, setPage] = useState(1);
  const [showItemPicker, setShowItemPicker] = useState<string | null>(null);
  const [itemSearch, setItemSearch] = useState('');

  const [invoiceData, setInvoiceData] = useState<InvoiceData>(
    invoice || {
      ...defaultInvoice,
      companyName: userProfile.companyName,
      companyAddress: userProfile.address,
      companyPhone: userProfile.phone,
      companyWebsite: userProfile.website,
      clientName: job.clientName,
      clientAddress: job.clientAddress,
      logoUrl: userProfile.logoUrl,
      templateId: 'standard',
      themeColors: { primary: '#0000bb', secondary: '#666666' }
    }
  );
  const [isDownloading, setIsDownloading] = useState(false);
  const [showPaymentLink, setShowPaymentLink] = useState(!!invoiceData.paypalLink);
  const [showShareModal, setShowShareModal] = useState(false);

  useEffect(() => {
    if (invoiceData.status === 'Draft' && userProfile.logoUrl && !invoice) {
        setInvoiceData(prev => ({ ...prev, logoUrl: userProfile.logoUrl }));
    }
  }, [userProfile.logoUrl]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setInvoiceData(prev => ({ ...prev, [name]: name === 'taxRate' || name === 'discount' || name === 'shipping' ? parseFloat(value) || 0 : value }));
  };

  const handleRecurrenceChange = (field: string, value: any) => {
      setInvoiceData(prev => ({
          ...prev,
          recurrence: {
              ...prev.recurrence!,
              [field]: value
          }
      }));
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (onUploadImage) {
          try {
              const newUrl = await onUploadImage(file);
              if (newUrl) setInvoiceData(prev => ({ ...prev, logoUrl: newUrl }));
          } catch (err) {
              console.error("Logo upload error", err);
          }
      } else {
          const reader = new FileReader();
          reader.onload = (event) => {
            setInvoiceData(prev => ({ ...prev, logoUrl: event.target?.result as string }));
          };
          reader.readAsDataURL(file);
      }
    }
  };

  const handleLineItemChange = (id: string, field: keyof Omit<LineItem, 'id'>, value: string | number) => {
    setInvoiceData(prev => ({
      ...prev,
      lineItems: prev.lineItems.map(item =>
        item.id === id ? { ...item, [field]: value } : item
      ),
    }));
  };

  const addLineItem = () => {
    setInvoiceData(prev => ({
      ...prev,
      lineItems: [...prev.lineItems, { id: crypto.randomUUID(), description: '', quantity: 1, rate: 0, percentComplete: 0 }],
    }));
  };

  const removeLineItem = (id: string) => {
    setInvoiceData(prev => ({
      ...prev,
      lineItems: prev.lineItems.filter(item => item.id !== id),
    }));
  };

  // Pick Item Logic
  const handlePickItem = (item: SavedItem) => {
      if (!showItemPicker) return;
      
      setInvoiceData(prev => ({
          ...prev,
          lineItems: prev.lineItems.map(lineItem => 
              lineItem.id === showItemPicker 
              ? { 
                  ...lineItem, 
                  description: item.name + (item.description ? ` - ${item.description}` : ''),
                  rate: item.rate,
                  // If picking from price book, default quantity 1.
                  quantity: 1 
                } 
              : lineItem
          )
      }));
      setShowItemPicker(null);
      setItemSearch('');
  };

  const filteredSavedItems = savedItems.filter(i => i.name.toLowerCase().includes(itemSearch.toLowerCase()));

  const calculateSubtotal = () => {
    return invoiceData.lineItems.reduce((acc, item) => {
        if (invoiceData.isProgressBilling) {
            // In progress mode, we treat rate * quantity as the "Scheduled Value"
            const scheduledVal = Number((item.rate * item.quantity) || 0);
            const pct = Number(item.percentComplete || 0);
            return acc + (scheduledVal * (pct / 100));
        } else {
            return acc + (Number(item.quantity) || 0) * (Number(item.rate) || 0);
        }
    }, 0);
  };
  
  const subtotal = calculateSubtotal();
  const discountAmount = invoiceData.discount || 0;
  const shippingAmount = invoiceData.shipping || 0;
  const taxableAmount = subtotal - discountAmount;
  const taxAmount = taxableAmount * ((invoiceData.taxRate || 0) / 100);
  const total = taxableAmount + taxAmount + shippingAmount;

  const handleSave = () => {
    onSave(invoiceData);
  };
  
  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      await generateInvoicePDF(userProfile, job, invoiceData, invoiceData.templateId || 'standard');
    } catch (error) {
      console.error("Failed to generate PDF:", error);
      alert("An error occurred while generating the PDF. Please check the browser console for more details.");
    } finally {
      setIsDownloading(false);
    }
  };

  const toggleBillingMode = () => {
      setInvoiceData(prev => ({ ...prev, isProgressBilling: !prev.isProgressBilling }));
  };

  const renderPageOne = () => (
    <Card className="w-full max-w-4xl animate-fade-in-down my-4">
        <CardHeader>
            <CardTitle>Invoice Setup</CardTitle>
            <CardDescription>Confirm the details for this invoice.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-4">
                    <h3 className="text-lg font-semibold border-b pb-2">Your Company</h3>
                    <div className="flex flex-col space-y-1.5">
                        <Label htmlFor="companyName">Company Name</Label>
                        <Input id="companyName" name="companyName" value={invoiceData.companyName} onChange={handleInputChange} />
                    </div>
                     <div className="flex flex-col space-y-1.5">
                        <Label htmlFor="companyAddress">Address</Label>
                        <Input id="companyAddress" name="companyAddress" value={invoiceData.companyAddress} onChange={handleInputChange} />
                    </div>
                     <div className="flex flex-col space-y-1.5">
                        <Label htmlFor="companyPhone">Phone</Label>
                        <Input id="companyPhone" name="companyPhone" value={invoiceData.companyPhone} onChange={handleInputChange} />
                    </div>
                     <div className="flex flex-col space-y-1.5">
                        <Label htmlFor="companyWebsite">Website</Label>
                        <Input id="companyWebsite" name="companyWebsite" value={invoiceData.companyWebsite} onChange={handleInputChange} />
                    </div>
                </div>
                <div className="space-y-4">
                    <h3 className="text-lg font-semibold border-b pb-2">Client Details</h3>
                    <div className="flex flex-col space-y-1.5">
                        <Label htmlFor="clientName">Client Name</Label>
                        <Input id="clientName" name="clientName" value={invoiceData.clientName} onChange={handleInputChange} />
                    </div>
                    <div className="flex flex-col space-y-1.5">
                        <Label htmlFor="clientAddress">Client Address</Label>
                        <Input id="clientAddress" name="clientAddress" value={invoiceData.clientAddress} onChange={handleInputChange} />
                    </div>
                </div>
            </div>

            <div className="pt-4">
                <h3 className="text-lg font-semibold border-b pb-2">Invoice Details</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-4">
                  <div className="space-y-4">
                    <div className="flex flex-col space-y-1.5">
                        <Label htmlFor="invoiceNumber">Invoice #</Label>
                        <Input id="invoiceNumber" name="invoiceNumber" value={invoiceData.invoiceNumber} onChange={handleInputChange} />
                    </div>
                     <div className="flex flex-col space-y-1.5">
                        <Label htmlFor="issueDate">Issue Date</Label>
                        <Input id="issueDate" type="date" name="issueDate" value={invoiceData.issueDate} onChange={handleInputChange} />
                    </div>
                     <div className="flex flex-col space-y-1.5">
                        <Label htmlFor="dueDate">Due Date</Label>
                        <Input id="dueDate" type="date" name="dueDate" value={invoiceData.dueDate} onChange={handleInputChange} />
                    </div>
                    <div className="flex flex-col space-y-1.5">
                        <Label htmlFor="status">Status</Label>
                        <select 
                            id="status" 
                            name="status" 
                            value={invoiceData.status} 
                            onChange={handleInputChange}
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        >
                            <option value="Draft">Draft</option>
                            <option value="Sent">Sent</option>
                            <option value="Paid">Paid</option>
                            <option value="Overdue">Overdue</option>
                            <option value="Cancelled">Cancelled</option>
                        </select>
                    </div>
                  </div>
                  <div className="space-y-4">
                      <div className="flex flex-col space-y-1.5">
                          <Label htmlFor="logoUrl">Company Logo</Label>
                          <Input id="logoUrl" type="file" accept="image/*" onChange={handleFileChange} className="pt-2" />
                          {invoiceData.logoUrl && <img src={invoiceData.logoUrl} alt="Logo Preview" className="mt-2 h-20 w-auto object-contain bg-muted p-2 rounded-md self-start" />}
                      </div>
                  </div>
                </div>
            </div>

            {/* Recurring Section */}
            <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <ClockIcon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                        <h3 className="font-semibold text-blue-900 dark:text-blue-100">Recurring Schedule</h3>
                    </div>
                    <div className="flex items-center gap-2">
                        <Label htmlFor="recurrence-enabled" className="text-sm font-medium cursor-pointer">Repeat this Invoice?</Label>
                        <input 
                            type="checkbox" 
                            id="recurrence-enabled" 
                            className="h-5 w-5 rounded border-blue-300 text-blue-600 focus:ring-blue-500"
                            checked={invoiceData.recurrence?.enabled || false}
                            onChange={(e) => handleRecurrenceChange('enabled', e.target.checked)}
                        />
                    </div>
                </div>
                
                {invoiceData.recurrence?.enabled && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2">
                        <div className="space-y-1.5">
                            <Label>Frequency</Label>
                            <select 
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                value={invoiceData.recurrence.frequency || 'Monthly'}
                                onChange={(e) => handleRecurrenceChange('frequency', e.target.value)}
                            >
                                <option value="Monthly">Monthly</option>
                                <option value="Quarterly">Quarterly</option>
                                <option value="Bi-Annually">Bi-Annually</option>
                                <option value="Annually">Annually</option>
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <Label>Next Auto-Create Date</Label>
                            <Input 
                                type="date" 
                                value={invoiceData.recurrence.nextRunDate || ''} 
                                onChange={(e) => handleRecurrenceChange('nextRunDate', e.target.value)} 
                            />
                        </div>
                        <div className="sm:col-span-2">
                            <p className="text-xs text-blue-700 dark:text-blue-300">
                                A new draft invoice will be automatically created on this date. You will be notified on the dashboard.
                            </p>
                        </div>
                    </div>
                )}
            </div>

        </CardContent>
        <CardFooter className="flex justify-between">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={() => setPage(2)}>Next</Button>
        </CardFooter>
    </Card>
  );

  const renderPageTwo = () => (
    <Card className="w-full max-w-4xl animate-fade-in-down my-4 flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
            <CardTitle>Invoice Items</CardTitle>
            <CardDescription>
                {invoiceData.isProgressBilling ? "Progress Billing (AIA Style)" : "Standard Invoice"}
            </CardDescription>
        </div>
        <Button 
            variant="outline" 
            size="sm" 
            onClick={toggleBillingMode}
            className={`text-xs ${invoiceData.isProgressBilling ? 'bg-blue-100 text-blue-700 border-blue-200' : ''}`}
        >
            <PercentIcon className="w-3 h-3 mr-1" />
            {invoiceData.isProgressBilling ? "Switch to Standard" : "Switch to Progress Billing"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-6 flex-1">
        {/* Line Items */}
        <div className="space-y-4">
          <div className="grid grid-cols-12 gap-2 text-sm font-medium text-muted-foreground px-2">
            <div className="col-span-4">Description</div>
            {invoiceData.isProgressBilling ? (
                <>
                    <div className="col-span-2">Qty</div>
                    <div className="col-span-2">Rate</div>
                    <div className="col-span-2 text-center">% Complete</div>
                    <div className="col-span-2 text-right">Current Bill</div>
                </>
            ) : (
                <>
                    <div className="col-span-3">Quantity</div>
                    <div className="col-span-2">Rate</div>
                    <div className="col-span-2 text-right">Amount</div>
                </>
            )}
            <div className="col-span-1"></div>
          </div>
          
          {invoiceData.lineItems.map((item) => (
            <div key={item.id} className="grid grid-cols-12 gap-2 items-center">
              <div className="col-span-4">
                  <div className="flex gap-1">
                    <Input
                      type="text"
                      placeholder="Item description"
                      value={item.description}
                      onChange={(e) => handleLineItemChange(item.id, 'description', e.target.value)}
                    />
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
              
              {/* Progress Billing: Uses Rate * Qty as scheduled value basis */}
              {invoiceData.isProgressBilling ? (
                  <>
                    <div className="col-span-2">
                        <Input
                        type="number"
                        placeholder="1"
                        value={item.quantity}
                        onChange={(e) => handleLineItemChange(item.id, 'quantity', parseFloat(e.target.value) || 0)}
                        />
                    </div>
                    <div className="col-span-2">
                        <Input
                        type="number"
                        placeholder="0.00"
                        value={item.rate}
                        onChange={(e) => handleLineItemChange(item.id, 'rate', parseFloat(e.target.value) || 0)}
                        />
                    </div>
                    <div className="col-span-2">
                        <Input
                        type="number"
                        placeholder="%"
                        className="text-center"
                        value={item.percentComplete || 0}
                        onChange={(e) => handleLineItemChange(item.id, 'percentComplete', Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)))}
                        />
                    </div>
                    <div className="col-span-2">
                        <div className="flex items-center justify-end h-10 px-3 py-2 text-sm font-medium">
                        ${((Number(item.rate * item.quantity) || 0) * ((Number(item.percentComplete) || 0) / 100)).toFixed(2)}
                        </div>
                    </div>
                  </>
              ) : (
                  <>
                    <div className="col-span-3">
                        <Input
                        type="number"
                        placeholder="1"
                        value={item.quantity}
                        onChange={(e) => handleLineItemChange(item.id, 'quantity', parseFloat(e.target.value) || 0)}
                        />
                    </div>
                    <div className="col-span-2">
                        <Input
                        type="number"
                        placeholder="0.00"
                        value={item.rate}
                        onChange={(e) => handleLineItemChange(item.id, 'rate', parseFloat(e.target.value) || 0)}
                        />
                    </div>
                    <div className="col-span-2">
                        <div className="flex items-center justify-end h-10 px-3 py-2 text-sm">
                        ${((Number(item.quantity) || 0) * (Number(item.rate) || 0)).toFixed(2)}
                        </div>
                    </div>
                  </>
              )}

              <div className="col-span-1 flex justify-end">
                {invoiceData.lineItems.length > 1 && (
                  <Button variant="ghost" size="sm" onClick={() => removeLineItem(item.id)}>
                    &times;
                  </Button>
                )}
              </div>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={addLineItem}>
            + Add Item
          </Button>
        </div>

        {/* Totals Section */}
        <div className="flex justify-end pt-4">
          <div className="w-full max-w-sm space-y-4">
            <div className="flex justify-between items-center">
              <Label>Subtotal</Label>
              <span>{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(subtotal)}</span>
            </div>
            <div className="flex justify-between items-center">
              <Label htmlFor="discount">Discount ($)</Label>
              <Input
                id="discount"
                name="discount"
                type="number"
                value={invoiceData.discount}
                onChange={handleInputChange}
                className="w-32"
              />
            </div>
             <div className="flex justify-between items-center">
              <Label htmlFor="taxRate">Tax (%)</Label>
              <Input
                id="taxRate"
                name="taxRate"
                type="number"
                value={invoiceData.taxRate}
                onChange={handleInputChange}
                className="w-32"
              />
            </div>
             <div className="flex justify-between items-center">
              <Label htmlFor="shipping">Shipping ($)</Label>
              <Input
                id="shipping"
                name="shipping"
                type="number"
                value={invoiceData.shipping}
                onChange={handleInputChange}
                className="w-32"
              />
            </div>
            <div className="border-t border-border my-2"></div>
            <div className="flex justify-between items-center font-bold text-lg">
              <Label>Total</Label>
              <span>{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(total)}</span>
            </div>
          </div>
        </div>
        
        <div className="pt-4 space-y-6">
          {/* Payment Link Section with Toggle */}
          <div className="space-y-2">
             <div className="flex items-center gap-2">
                <input 
                    type="checkbox" 
                    id="showPaymentLink" 
                    className="h-4 w-4 rounded border-input text-primary focus:ring-primary"
                    checked={showPaymentLink}
                    onChange={(e) => {
                        setShowPaymentLink(e.target.checked);
                        if (!e.target.checked) {
                            setInvoiceData(prev => ({ ...prev, paypalLink: '' }));
                        }
                    }}
                />
                <Label htmlFor="showPaymentLink" className="cursor-pointer select-none">Include Payment Link</Label>
             </div>
             
             {showPaymentLink && (
                <div className="pl-6 animate-in fade-in slide-in-from-top-2">
                    <Label htmlFor="paypalLink" className="text-xs text-muted-foreground">PayPal/Stripe URL</Label>
                    <Input
                    id="paypalLink"
                    name="paypalLink"
                    type="url"
                    placeholder="https://paypal.me/yourusername"
                    value={invoiceData.paypalLink || ''}
                    onChange={handleInputChange}
                    className="mt-1"
                    />
                    <p className="text-xs text-muted-foreground mt-1">A "Pay Now" button will be added to the PDF.</p>
                </div>
             )}
          </div>

          {/* Notes */}
          <div>
            <Label htmlFor="notes">Notes</Label>
            <textarea
              id="notes"
              name="notes"
              value={invoiceData.notes}
              onChange={handleInputChange}
              rows={3}
              className="mt-1 flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
          
          {/* Signature */}
          <div className="mt-4">
            <Label>Authorized Signature (Optional)</Label>
            <div className="mt-2">
                <SignaturePad 
                    onSave={(url) => setInvoiceData(prev => ({...prev, signatureUrl: url}))}
                    initialDataUrl={invoiceData.signatureUrl}
                />
            </div>
          </div>

          <div className="pt-4 border-t border-border">
             <TemplateSelector 
                 selectedTemplateId={invoiceData.templateId || 'standard'} 
                 onSelectTemplate={(id) => setInvoiceData(prev => ({ ...prev, templateId: id }))} 
                 themeColors={invoiceData.themeColors}
                 onColorsChange={(colors) => setInvoiceData(prev => ({ ...prev, themeColors: colors }))}
             />
          </div>
        </div>

      </CardContent>
      <CardFooter className="flex justify-between">
        <Button variant="outline" onClick={() => setPage(1)}>Back</Button>
        <div className="flex gap-2 flex-wrap justify-end">
             <Button variant="outline" onClick={() => handleSave()}>Save Only</Button>
             {/* Share Button */}
             <Button variant="outline" onClick={() => { handleSave(); setShowShareModal(true); }}>
                 <ShareIcon className="h-4 w-4 mr-2" /> Share
             </Button>
            <Button variant="secondary" onClick={handleDownload} disabled={isDownloading}>
              <ExportIcon className="h-4 w-4 mr-2"/> {isDownloading ? 'Downloading...' : 'Download PDF'}
            </Button>
            <Button onClick={async () => { handleSave(); await handleDownload(); }} disabled={isDownloading}>
              {isDownloading ? 'Saving...' : 'Save & Download'}
            </Button>
        </div>
      </CardFooter>

      {/* Item Picker Modal */}
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

      <ShareModal 
        isOpen={showShareModal} 
        onClose={() => setShowShareModal(false)} 
        data={invoiceData} 
        docType="Invoice" 
        profile={userProfile} 
      />
    </Card>
  );

  return (
    <div className="w-full h-full bg-background text-foreground flex flex-col p-4 md:p-8">
        <header className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
             <div className="flex items-center">
                <Button variant="ghost" size="sm" onClick={onClose} className="w-10 h-10 p-0 flex items-center justify-center mr-3 hover:bg-secondary/80 rounded-full" aria-label="Back">
                    <BackArrowIcon className="h-6 w-6" />
                </Button>
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-3 tracking-tight">
                        <InvoiceIcon className="w-6 h-6 text-primary" /> Invoice
                    </h1>
                </div>
            </div>
        </header>
        <div className="flex-1 flex items-start justify-center overflow-y-auto">
             {page === 1 ? renderPageOne() : renderPageTwo()}
        </div>
    </div>
  );
};

export default InvoiceForm;
