

export enum FormType {
  WorkOrder = "Work Order",
  DailyJobReport = "Daily Job Report",
  TimeSheet = "Time Sheet",
  MaterialLog = "Material Log",
  Invoice = "Invoice",
  Estimate = "Estimate",
  ExpenseLog = "Expense Log",
  Warranty = "Warranty",
  Note = "Note",
  Receipt = "Receipt",
}

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  companyName: string;
  logoUrl: string;
  address: string;
  phone: string;
  website: string;
  jobTitle?: string;
  subscriptionTier?: 'Basic' | 'Premium';
  language?: string;
}

export interface Client {
  id: string;
  user_id: string;
  name: string;
  address: string;
  email: string;
  phone: string;
  notes?: string;
  created_at?: string;
}

export interface Job {
  id:string;
  userId: string;
  name: string;
  clientName: string;
  clientAddress: string;
  startDate: string;
  endDate: string | null;
  status: 'active' | 'completed' | 'pending';
}

export interface LineItem {
  id: string;
  description: string;
  quantity: number;
  rate: number;
}

export interface InvoiceData {
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  lineItems: LineItem[];
  taxRate: number; // as a percentage, e.g., 8 for 8%
  discount?: number; // as a currency amount
  shipping?: number; // as a currency amount
  notes: string;
  paypalLink?: string;
  status: 'Draft' | 'Sent' | 'Paid' | 'Overdue' | 'Cancelled';
  // Per-invoice customizable fields
  companyName?: string;
  companyAddress?: string;
  companyPhone?: string;
  companyWebsite?: string;
  clientName?: string;
  clientAddress?: string;
  logoUrl?: string; // Can be a URL from settings or a base64 string from upload
}

export interface WorkOrderData {
  title: string;
  date: string;
  description: string;
  materialsUsed: string;
  hours: number;
  cost: number;
  signatureUrl?: string;
}

export interface DailyJobReportData {
  reportNumber: string;
  date: string;
  weather: string;
  temperature: string;
  logoUrl: string; // Base64 data URL
  signatureUrl: string; // Base64 data URL
  content: string; // HTML string from the rich text editor
  projectName: string;
  clientName: string;
  projectAddress: string;
  tags?: string[];
  // Per-report customizable company fields
  companyName?: string;
  companyAddress?: string;
  companyPhone?: string;
  companyWebsite?: string;
}

export interface TimeSheetData {
  workerName: string;
  date: string;
  hoursWorked: number;
  overtimeHours: number;
  notes: string;
}

export interface MaterialLogItem {
  id: string;
  name: string;
  supplier: string;
  quantity: number;
  unitCost: number;
}

export interface MaterialLogData {
  date: string;
  items: MaterialLogItem[];
}

export interface EstimateData {
  estimateNumber: string;
  issueDate: string;
  expiryDate: string;
  lineItems: LineItem[];
  terms: string;
  notes: string;
  status: 'Draft' | 'Sent' | 'Accepted' | 'Rejected';
}

export interface ExpenseLogData {
  date: string;
  item: string;
  vendor: string;
  category: 'Fuel' | 'Food' | 'Material' | 'Other';
  amount: number;
}

export interface WarrantyData {
  completedDate: string;
  duration: string;
  coverage: string;
  conditions: string;
  signatureUrl?: string;
}

export interface NoteData {
  title: string;
  content: string;
  tags: string[];
}

export interface ReceiptData {
    date: string;
    from: string;
    amount: number;
    description: string;
    paymentMethod: string;
}

export interface FormData {
  id: string;
  jobId: string;
  type: FormType;
  createdAt: string;
  data: InvoiceData | WorkOrderData | DailyJobReportData | TimeSheetData | MaterialLogData | EstimateData | ExpenseLogData | WarrantyData | NoteData | ReceiptData;
}