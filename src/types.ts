
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
  ChangeOrder = "Change Order",
  PurchaseOrder = "Purchase Order",
}

export interface EmailTemplate {
    subject: string;
    body: string;
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
  emailTemplates?: Record<string, EmailTemplate>;
  emailUsage?: number; // Track number of emails sent
  // FIX: Added theme property to UserProfile interface to support theme persistence.
  theme?: 'light' | 'dark' | 'blue';
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

export interface InventoryItem {
  id: string;
  user_id: string;
  name: string;
  quantity: number;
  category?: string;
  low_stock_threshold?: number;
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
  title?: string;
}

export interface WorkOrderData extends DocumentStyle {
  title?: string;
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
  title?: string;
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
  title?: string;
  workerName: string;
  date: string;
  hoursWorked: number;
  overtimeHours: number;
  notes: string;
  companyName?: string;
  companyAddress?: string;
  companyPhone?: string;
  companyWebsite?: string;
  clientName?: string;
  clientAddress?: string;
  logoUrl?: string;
  signatureUrl?: string;
  status?: string;
}

export interface MaterialLogItem {
  id: string;
  name: string;
  supplier: string;
  quantity: number;
  unitCost: number;
}

export interface MaterialLogData extends DocumentStyle {
  title?: string;
  date: string;
  items: MaterialLogItem[];
  projectName: string;
  companyName?: string;
  companyAddress?: string;
  companyPhone?: string;
  companyWebsite?: string;
  clientName?: string;
  clientAddress?: string;
  logoUrl?: string;
  signatureUrl?: string;
}

export interface EstimateData extends DocumentStyle {
  title?: string;
  estimateNumber: string;
  issueDate: string;
  expiryDate: string;
  lineItems: LineItem[];
  terms: string;
  notes: string;
  status: 'Draft' | 'Sent' | 'Accepted' | 'Rejected';
  companyName?: string;
  companyAddress?: string;
  companyPhone?: string;
  companyWebsite?: string;
  clientName?: string;
  clientAddress?: string;
  logoUrl?: string;
  signatureUrl?: string;
}

export interface ExpenseLogData extends DocumentStyle {
  title?: string;
  date: string;
  item: string;
  vendor: string;
  category: 'Fuel' | 'Food' | 'Material' | 'Other';
  amount: number;
  notes?: string;
  companyName?: string;
  companyAddress?: string;
  companyPhone?: string;
  companyWebsite?: string;
  clientName?: string;
  logoUrl?: string;
  signatureUrl?: string;
}

export interface WarrantyData extends DocumentStyle {
  title?: string;
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

export interface ChangeOrderData extends DocumentStyle {
  title?: string;
  changeOrderNumber: string;
  date: string;
  description: string;
  reason: string; // e.g. "Client Request", "Unforeseen Condition"
  currentContractSum: number;
  lineItems: LineItem[];
  terms: string;
  companyName?: string;
  companyAddress?: string;
  companyPhone?: string;
  companyWebsite?: string;
  clientName?: string;
  clientAddress?: string;
  logoUrl?: string;
  signatureUrl?: string;
}

export interface PurchaseOrderData extends DocumentStyle {
  title?: string;
  poNumber: string;
  date: string;
  deliveryDate: string;
  status: 'Draft' | 'Sent' | 'Received' | 'Cancelled';
  
  // Vendor
  vendorName: string;
  vendorAddress: string;
  vendorPhone: string;
  vendorEmail: string;

  // Ship To Logic
  shipToType: 'Job Site' | 'Company Office' | 'Custom';
  shipToName: string;
  shipToAddress: string;
  shipToPhone: string;
  deliveryInstructions: string; // Gate codes, etc.

  lineItems: LineItem[];
  notes: string;

  // Standard branding
  companyName?: string;
  companyAddress?: string;
  companyPhone?: string;
  companyWebsite?: string;
  logoUrl?: string;
  signatureUrl?: string;
}

export interface NoteData extends DocumentStyle {
  title: string;
  content: string;
  tags: string[];
}

export interface ReceiptData extends DocumentStyle {
    title?: string;
    receiptNumber: string;
    date: string;
    clientName: string; // Changed from 'from' to 'clientName' for consistency
    amount: number;
    description: string;
    paymentMethod: string;
    companyName?: string;
    companyAddress?: string;
    companyPhone?: string;
    companyWebsite?: string;
    clientAddress?: string;
    logoUrl?: string;
    signatureUrl?: string;
}

export interface FormData {
  id: string;
  jobId: string;
  type: FormType;
  createdAt: string;
  data: InvoiceData | WorkOrderData | DailyJobReportData | TimeSheetData | MaterialLogData | EstimateData | ExpenseLogData | WarrantyData | NoteData | ReceiptData | ChangeOrderData | PurchaseOrderData;
}

export interface Notification {
    id: string;
    user_id: string; // The recipient
    source_user_id: string; // Who triggered it
    type: 'like' | 'comment';
    post_id: string;
    created_at: string;
    is_read: boolean;
}
