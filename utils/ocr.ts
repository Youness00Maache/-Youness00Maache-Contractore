// OCR utility for receipt scanning using Tesseract.js

// @ts-ignore
import { createWorker, Worker } from 'tesseract.js';

let workerInstance: Worker | null = null;

/**
 * Initialize Tesseract worker (reuse for better performance)
 */
const getWorker = async (): Promise<Worker> => {
    if (!workerInstance) {
        workerInstance = await createWorker('eng');
    }
    return workerInstance;
};

/**
 * Parse date from text (supports various formats)
 */
const parseDate = (text: string): string | null => {
    // Common date patterns
    const patterns = [
        /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/g, // MM/DD/YYYY or DD/MM/YYYY
        /(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/g,  // YYYY-MM-DD
        /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2}),?\s+(\d{2,4})/gi, // Jan 15, 2024
    ];

    for (const pattern of patterns) {
        const matches = text.matchAll(pattern);
        for (const match of matches) {
            const dateStr = match[0];
            try {
                const date = new Date(dateStr);
                if (!isNaN(date.getTime())) {
                    return date.toISOString().split('T')[0]; // Return YYYY-MM-DD
                }
            } catch {
                continue;
            }
        }
    }

    return null;
};

/**
 * Parse amount from text (finds dollar amounts)
 */
const parseAmount = (text: string): number | null => {
    // Look for patterns like $123.45, $1,234.56, or TOTAL: $123.45
    const patterns = [
        /(?:total|amount|subtotal|balance)[\s:]*\$?\s*([\d,]+\.\d{2})/gi,
        /\$\s*([\d,]+\.\d{2})/g,
    ];

    let amounts: number[] = [];

    for (const pattern of patterns) {
        const matches = text.matchAll(pattern);
        for (const match of matches) {
            const numStr = match[1].replace(/,/g, '');
            const num = parseFloat(numStr);
            if (!isNaN(num) && num > 0) {
                amounts.push(num);
            }
        }
    }

    // Return the largest amount found (usually the total)
    return amounts.length > 0 ? Math.max(...amounts) : null;
};

/**
 * Parse vendor/store name from text
 */
const parseVendor = (text: string): string | null => {
    // Common hardware stores and suppliers
    const knownStores = [
        'Home Depot', 'The Home Depot', 'Lowe\'s', 'Lowes',
        'Menards', 'Ace Hardware', 'Harbor Freight', 'True Value',
        'Tractor Supply', 'Northern Tool', 'Grainger', 'Ferguson',
        'HD Supply', 'Platt Electric', 'Gexpro', 'Rexel'
    ];

    const textUpper = text.toUpperCase();

    for (const store of knownStores) {
        if (textUpper.includes(store.toUpperCase())) {
            return store;
        }
    }

    // If no known store, try to get first line (often company name)
    const lines = text.split('\n').filter(l => l.trim().length > 0);
    if (lines.length > 0) {
        const firstLine = lines[0].trim();
        // Only return if it looks like a company name (not too long, no numbers)
        if (firstLine.length < 30 && !/^\d/.test(firstLine)) {
            return firstLine;
        }
    }

    return null;
};

/**
 * Parse Company Info (Address, Phone)
 */
const parseCompanyInfo = (text: string): { address: string | null; phone: string | null } => {
    // Phone pattern (various formats)
    const phonePattern = /(?:phone|tel|ph|contact|call|mobile|cell)?[:.\- ]*?\(?([2-9]\d{2})\)?[-. ]?(\d{3})[-. ]?(\d{4})/i;
    const phoneMatch = text.match(phonePattern);
    const phone = phoneMatch ? `(${phoneMatch[1]}) ${phoneMatch[2]}-${phoneMatch[3]}` : null;

    // Address pattern (US style: 123 Main St, City, ST 12345)
    // Looking for state code + zip at the end of a line
    const addressPattern = /(\d+\s+[^,\n]+,[^,\n]+,\s*[A-Z]{2}\s*\d{5})/i;
    const addressMatch = text.match(addressPattern);

    // Fallback: search for just lines that look like addresses if full pattern fails
    let address = addressMatch ? addressMatch[1] : null;
    if (!address) {
        const lines = text.split('\n');
        for (const line of lines) {
            if (/\d+ [a-z0-9 ]+(st|ave|rd|blvd|dr|ln|ct|circle|plaza|parkway)/i.test(line) && line.length < 60) {
                address = line.trim();
                break;
            }
        }
    }

    return { address, phone };
};

/**
 * Parse Client / Bill To Info
 */
