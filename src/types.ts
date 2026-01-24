
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
  ChangeOrder = "Change Order",
  PurchaseOrder = "Purchase Order",
  ProfitReport = "Profit Report",
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
  low_stock_threshold?: number;
  created_at?: string;
}

export interface SavedItem {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  rate: number;
  unit_cost?: number; // Renamed from cost to unit_cost to match DB, aliased where needed
  cost?: number;
  category?: string;
  category_id?: string; // FK to price_book_categories
  // Advanced Price Book Fields
  type?: 'service' | 'material' | 'labor' | 'bundle';
  images?: string[]; // Array of image URLs
  taxable?: boolean;
  sku?: string; // Stock Keeping Unit / Code
  markup?: number; // Profit markup percentage
  // Elite Features (Phase 1)
  is_assembly?: boolean; // Is this a bundle/assembly?
  assembly_items?: AssemblyItem[]; // Components of this assembly
  is_favorite?: boolean; // Starred/favorited
  last_used_at?: string; // Last time added to a document
  use_count?: number; // How many times used
  created_at?: string;
  updated_at?: string;
}

export interface AssemblyItem {
  item_id: string;
  quantity: number;
  override_price?: number | null; // Override component price
}

export interface ItemVendor {
  id: string;
  item_id: string;
  vendor_name: string;
  vendor_sku?: string;
  vendor_price?: number;
  lead_time_days?: number;
  is_preferred?: boolean;
  last_updated?: string;
  user_id: string;
}

export interface PriceHistory {
  id: string;
  item_id: string;
  old_price?: number;
  new_price?: number;
  old_cost?: number;
  new_cost?: number;
  changed_at: string;
  changed_by: string;
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

export interface ExpenseItem {
  id: string;
  description: string;
  amount: number;
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
  items?: ExpenseItem[];
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
  data: InvoiceData | WorkOrderData | DailyJobReportData | TimeSheetData | MaterialLogData | EstimateData | ExpenseLogData | WarrantyData | NoteData | ReceiptData | ChangeOrderData | PurchaseOrderData | ProfitReportData;
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
