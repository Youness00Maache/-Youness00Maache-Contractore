import React, { useState } from 'react';
import type { InvoiceData, LineItem, Job, UserProfile } from '../types';
import { generateInvoicePDF } from '../services/pdfGenerator';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './ui/Card.tsx';
import { Label } from './ui/Label.tsx';
import { Input } from './ui/Input.tsx';
import { Button } from './ui/Button.tsx';
import { BackArrowIcon } from './Icons.tsx';

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
  const [isSaving, setIsSaving] = useState(false);
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

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(invoiceData);
    } catch (error) {
      console.error('Error saving invoice:', error);
      alert('Failed to save invoice. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };
  
  const handleDownload = () => {
    generateInvoicePDF(userProfile, job, invoiceData);
  };

  const handleSaveAndDownload = async () => {
    setIsSaving(true);
    try {
      await onSave(invoiceData);
      handleDownload();
    } catch (error) {
      console.error('Error saving and downloading invoice:', error);
      alert('Failed to save invoice. Please try again.');
    } finally {
      setIsSaving(false);
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
                    <h3 className="text-lg font-semibold border-b pb-2">Bill To</h3>
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
                <h3 className="text-lg font-semibold border-b pb-2">Company Logo</h3>
                <div className="flex flex-col space-y-1.5 mt-4">
                    <Label htmlFor="logoUrl">Upload Logo</Label>
                    <Input id="logoUrl" type="file" accept="image/*" onChange={handleFileChange} className="pt-2" />
                    {invoiceData.logoUrl && <img src={invoiceData.logoUrl} alt="Logo Preview" className="mt-2 h-20 w-auto object-contain bg-muted p-2 rounded-md self-start" />}
                </div>
             </div>
        </CardContent>
        <CardFooter className="flex justify-end space-x-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={() => setPage(2)}>Next</Button>
        </CardFooter>
    </Card>
  );

  const renderPageTwo = () => (
    <Card className="w-full max-w-4xl relative animate-fade-in-down my-8">
        <header className="grid grid-cols-3 items-center p-4 border-b">
            <div className="flex justify-start">
                 <Button variant="ghost" size="sm" onClick={() => setPage(1)} className="w-12 h-12 p-0 flex items-center justify-center" aria-label="Back">
                    <BackArrowIcon className="h-9 w-9" />
                </Button>
            </div>
            <div className="text-center">
                <CardTitle>Create Invoice</CardTitle>
                <CardDescription className="whitespace-nowrap">For {invoiceData.clientName}</CardDescription>
            </div>
            <div className="flex justify-end">
                <div className="w-12"></div>
            </div>
        </header>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              <div className="flex flex-col space-y-1.5">
                  <Label htmlFor="invoiceNumber">Invoice #</Label>
                  <Input id="invoiceNumber" type="text" name="invoiceNumber" value={invoiceData.invoiceNumber} onChange={handleInputChange} />
              </div>
              <div className="flex flex-col space-y-1.5">
                  <Label htmlFor="issueDate">Issue Date</Label>
                  <Input id="issueDate" type="date" name="issueDate" value={invoiceData.issueDate} onChange={handleInputChange} />
              </div>
              <div className="flex flex-col space-y-1.5">
                  <Label htmlFor="dueDate">Due Date</Label>
                  <Input id="dueDate" type="date" name="dueDate" value={invoiceData.dueDate} onChange={handleInputChange}/>
              </div>
          </div>

          {/* Line Items Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground uppercase bg-muted">
                    <tr>
                        <th scope="col" className="px-4 py-3 font-medium">Description</th>
                        <th scope="col" className="px-4 py-3 w-24 font-medium">Quantity</th>
                        <th scope="col" className="px-4 py-3 w-48 font-medium">Rate</th>
                        <th scope="col" className="px-4 py-3 w-48 text-right font-medium">Amount</th>
                        <th scope="col" className="px-4 py-3 w-12"></th>
                    </tr>
                </thead>
                <tbody>
                    {invoiceData.lineItems.map((item) => (
                        <tr key={item.id} className="border-b dark:border-gray-700 hover:bg-muted/50 align-top">
                            <td className="px-2 py-1">
                                <textarea
                                    value={item.description}
                                    onChange={(e) => handleLineItemChange(item.id, 'description', e.target.value)}
                                    onInput={(e) => {
                                        const target = e.target as HTMLTextAreaElement;
                                        target.style.height = 'auto';
                                        target.style.height = `${target.scrollHeight}px`;
                                    }}
                                    rows={1}
                                    placeholder="Item description"
                                    className="w-full bg-transparent border-none focus:ring-0 p-1 resize-none overflow-hidden leading-tight"
                                    style={{ minHeight: '2.5rem' }}
                                />
                            </td>
                            <td className="px-2 py-1">
                                <Input type="number" value={item.quantity} onChange={(e) => handleLineItemChange(item.id, 'quantity', parseFloat(e.target.value) || 0)} className="w-full bg-transparent border-none focus:ring-0 p-1"/>
                            </td>
                            <td className="px-2 py-1">
                                <Input type="number" value={item.rate} onChange={(e) => handleLineItemChange(item.id, 'rate', parseFloat(e.target.value) || 0)} className="w-full bg-transparent border-none focus:ring-0 p-1"/>
                            </td>
                            <td className="px-4 py-2 font-medium text-right">${(item.quantity * item.rate).toFixed(2)}</td>
                            <td className="px-4 py-1 text-center">
                                <button onClick={() => removeLineItem(item.id)} className="text-muted-foreground hover:text-destructive font-bold mt-1.5">&times;</button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
          </div>
          <Button onClick={addLineItem} variant="link" className="mt-2 px-0 text-primary hover:text-primary/90 text-sm font-semibold">+ Add Item</Button>

          {/* Totals Section */}
          <div className="flex justify-end mt-6">
            <div className="w-full max-w-sm space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal:</span>
                <span className="font-medium">${subtotal.toFixed(2)}</span>
              </div>
               <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Discount ($):</span>
                <Input type="number" name="discount" value={invoiceData.discount} onChange={handleInputChange} className="w-20 h-8 text-right"/>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Tax (%):</span>
                <Input type="number" name="taxRate" value={invoiceData.taxRate} onChange={handleInputChange} className="w-20 h-8 text-right"/>
              </div>
               <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Shipping ($):</span>
                <Input type="number" name="shipping" value={invoiceData.shipping} onChange={handleInputChange} className="w-20 h-8 text-right"/>
              </div>
              <div className="flex justify-between border-t pt-2 mt-2 dark:border-gray-600">
                <span className="font-bold text-lg">Total:</span>
                <span className="font-bold text-lg">${total.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="mt-8">
              <Label htmlFor="notes">Notes</Label>
              <textarea id="notes" name="notes" value={invoiceData.notes} onChange={handleInputChange} rows={3} className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"></textarea>
          </div>
          
          {/* Payment Options */}
          <div className="mt-8">
            <h3 className="text-lg font-semibold border-b pb-2 mb-4">Payment Options</h3>
            <div className="flex flex-col space-y-1.5">
                <Label htmlFor="paypalLink">PayPal Payment Link</Label>
                <Input
                    id="paypalLink"
                    type="url"
                    name="paypalLink"
                    value={invoiceData.paypalLink || ''}
                    onChange={handleInputChange}
                    placeholder="https://paypal.me/yourusername"
                />
                <p className="text-xs text-muted-foreground pt-1">Add your PayPal link to allow clients to pay directly from the PDF.</p>
            </div>
          </div>

        </CardContent>
        <CardFooter className="flex justify-between items-center">
             <Button variant="outline" onClick={onClose} disabled={isSaving}>Cancel</Button>
            <div className="flex space-x-2">
                <Button variant="secondary" onClick={handleSave} disabled={isSaving}>
                  {isSaving ? 'Saving...' : 'Save Invoice'}
                </Button>
                <Button variant="secondary" onClick={handleDownload} disabled={isSaving}>
                  {isSaving ? 'Saving...' : 'Download PDF'}
                </Button>
                <Button onClick={handleSaveAndDownload} disabled={isSaving}>
                  {isSaving ? 'Saving...' : 'Save & Download'}
                </Button>
            </div>
        </CardFooter>
      </Card>
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-start pt-10 z-50 overflow-y-auto">
      {page === 1 ? renderPageOne() : renderPageTwo()}
    </div>
  );
};

export default InvoiceForm;