const parseClient = (text: string): string | null => {
    const clientPatterns = [
        /(?:bill to|sold to|ship to|customer|client)[:\s]+([^\n]+)/i,
        /customer #[:\s]*([^\n]+)/i
    ];

    for (const pattern of clientPatterns) {
        const match = text.match(pattern);
        if (match && match[1].trim()) {
            const raw = match[1].trim();
            // Filter out obvious noise: Is matches just a price, date, or very short number?
            if (/^[\d.,]+$/.test(raw) || raw.length < 3 || parseDate(raw)) {
                continue;
            }
            return raw;
        }
    }
    return null;
};

/**
 * Parse individual line items from receipt - Strict Table Detection
 */
const parseLineItems = (text: string): Array<{ description: string; price: number; quantity: number }> => {
    const lines = text.split('\n');
    const items: Array<{ description: string; price: number; quantity: number }> = [];

    // Header keywords to start strict parsing
    // "Service" often appears in "Product/Service" or "Description of Service"
    // "Qty", "Quantity", "Price", "Amount", "Rate" are strong indicators
    const headerKeywords = /^(?:description|desc|item|product|service|qty|quantity|price|amount|rate|cost)/i;

    // Footer keywords to stop parsing
    const footerKeywords = /^(?:subtotal|total|tax|balance|amount due|payment|thank)/i;

    let inItemSection = false;
    // Heuristic: If we don't find a clear header, we might assume items start after the Date/Vendor block.
    // But Strict Mode prefers finding a header. If we scan 50% of lines and find no header, we fallback to permissive.
    let searchedLines = 0;

    // Regex for item line:
    // Captures: 
    // 1 - Optional Quantity (e.g. "2 x", "2 ", "2x")
    // 2 - Description (The main text)
    // 3 - Price (Number at end)
    const itemRegex = /^(?:(\d+(?:\.\d+)?)\s*[xX]?\s+)?(.+?)[\s\$]+([\d,]+\.\d{2})\s*[TXN]?\s*$/;

    // Words to strictly skip if we are in permissive mode (or even strict mode to avoid noise)
    const skipWords = /^(subtotal|total|tax|balance|change|cash|credit|debit|visa|mastercard|amex|date|time|auth|ref|term|inv)/i;


    for (const line of lines) {
        const trimmed = line.trim();
        searchedLines++;

        if (trimmed.length < 3) continue;

        // Check for Header Line
        if (!inItemSection) {
            if (headerKeywords.test(trimmed)) {
                inItemSection = true;
                continue; // Skip the header line itself
            }
            // Check for footer BEFORE header? If we see "Total" before "Description", probably the receipt is upside down or weird, or we missed header.
            if (footerKeywords.test(trimmed)) {
                // If we see a footer and haven't started, maybe we missed the header?
                // Or there is no header.
                // Let's rely on fallback if we never entered.
            }
        } else {
            // We ARE in item section.
            // Check if we hit the footer
            if (footerKeywords.test(trimmed)) {
                inItemSection = false;
                break; // Stop parsing items
            }
        }

        // Parsing Logic:
        // Always try to parse if we are inSection OR (fallback) if we never found section but look deep enough
        // BUT strict adherence: only if inSection is true is safest.
        // Let's implement a hybrid: If inSection, parse eagerly. If not, only parse if it LOOKS remarkably like an item and we haven't seen a footer yet.

        const shouldParse = inItemSection || (!inItemSection && searchedLines > 3 && !footerKeywords.test(trimmed));

        if (shouldParse) {
            // Skip obvious noise
            if (skipWords.test(trimmed)) continue;

            const match = trimmed.match(itemRegex);
            if (match) {
                // match[1] = Qty (maybe undefined)
                // match[2] = Description
                // match[3] = Price

                let quantity = 1;
                const qtyStr = match[1];
                if (qtyStr) {
                    const parsedQ = parseFloat(qtyStr);
                    if (!isNaN(parsedQ)) quantity = parsedQ;
                }

                let description = match[2].trim();
                const priceStr = match[3].replace(/,/g, '');
                const price = parseFloat(priceStr);

                // Sanity filters
                if (!isNaN(price) && price > 0 && price < 100000 && description.length > 2) {
                    // Filter out if description is just a date
                    if (/\d{1,2}\/\d{1,2}\/\d{2,4}/.test(description)) continue;

                    items.push({ description, price, quantity });
                }
            }
        }
    }

    return items;
};

/**
 * Parse footer notes/messages from receipt (e.g., "Thank you for your business")
 */
