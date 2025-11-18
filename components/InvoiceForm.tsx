
import React, { useState } from 'react';
import type { InvoiceData, LineItem, Job, UserProfile } from '../types';
import { generateInvoicePDF } from '../services/pdfGenerator';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './ui/Card.tsx';
import { Label } from './ui/Label.tsx';
import { Input } from './ui/Input.tsx';
import { Button } from './ui/Button.tsx';
import { BackArrowIcon, ExportIcon } from './Icons.tsx';
import TemplateSelector from './TemplateSelector.tsx';

interface InvoiceFormProps {
  job: Job;
  userProfile: UserProfile;
  invoice: InvoiceData | null;
  onSave: (invoiceData: InvoiceData) => void;
  onClose: () => void;
}

const defaultInvoice: Omit<InvoiceData, 'clientName' | 'clientAddress' | 'companyName' | 'companyAddress' | 'companyPhone' | 'companyWebsite' | 'logoUrl'> = {
  invoiceNumber: `INV-${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-001`,
  issueDate: new Date().toISOString().split('T')[0],
  dueDate: new Date(new Date().setDate(new Date().getDate() + 30)).toISOString().split('T')[0],
  lineItems: [{ id: crypto.randomUUID(), description: '', quantity: 1, rate: 0 }],
  taxRate: 0,
  discount: 0,
  shipping: 0,
  notes: 'Thank you for your business.',
  paypalLink: '',
};

const InvoiceForm: React.FC<InvoiceFormProps> = ({ job, userProfile, invoice, onSave, onClose }) => {
  const [page, setPage] = useState(1);
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
    }
  );
  const [templateId, setTemplateId] = useState('standard');
  const [isDownloading, setIsDownloading] = useState(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setInvoiceData(prev => ({ ...prev, [name]: name === 'taxRate' || name === 'discount' || name === 'shipping' ? parseFloat(value) || 0 : value }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setInvoiceData(prev => ({ ...prev, logoUrl: event.target?.result as string }));
      };
      reader.readAsDataURL(e.target.files[0]);
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
      lineItems: [...prev.lineItems, { id: crypto.randomUUID(), description: '', quantity: 1, rate: 0 }],
    }));
  };

  const removeLineItem = (id: string) => {
    setInvoiceData(prev => ({
      ...prev,
      lineItems: prev.lineItems.filter(item => item.id !== id),
    }));
  };

  const calculateSubtotal = () => {
    return invoiceData.lineItems.reduce((acc, item) => acc + (Number(item.quantity) || 0) * (Number(item.rate) || 0), 0);
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
      await generateInvoicePDF(userProfile, job, invoiceData, templateId);
    } catch (error) {
      console.error("Failed to generate PDF:", error);
      alert("An error occurred while generating the PDF. Please check the browser console for more details.");
    } finally {
      setIsDownloading(false);
    }
  };

  const renderPageOne = () => (
    <Card className="w-full max-w-4xl animate-fade-in-down my-8">
        <CardHeader>
            <CardTitle>Invoice Setup</CardTitle>
            <CardDescription>Confirm the details for this invoice. Changes made here will only apply to this document.</CardDescription>
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
                <h3 className="text-lg font-semibold border-b pb-2">Invoice Details & Logo</h3>
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

        </CardContent>
        <CardFooter className="flex justify-between">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={() => setPage(2)}>Next</Button>
        </CardFooter>
    </Card>
  );

  const renderPageTwo = () => (
    <Card className="w-full max-w-4xl animate-fade-in-down my-8">
      <CardHeader>
        <CardTitle>Invoice Items</CardTitle>
        <CardDescription>Add the services or products you are billing for.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Line Items */}
        <div className="space-y-4">
          <div className="grid grid-cols-12 gap-2 text-sm font-medium text-muted-foreground px-2">
            <div className="col-span-5">Description</div>
            <div className="col-span-2">Quantity</div>
            <div className="col-span-2">Rate</div>
            <div className="col-span-2">Amount</div>
            <div className="col-span-1"></div>
          </div>
          {invoiceData.lineItems.map((item) => (
            <div key={item.id} className="grid grid-cols-12 gap-2 items-center">
              <div className="col-span-5">
                <Input
                  type="text"
                  placeholder="Service or product description"
                  value={item.description}
                  onChange={(e) => handleLineItemChange(item.id, 'description', e.target.value)}
                />
              </div>
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
                <div className="flex items-center justify-end h-10 px-3 py-2 text-sm">
                  ${((Number(item.quantity) || 0) * (Number(item.rate) || 0)).toFixed(2)}
                </div>
              </div>
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
          {/* PayPal Link */}
          <div>
            <Label htmlFor="paypalLink">PayPal Payment Link (Optional)</Label>
            <Input
              id="paypalLink"
              name="paypalLink"
              type="url"
              placeholder="https://paypal.me/yourusername"
              value={invoiceData.paypalLink || ''}
              onChange={handleInputChange}
              className="mt-1"
            />
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

          <div className="pt-4 border-t border-border">
             <TemplateSelector selected={templateId} onSelect={setTemplateId} />
          </div>
        </div>

      </CardContent>
      <CardFooter className="flex justify-between">
        <Button variant="outline" onClick={() => setPage(1)}>Back</Button>
        <div className="flex gap-2 flex-wrap justify-end">
             <Button variant="outline" onClick={() => handleSave()}>Save Only</Button>
            <Button variant="secondary" onClick={handleDownload} disabled={isDownloading}>
              <ExportIcon className="h-4 w-4 mr-2"/> {isDownloading ? 'Downloading...' : 'Download PDF'}
            </Button>
            <Button onClick={async () => { handleSave(); await handleDownload(); }} disabled={isDownloading}>
              {isDownloading ? 'Saving...' : 'Save & Download'}
            </Button>
        </div>
      </CardFooter>
    </Card>
  );

  return (
    <div className="w-full h-full bg-background text-foreground flex flex-col p-4 md:p-8">
        <header className="grid grid-cols-3 items-center pb-4 border-b border-border mb-4">
             <div className="flex justify-start">
                <Button variant="ghost" size="sm" onClick={onClose} className="w-12 h-12 p-0 flex items-center justify-center" aria-label="Back">
                    <BackArrowIcon className="h-9 w-9" />
                </Button>
            </div>
            <h1 className="text-xl font-bold text-center whitespace-nowrap">Create Invoice</h1>
            <div className="flex items-center gap-2 justify-end">
                {/* placeholder for potential actions */}
            </div>
        </header>
        <div className="flex-1 flex items-start justify-center overflow-y-auto">
             {page === 1 ? renderPageOne() : renderPageTwo()}
        </div>
    </div>
  );
};

export default InvoiceForm;
