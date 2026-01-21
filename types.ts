
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
  theme?: 'light' | 'dark' | 'blue';
  gmailAccessToken?: string;
  gmailRefreshToken?: string;
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
  portal_key?: string; // Unique key for public portal access
}

export interface InventoryItem {
  id: string;
  user_id: string;
  name: string;
  quantity: number;
  category?: string;
  unit?: string;
  cost_price?: number;
  supplier?: string;
  location?: string;
  low_stock_threshold?: number;
  created_at?: string;
}

export interface InventoryHistoryItem {
  id: string;
  item_id: string;
  user_id: string;
  action: 'add' | 'remove' | 'update' | 'restock' | 'job_allocation';
  quantity_change: number;
  notes?: string;
  job_id?: string;
  created_at?: string;
}

export interface Job {
  id: string;
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
  unitCost?: number; // Internal cost for profit calculation
  percentComplete?: number; // For progress invoicing (0-100)
  progressValue?: number; // For progress invoicing (Scheduled Value)
  progressPercentage?: number; // For progress invoicing (% to bill)
  previouslyBilled?: number; // For progress invoicing tracking
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
  // Progress Invoicing fields
  isProgressBilling?: boolean;
  // Recurring Invoice fields
  recurrence?: { // Keep recurrence object for compatibility with logic
    enabled: boolean;
    frequency: 'Monthly' | 'Quarterly' | 'Bi-Annually' | 'Annually';
    lastRunDate?: string;
    nextRunDate?: string;
  };
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
  inventoryItemId?: string;
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
  deductInventory?: boolean;
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
  signatureUrl?: string; // Contractor's signature
  clientSignatureUrl?: string; // Client's signature from digital approval
  clientSignedAt?: string; // Timestamp when client signed
  clientSignedBy?: string; // Client name who signed
}

export interface ExpenseLogData extends DocumentStyle {
  title?: string;
  date: string;
  item: string;
  lineItems?: LineItem[]; // Added for multi-item support
  vendor: string;
  category: 'Fuel' | 'Food' | 'Material' | 'Other';
  amount: number;
  tax?: number; // Added for tax tracking
  notes?: string;
  companyName?: string;
  companyAddress?: string;
  companyPhone?: string;
  companyWebsite?: string;
  clientName?: string;
  logoUrl?: string;
  signatureUrl?: string;
  // Compatibility with old type if needed in UI, though we prefer lineItems
  items?: { id: string; description: string; amount: number }[];
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
  signatureUrl?: string; // Contractor's signature
  clientSignatureUrl?: string; // Client's signature from digital approval
  clientSignedAt?: string; // Timestamp when client signed
  clientSignedBy?: string; // Client name who signed
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
  // FIX: Add optional 'public_token' property to FormData interface to resolve property does not exist error.
  public_token?: string; // Add public_token for digital sign-offs
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

// ===== NEW INTERFACES FOR 8 CONTRACTOR FEATURES =====

export interface SavedItem {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  rate: number;
  unit_cost?: number; // Renamed from cost to unit_cost to match DB, aliased where needed
  cost?: number;
  category?: string;
  created_at?: string;
  updated_at?: string;
}

export interface RecurringInvoice {
  id: string;
  user_id: string;
  job_id: string;
  invoice_template: InvoiceData;
  frequency: 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  next_run_date: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface ClientPortalLink {
  id: string;
  client_id: string;
  magic_token: string;
  is_active: boolean;
  created_at?: string;
  last_accessed?: string;
}

export interface DocumentApproval {
  id: string;
  document_id: string;
  approval_token: string;
  signature_url?: string;
  approved_at?: string;
  approver_name?: string;
  approver_email?: string;
  ip_address?: string;
  user_agent?: string;
  created_at?: string;
}

export interface ProfitMarginData {
  totalCost: number;
  totalRevenue: number;
  totalProfit: number;
  marginPercentage: number;
}
