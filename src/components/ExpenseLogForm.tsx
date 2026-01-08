import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { ExpenseLogData, ExpenseItem, UserProfile, Job, Client } from '../types';
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from './ui/Card.tsx';
import { Label } from './ui/Label.tsx';
import { Input } from './ui/Input.tsx';
import { Button } from './ui/Button.tsx';
import { BackArrowIcon, ExportIcon, ExpenseLogIcon, CameraIcon, UploadImageIcon, TrashIcon, PlusIcon } from './Icons.tsx';
import { generateExpenseLogPDF } from '../services/pdfGenerator.ts';
import TemplateSelector from './TemplateSelector.tsx';
import SignaturePad from './SignaturePad.tsx';
import { compressImage } from '../utils/imageCompression.ts';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';

// Tesseract is loaded via CDN in index.html
declare const Tesseract: any;

interface Props {
  job: Job;
  profile: UserProfile;
  data: ExpenseLogData | null;
  clients?: Client[];
  onSave: (data: ExpenseLogData) => void;
  onBack: () => void;
  onUploadImage?: (file: File) => Promise<string>;
}

const expenseItemSchema = z.object({
  id: z.string(),
  description: z.string().min(1, "Description is required"),
  amount: z.coerce.number().min(0, "Amount must be positive"),
});

const formSchema = z.object({
  title: z.string().optional(),
  date: z.string().min(1, "Date is required"),
  vendor: z.string().min(1, "Vendor name is required"),
  category: z.enum(['Fuel', 'Food', 'Material', 'Other']),
  items: z.array(expenseItemSchema),
  amount: z.coerce.number(),
  notes: z.string().optional(),
  companyName: z.string().optional(),
  companyAddress: z.string().optional(),
  companyPhone: z.string().optional(),
  companyWebsite: z.string().optional(),
  clientName: z.string().optional(),
  logoUrl: z.string().optional(),
  signatureUrl: z.string().optional(),
  templateId: z.string().optional(),
  themeColors: z.object({
      primary: z.string(),
      secondary: z.string()
  }).optional()
});

