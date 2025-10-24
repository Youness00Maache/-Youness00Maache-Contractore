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
  notes: string;
}

export interface WorkOrderData {
  title: string;
  date: string;
  description: string;
  materialsUsed: string;
  hours: number;
  cost: number;
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