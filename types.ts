

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
  logoUrl: string; // Company Logo
  profilePictureUrl?: string; // User Profile Picture
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
  status: 'active' | 'completed' | 'inactive' | 'paused';
}

export interface LineItem {
  id: string;
  description: string;
  quantity: number;
  rate: number;
}

// Base interface for styling
export interface DocumentStyle {
    templateId?: string;
    themeColors?: {
        primary: string;
        secondary: string;
    };
}

export interface InvoiceData extends DocumentStyle {
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  lineItems: LineItem[];
  taxRate: number;
  discount?: number;
  shipping?: number;
  notes: string;
  paypalLink?: string;
  status: 'Draft' | 'Sent' | 'Paid' | 'Overdue' | 'Cancelled';
  companyName?: string;
  companyAddress?: string;
  companyPhone?: string;
  companyWebsite?: string;
  clientName?: string;
  clientAddress?: string;
  logoUrl?: string;
  signatureUrl?: string;
}

export interface WorkOrderData extends DocumentStyle {
  workOrderNumber: string;
  date: string;
  status: 'Scheduled' | 'In Progress' | 'On Hold' | 'Completed';
  description: string;
  materialsUsed: string;
  hours: number;
  cost: number;
  terms: string;
  companyName?: string;
  companyAddress?: string;
  companyPhone?: string;
  companyWebsite?: string;
  clientName?: string;
  clientAddress?: string;
  signatureUrl?: string;
  logoUrl?: string;
}

export interface DailyJobReportData extends DocumentStyle {
  reportNumber: string;
  date: string;
  weather: string;
  temperature: string;
  logoUrl: string;
  signatureUrl: string;
  content: string;
  projectName: string;
  clientName: string;
  projectAddress: string;
  tags?: string[];
  companyName?: string;
  companyAddress?: string;
  companyPhone?: string;
  companyWebsite?: string;
}

export interface TimeSheetData extends DocumentStyle {
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

export interface MaterialLogData extends DocumentStyle {
  date: string;
  items: MaterialLogItem[];
}

export interface EstimateData extends DocumentStyle {
  estimateNumber: string;
  issueDate: string;
  expiryDate: string;
  lineItems: LineItem[];
  terms: string;
  notes: string;
  status: 'Draft' | 'Sent' | 'Accepted' | 'Rejected';
  signatureUrl?: string;
  logoUrl?: string;
}

export interface ExpenseLogData extends DocumentStyle {
  date: string;
  item: string;
  vendor: string;
  category: 'Fuel' | 'Food' | 'Material' | 'Other';
  amount: number;
}

export interface WarrantyData extends DocumentStyle {
  warrantyNumber: string;
  clientName: string;
  projectAddress: string;
  completedDate: string;
  duration: string;
  coverage: string;
  conditions: string;
  signatureUrl?: string;
  logoUrl?: string;
}

export interface NoteData extends DocumentStyle {
  title: string;
  content: string;
  tags: string[];
}

export interface ReceiptData extends DocumentStyle {
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