const ExpenseLogForm: React.FC<Props> = ({ job, profile, data, clients = [], onSave, onBack, onUploadImage }) => {
  const [isDownloading, setIsDownloading] = useState(false);
  const [isProcessingOCR, setIsProcessingOCR] = useState(false);
  
  // Camera State
  const [showCameraModal, setShowCameraModal] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Initialize React Hook Form
  const { register, control, handleSubmit, setValue, watch, getValues, formState: { errors, isSubmitting } } = useForm<ExpenseLogData>({
    resolver: zodResolver(formSchema),
    defaultValues: data ? {
        ...data,
        items: data.items || (data as any).item ? [{ id: crypto.randomUUID(), description: (data as any).item, amount: data.amount || 0 }] : [{ id: crypto.randomUUID(), description: '', amount: 0 }]
    } : {
        title: '',
        date: new Date().toISOString().split('T')[0],
        vendor: '',
        category: 'Material',
        items: [{ id: crypto.randomUUID(), description: '', amount: 0 }],
        amount: 0,
        notes: '',
        companyName: profile.companyName,
        companyAddress: profile.address,
        companyPhone: profile.phone,
        companyWebsite: profile.website,
        clientName: job.clientName,
        logoUrl: profile.logoUrl,
        signatureUrl: '',
        templateId: 'standard',
        themeColors: { primary: '#000000', secondary: '#666666' }
    }
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "items"
  });

  // Watch items to automatically update total amount
  const watchedItems = watch("items");
  useEffect(() => {
    const total = watchedItems.reduce((acc, item) => acc + (Number(item.amount) || 0), 0);
    setValue('amount', total);
  }, [watchedItems, setValue]);

  // Sync profile info if missing
  useEffect(() => {
    const currentValues = getValues();
    if (!currentValues.companyName && profile.companyName) setValue('companyName', profile.companyName);
    if (!currentValues.companyAddress && profile.address) setValue('companyAddress', profile.address);
    if (!currentValues.logoUrl && profile.logoUrl) setValue('logoUrl', profile.logoUrl);
  }, [profile, setValue, getValues]);

  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (onUploadImage) {
          try {
              const newUrl = await onUploadImage(file);
              if (newUrl) setValue('logoUrl', newUrl);
          } catch (e) { console.error(e); }
      } else {
          const reader = new FileReader();
          reader.onload = (event) => {
            setValue('logoUrl', event.target?.result as string);
          };
          reader.readAsDataURL(file);
      }
    }
  };

  const handleClientSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
      const clientId = e.target.value;
      if (clientId === 'custom') return;
      const client = clients.find(c => c.id === clientId);
      if (client) setValue('clientName', client.name);
  };

  /**
   * Refined OCR Parsing Heuristics
   */
  const processReceiptImage = async (image: File | Blob) => {
      if (typeof Tesseract === 'undefined') {
          alert("OCR library not loaded yet. Please wait a moment.");
          return;
      }
      setIsProcessingOCR(true);
      try {
          const { data: { text } } = await Tesseract.recognize(image, 'eng', { logger: () => {} });
          const lines = text.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 0);
          
          let foundDate = '';
          let foundTotal = 0;
          let foundVendor = '';
          const detectedPrices: number[] = [];

          // Improved Regex Patterns
          const dateRegex = /(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})|([A-Z][a-z]{2,8}\s\d{1,2},?\s\d{4})/;
          const currencyRegex = /(\d+[\.,]\d{2})/;
          
          // 1. Identify Vendor (Top non-empty line that isn't a date or standard address component)
          for (let i = 0; i < Math.min(lines.length, 5); i++) {
              const line = lines[i];
              const isDate = dateRegex.test(line);
              const isAddress = /\d+\s+[A-Z]/.test(line); // Simplified check for "123 Main"
              if (line.length > 3 && !isDate && !isAddress && !foundVendor) {
                  foundVendor = line;
              }
          }

          // 2. Identify Total & Date
          lines.forEach((line: string) => {
              // Date Search
              if (!foundDate) {
                  const dateMatch = line.match(dateRegex);
                  if (dateMatch) {
                      const d = new Date(dateMatch[0]);
                      if (!isNaN(d.getTime())) {
                          const dd = String(d.getDate()).padStart(2, '0');
                          const mm = String(d.getMonth() + 1).padStart(2, '0');
                          const yyyy = d.getFullYear();
                          foundDate = `${yyyy}-${mm}-${dd}`; // ISO for date input
                      }
                  }
              }

              // Amount Extraction
              const priceMatch = line.match(currencyRegex);
              if (priceMatch) {
                  const val = parseFloat(priceMatch[1].replace(',', '.'));
                  if (!isNaN(val)) detectedPrices.push(val);
              }
          });

          // Fallback Total: Max detectable price
          if (detectedPrices.length > 0) {
              foundTotal = Math.max(...detectedPrices);
          }

          // 3. Auto-generate Title: Vendor - Date
          const displayDate = foundDate ? new Date(foundDate + 'T00:00:00').toLocaleDateString() : new Date().toLocaleDateString();
          const autoTitle = `${foundVendor || 'Vendor'} - ${displayDate}`;

          // Update Form via RHF
          setValue('title', autoTitle);
          if (foundVendor) setValue('vendor', foundVendor);
          if (foundDate) setValue('date', foundDate);
          
          // If we found a total, overwrite items with one entry
          if (foundTotal > 0) {
              setValue('items', [{ id: crypto.randomUUID(), description: `Purchase at ${foundVendor || 'Vendor'}`, amount: foundTotal }]);
          }
          
          const currentNotes = getValues('notes') || '';
          setValue('notes', currentNotes + '\n\n--- OCR Log ---\n' + text.substring(0, 200) + '...');

      } catch (e) {
          console.error("OCR Error", e);
          alert("Failed to scan receipt text.");
      } finally {
          setIsProcessingOCR(false);
      }
  };

  const handleScanUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
          processReceiptImage(e.target.files[0]);
      }
  };

  const startCamera = async () => {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          alert("Camera API is not supported.");
          return;
      }
      try {
          let stream;
          try {
            stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
          } catch(e) {
            stream = await navigator.mediaDevices.getUserMedia({ video: true });
          }
          streamRef.current = stream;
          setShowCameraModal(true);
      } catch (err: any) {
          alert("Error accessing camera: " + err.message);
      }
  };

  const stopCamera = () => {
      if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
      }
      setShowCameraModal(false);
  };

  const videoCallbackRef = useCallback((node: HTMLVideoElement) => {
      videoRef.current = node;
      if (node && streamRef.current) {
          node.srcObject = streamRef.current;
          node.play().catch(e => console.log("Play error:", e));
      }
  }, [showCameraModal]);

  const capturePhoto = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas) {
          const ctx = canvas.getContext('2d');
          if (ctx) {
              canvas.width = video.videoWidth;
              canvas.height = video.videoHeight;
              ctx.drawImage(video, 0, 0);
              
              canvas.toBlob((blob) => {
                  if (blob) {
                      processReceiptImage(blob);
                      stopCamera();
                  }
              }, 'image/jpeg', 0.9);
          }
      }
  };

  const onSubmit = (data: ExpenseLogData) => {
      onSave(data);
  };

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      const data = getValues();
      await generateExpenseLogPDF(profile, job, data, data.templateId || 'standard');
    } catch (e) { console.error(e); alert('Error generating PDF'); }
    finally { setIsDownloading(false); }
  }

  // Helper to sync TemplateSelector changes to form state
  const handleTemplateChange = (id: string) => setValue('templateId', id);
  const handleColorsChange = (colors: { primary: string, secondary: string }) => setValue('themeColors', colors);
  const handleSignatureSave = (url: string) => setValue('signatureUrl', url);

  const watchedLogo = watch('logoUrl');
  const watchedTemplate = watch('templateId');
  const watchedColors = watch('themeColors');
  const watchedSignature = watch('signatureUrl');

  return (
    <div className="w-full h-full bg-background text-foreground flex flex-col p-4 md:p-8 pb-24">
      {/* Camera Modal */}
      {showCameraModal && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4" onClick={stopCamera}>
                <Card className="w-full max-w-lg shadow-2xl" onClick={e => e.stopPropagation()}>
                    <CardHeader><CardTitle>Scan Receipt</CardTitle></CardHeader>
                    <CardContent><video ref={videoCallbackRef} autoPlay playsInline muted className="w-full h-auto max-h-[60vh] rounded-md bg-black" /><canvas ref={canvasRef} className="hidden" /></CardContent>
                    <CardFooter className="flex justify-end gap-2 p-4 bg-muted/20">
                        <Button variant="outline" onClick={stopCamera}>Cancel</Button>
                        <Button onClick={capturePhoto}><CameraIcon className="w-4 h-4 mr-2" /> Capture</Button>
                    </CardFooter>
                </Card>
            </div>
      )}

      <header className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
         <div className="flex items-center">
            <Button variant="ghost" size="sm" onClick={onBack} className="w-10 h-10 p-0 flex items-center justify-center mr-3 hover:bg-secondary/80 rounded-full" aria-label="Back">
                <BackArrowIcon className="h-6 w-6" />
            </Button>
            <div>
                <h1 className="text-2xl font-bold flex items-center gap-3 tracking-tight">
                    <ExpenseLogIcon className="w-6 h-6 text-primary" /> Expense Log
                </h1>
            </div>
        </div>
      </header>
      
      <div className="flex-1 overflow-y-auto">
          <form onSubmit={handleSubmit(onSubmit)}>
          <Card className="max-w-3xl mx-auto w-full animate-fade-in-down border-gray-400 dark:border-gray-600">
            <CardHeader className="flex flex-row justify-between items-start border-b border-border pb-4">
                <div>
                    <CardTitle>Log Expense</CardTitle>
                    <CardDescription>Track project costs manually or by scanning a receipt.</CardDescription>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" size="sm" type="button" className="h-9" onClick={() => document.getElementById('scan-upload')?.click()}>
                        <UploadImageIcon className="w-4 h-4 mr-2" /> Upload
                        <input id="scan-upload" type="file" accept="image/*" className="hidden" onChange={handleScanUpload} />
                    </Button>
                    <Button variant="outline" size="sm" type="button" className="h-9" onClick={startCamera}>
                        <CameraIcon className="w-4 h-4 mr-2" /> Scan Camera
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
              
              {isProcessingOCR && (
                  <div className="p-4 bg-primary/10 text-primary rounded-lg flex items-center justify-center animate-pulse border border-primary/20 font-medium">
                      Smart-Scanning Receipt...
                  </div>
              )}

              <div className="space-y-1.5">
                  <Label>Title (Automatic)</Label>
                  <Input 
                    {...register('title')}
                    placeholder="Auto-generated: Vendor - Date" 
                    className="font-medium h-11 bg-muted/5"
                  />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-t border-border pt-4">
                  <div className="space-y-3 bg-muted/20 p-3 rounded-md border border-border/50">
                      <Label className="text-xs text-muted-foreground uppercase font-bold">Company Info</Label>
                      <Input {...register('companyName')} placeholder="Your Company" />
                      <Input {...register('companyAddress')} placeholder="Address" />
                      <div className="flex items-center gap-3 mt-2">
                          {watchedLogo && <img src={watchedLogo} className="w-10 h-10 object-contain bg-white rounded border p-1" />}
                          <div className="flex-1"><Label htmlFor="logoUpload" className="text-xs cursor-pointer text-primary hover:underline">Logo</Label><Input id="logoUpload" type="file" className="h-8 text-xs" accept="image/*" onChange={handleLogoChange} /></div>
                      </div>
                  </div>
                  <div className="space-y-3 bg-muted/20 p-3 rounded-md border border-border/50">
                      <div className="flex flex-col space-y-1.5">
                          <Label className="text-xs text-muted-foreground uppercase font-bold">Client / Job</Label>
                          <div className="h-9 px-3 py-1 bg-background border border-input rounded-md flex items-center text-sm text-muted-foreground font-medium">
                              {job.clientName}
                          </div>
                      </div>
                      <Label className="text-[10px] text-muted-foreground italic">Note: Tied to Job context.</Label>
                  </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                      <Label>Date</Label>
                      <Input type="date" {...register('date')} className={errors.date ? "border-red-500" : ""} />
                      {errors.date && <span className="text-xs text-red-500">{errors.date.message}</span>}
                  </div>
                  <div>
                      <Label>Category</Label>
                      <select {...register('category')} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                          <option value="Material">Material</option>
                          <option value="Fuel">Fuel</option>
                          <option value="Food">Food</option>
                          <option value="Other">Other</option>
                      </select>
                  </div>
                  <div className="md:col-span-2">
                      <Label>Vendor / Store</Label>
                      <Input {...register('vendor')} placeholder="e.g. Home Depot" className={errors.vendor ? "border-red-500" : ""} />
                      {errors.vendor && <span className="text-xs text-red-500">{errors.vendor.message}</span>}
                  </div>
              </div>

              {/* Line Items Section */}
              <div className="space-y-4 pt-4 border-t border-border">
                  <div className="flex justify-between items-center">
                    <Label className="text-base font-bold">Expense Items</Label>
                    <Button type="button" variant="outline" size="sm" onClick={() => append({ id: crypto.randomUUID(), description: '', amount: 0 })} className="h-8 text-xs">
                        <PlusIcon className="w-3 h-3 mr-1" /> Add Row
                    </Button>
                  </div>
                  
                  <div className="space-y-3">
                      {fields.map((item, index) => (
                          <div key={item.id} className="grid grid-cols-12 gap-2 items-center animate-in slide-in-from-left-2 duration-300">
                              <div className="col-span-8">
                                  <Input 
                                    {...register(`items.${index}.description`)}
                                    placeholder="Item Description" 
                                    className={errors.items?.[index]?.description ? "border-red-500" : ""}
                                  />
                              </div>
                              <div className="col-span-3">
                                  <div className="relative">
                                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">$</span>
                                      <Input 
                                        type="number" 
                                        className="pl-6"
                                        {...register(`items.${index}.amount`)}
                                        placeholder="0.00"
                                      />
                                  </div>
                              </div>
                              <div className="col-span-1 flex justify-center">
                                  <Button 
                                    type="button"
                                    variant="ghost" 
                                    size="sm" 
                                    onClick={() => remove(index)}
                                    className="text-muted-foreground hover:text-destructive h-9 w-9 p-0"
                                    disabled={fields.length === 1}
                                  >
                                      <TrashIcon className="w-4 h-4" />
                                  </Button>
                              </div>
                          </div>
                      ))}
                  </div>
              </div>

              {/* Final Totals Display */}
              <div className="flex justify-end items-center gap-4 bg-muted/30 p-4 rounded-xl border border-border/50">
                  <span className="text-sm font-bold uppercase text-muted-foreground">Total Expense:</span>
                  <span className="text-2xl font-bold text-primary font-mono">${(watch('amount') || 0).toFixed(2)}</span>
              </div>

              <div className="md:col-span-2 pt-2">
                  <Label>Notes</Label>
                  <textarea 
                    {...register('notes')}
                    className="w-full p-3 border rounded-md bg-background text-sm focus:ring-2 focus:ring-primary outline-none" 
                    rows={3} 
                    placeholder="Optional notes..." 
                  />
              </div>

              <div className="pt-4">
                  <Label className="mb-2 block font-semibold text-sm">Approver Signature (Optional)</Label>
                  <div className="mt-1 border rounded-md overflow-hidden bg-white">
                      <SignaturePad onSave={handleSignatureSave} initialDataUrl={watchedSignature} />
                  </div>
              </div>

              <div className="pt-4 border-t border-border">
                 <TemplateSelector 
                    selectedTemplateId={watchedTemplate || 'standard'} 
                    onSelectTemplate={handleTemplateChange} 
                    themeColors={watchedColors} 
                    onColorsChange={handleColorsChange} 
                 />
              </div>
            </CardContent>
            <CardFooter className="flex flex-col sm:flex-row gap-2 w-full justify-end bg-muted/20 p-6">
                <Button variant="outline" type="submit" disabled={isSubmitting} className="w-full sm:w-auto h-11">
                    {isSubmitting ? 'Saving...' : 'Save Log'}
                </Button>
                <Button variant="secondary" type="button" onClick={handleDownload} disabled={isDownloading} className="w-full sm:w-auto h-11"><ExportIcon className="h-4 w-4 mr-2"/> Download PDF</Button>
                <Button type="button" onClick={handleSubmit(async (d) => { await onSave(d); await handleDownload(); })} disabled={isDownloading || isSubmitting} className="w-full sm:w-auto h-11">Save & Download</Button>
            </CardFooter>
          </Card>
          </form>
      </div>
    </div>
  );
};
export default ExpenseLogForm;