const parseNotes = (text: string): string | null => {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    // Look for common footer phrases in the last 10 lines
    const footerLines = lines.slice(-10);
    const notePatterns = [
        /thank you/i,
        /thanks for/i,
        /appreciate/i,
        /visit us/i,
        /come again/i,
        /have a/i,
    ];

    const notes: string[] = [];
    for (const line of footerLines) {
        // Skip lines with prices or numbers-heavy content
        if (/\$\d+|\d+\.\d{2}/.test(line)) continue;

        // Check if matches any note pattern
        for (const pattern of notePatterns) {
            if (pattern.test(line) && line.length < 100) {
                notes.push(line);
                break;
            }
        }
    }

    return notes.length > 0 ? notes.join('\n') : null;
};

const parseTax = (text: string): number | null => {
    // Look for lines that contain "Tax" keywords followed by a price at the end
    // Supports: "Tax: 1.25", "Sales Tax $1.25", "HST 13% 1.25", "Tax .......... 1.25"
    const lines = text.split('\n');
    const taxKeywords = /^(?:tax|hst|gst|vat|sales\s*tax|total\s*tax)/i;
    const priceAtEnd = /[\$]?\s*([\d,]+\.\d{2})\s*$/;

    for (const line of lines) {
        const trimmed = line.trim();
        // Check if line primarily talks about tax
        if (taxKeywords.test(trimmed)) {
            // Check if it ends with a number
            const match = trimmed.match(priceAtEnd);
            if (match) {
                const taxAmt = parseFloat(match[1].replace(/,/g, ''));
                // Basic sanity check: tax shouldn't be astronomically high relative to normal receipt items
                if (!isNaN(taxAmt) && taxAmt > 0 && taxAmt < 10000) {
                    return taxAmt;
                }
            }
        }
    }

    // Fallback: try the old global match if line-by-line failed
    const taxPattern = /(?:tax|hst|gst|vat|sales tax)[\s.:]*\$?\s*([\d,]+\.\d{2})/i;
    const matches = text.match(taxPattern);
    if (matches) {
        const taxAmt = parseFloat(matches[1].replace(/,/g, ''));
        if (!isNaN(taxAmt) && taxAmt > 0 && taxAmt < 10000) {
            return taxAmt;
        }
    }

    return null;
};

export interface LineItem {
    description: string;
    price: number;
    quantity: number; // Added to match types.ts and capture qty
}

export interface OCRResult {
    vendor: string | null;
    date: string | null;
    amount: number | null;
    tax: number | null;
    lineItems: LineItem[];
    notes: string | null;
    client: string | null;
    companyAddress: string | null;
    companyPhone: string | null;
    rawText: string;
    confidence: number;
}

/**
 * Process receipt image and extract vendor, date, amount, and line items
 */
export const processReceiptImage = async (imageFile: File | string): Promise<OCRResult> => {
    try {
        const worker = await getWorker();

        const { data: { text, confidence } } = await worker.recognize(imageFile);

        const vendor = parseVendor(text);
        const date = parseDate(text);
        const amount = parseAmount(text);
        const tax = parseTax(text);
        const lineItems = parseLineItems(text);
        const notes = parseNotes(text);
        const { address: companyAddress, phone: companyPhone } = parseCompanyInfo(text);
        const client = parseClient(text);

        return {
            vendor,
            date,
            amount,
            tax,
            lineItems,
            notes,
            client,
            companyAddress,
            companyPhone,
            rawText: text,
            confidence: confidence || 0
        };
    } catch (error) {
        console.error('OCR processing error:', error);
        return {
            vendor: null,
            date: null,
            amount: null,
            tax: null,
            lineItems: [],
            notes: null,
            client: null,
            companyAddress: null,
            companyPhone: null,
            rawText: '',
            confidence: 0
        };
    }
};

/**
 * Preprocess image for better OCR results
 */
export const preprocessImage = (canvas: HTMLCanvasElement): HTMLCanvasElement => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    // Increase contrast and brightness
    for (let i = 0; i < data.length; i += 4) {
        // Grayscale
        const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;

        // Increase contrast
        const contrast = 1.5;
        const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));
        let adjusted = factor * (avg - 128) + 128;

        // Ensure values are in valid range
        adjusted = Math.max(0, Math.min(255, adjusted));

        data[i] = adjusted;     // R
        data[i + 1] = adjusted; // G
        data[i + 2] = adjusted; // B
    }

    ctx.putImageData(imageData, 0, 0);
    return canvas;
};

/**
 * Cleanup worker when done (call this on component unmount)
 */
export const terminateOCRWorker = async () => {
    if (workerInstance) {
        await workerInstance.terminate();
        workerInstance = null;
    }
};
