import React, { useState } from 'react';
import type { InvoiceData, LineItem, Job, UserProfile } from '../types';
import { generateInvoicePDF } from '../services/pdfGenerator';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './ui/Card.tsx';
import { Label } from './ui/Label.tsx';
import { Input } from './ui/Input.tsx';
import { Button } from './ui/Button.tsx';

interface InvoiceFormProps {
  job: Job;
  userProfile: UserProfile;
  invoice: InvoiceData | null;
  onSave: (invoiceData: InvoiceData) => void;
  onClose: () => void;
}

const defaultInvoice: InvoiceData = {
  invoiceNumber: `INV-${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-001`,
  issueDate: new Date().toISOString().split('T')[0],
  dueDate: new Date(new Date().setDate(new Date().getDate() + 30)).toISOString().split('T')[0],
  lineItems: [{ id: crypto.randomUUID(), description: '', quantity: 1, rate: 0 }],
  taxRate: 0,
  notes: 'Thank you for your business.',
};

const InvoiceForm: React.FC<InvoiceFormProps> = ({ job, userProfile, invoice, onSave, onClose }) => {
  const [invoiceData, setInvoiceData] = useState<InvoiceData>(invoice || defaultInvoice);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setInvoiceData(prev => ({ ...prev, [name]: value }));
  };

  const handleLineItemChange = (id: string, field: keyof LineItem, value: string | number) => {
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
    return invoiceData.lineItems.reduce((acc, item) => acc + item.quantity * item.rate, 0);
  };
  
  const subtotal = calculateSubtotal();
  const taxAmount = subtotal * (invoiceData.taxRate / 100);
  const total = subtotal + taxAmount;

  const handleSave = () => {
    onSave(invoiceData);
  };
  
  const handleExport = () => {
    generateInvoicePDF(userProfile, job, invoiceData);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-start pt-10 z-50 overflow-y-auto">
      <Card className="w-full max-w-4xl relative animate-fade-in-down my-8">
        <button onClick={onClose} className="absolute top-4 right-4 text-muted-foreground hover:text-foreground z-10">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
        <CardHeader>
          <CardTitle>Invoice</CardTitle>
          <CardDescription>Create a new invoice for {job.clientName}.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div>
              <h3 className="font-bold text-lg">{userProfile.companyName}</h3>
              <p className="text-sm text-muted-foreground">{userProfile.address}</p>
              <p className="text-sm text-muted-foreground">{userProfile.email}</p>
            </div>
            <div className="text-left md:text-right">
              <h3 className="font-bold text-lg">Bill To:</h3>
              <p>{job.clientName}</p>
              <p className="text-sm text-muted-foreground">{job.clientAddress}</p>
            </div>
          </div>
          
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
                <thead className="text-xs text-muted-foreground uppercase">
                    <tr>
                        <th scope="col" className="px-4 py-3">Description</th>
                        <th scope="col" className="px-4 py-3 w-24">Quantity</th>
                        <th scope="col" className="px-4 py-3 w-28">Rate</th>
                        <th scope="col" className="px-4 py-3 w-28 text-right">Total</th>
                        <th scope="col" className="px-4 py-3 w-12"></th>
                    </tr>
                </thead>
                <tbody>
                    {invoiceData.lineItems.map((item) => (
                        <tr key={item.id} className="border-b dark:border-gray-700">
                            <td className="px-4 py-1"><Input type="text" value={item.description} onChange={(e) => handleLineItemChange(item.id, 'description', e.target.value)} className="w-full bg-transparent border-none focus:ring-0 p-1"/></td>
                            <td className="px-4 py-1"><Input type="number" value={item.quantity} onChange={(e) => handleLineItemChange(item.id, 'quantity', parseFloat(e.target.value) || 0)} className="w-full bg-transparent border-none focus:ring-0 p-1"/></td>
                            <td className="px-4 py-1"><Input type="number" value={item.rate} onChange={(e) => handleLineItemChange(item.id, 'rate', parseFloat(e.target.value) || 0)} className="w-full bg-transparent border-none focus:ring-0 p-1"/></td>
                            <td className="px-4 py-1 font-medium text-right">${(item.quantity * item.rate).toFixed(2)}</td>
                            <td className="px-4 py-1"><button onClick={() => removeLineItem(item.id)} className="text-red-500 hover:text-red-700">&times;</button></td>
                        </tr>
                    ))}
                </tbody>
            </table>
          </div>
          <button onClick={addLineItem} className="mt-4 text-primary hover:text-primary/90 text-sm font-semibold">+ Add Item</button>

          {/* Totals Section */}
          <div className="flex justify-end mt-6">
            <div className="w-full max-w-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal:</span>
                <span className="font-medium">${subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Tax (%):</span>
                <Input type="number" name="taxRate" value={invoiceData.taxRate} onChange={handleInputChange} className="w-20 h-8"/>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tax Amount:</span>
                <span className="font-medium">${taxAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between border-t pt-2 dark:border-gray-600">
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

        </CardContent>
        <CardFooter className="flex justify-end space-x-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave}>Save Invoice</Button>
            <Button variant="secondary" onClick={handleExport} className="flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                Export PDF
            </Button>
        </CardFooter>
      </Card>
    </div>
  );
};

export default InvoiceForm;
