# PPTX Template Analysis - Invoice/Facture Template

## Template Overview
**File:** `1.pptx`  
**Type:** Invoice/Billing Document (French)  
**Layout:** Professional invoice template with decorative elements  
**Number of Slides:** 1

---

## Document Structure

### 1. Header Section
#### Logo/Branding Area
- **Placeholder:** `La` (Script/Handwriting font - Mistrully)
  - **Field Name:** `company_logo_text`
  - **Role:** Company branding/logo text
  - **Font:** Mistrully, 5538pt
  - **Alignment:** Center
  - **Position:** Top-left area

#### Main Title
- **Placeholder:** `FACTURE`
  - **Field Name:** `document_title`
  - **Role:** Document type header
  - **Font:** Coco Gothic Heavy, Bold, 5001pt
  - **Color:** Black (#000000)
  - **Alignment:** Center
  - **Position:** Top-center, prominent

#### Invoice Reference
- **Placeholder:** `N° 0012345 - 30/07/27`
  - **Field Name:** `invoice_number` and `invoice_date`
  - **Role:** Invoice identifier and date
  - **Font:** Coco Gothic, 1400pt
  - **Alignment:** Center
  - **Format:** "N° {number} - {date}"

---

### 2. Party Information Section

#### Client Section (Right Side)
- **Label:** `Client`
  - **Field Name:** `client_label`
  - **Role:** Section header
  - **Font:** Coco Gothic Bold, 2000pt, Bold
  - **Alignment:** Right

- **Client Name:** `Lou Huet`
  - **Field Name:** `client_name`
  - **Role:** Client full name
  - **Font:** Coco Gothic Bold, 2000pt, Bold
  - **Alignment:** Left (Justified)

- **Client Phone:** `123-456-7890`
  - **Field Name:** `client_phone`
  - **Role:** Client contact number
  - **Font:** Coco Gothic, 1100pt
  - **Alignment:** Left (Justified)

- **Client Email:** `hello@reallygreatsite.com`
  - **Field Name:** `client_email`
  - **Role:** Client email address
  - **Font:** Coco Gothic, 1100pt
  - **Alignment:** Left (Justified)

- **Client Address:** `123 Anywhere St., Any City`
  - **Field Name:** `client_address`
  - **Role:** Client physical address
  - **Font:** Coco Gothic, 1100pt
  - **Alignment:** Left (Justified)

#### Vendor Section (Left Side - Implicit from "Client" on right)
- **Vendor Name:** `Andrea Sanchez`
  - **Field Name:** `vendor_name`
  - **Role:** Service provider/company name
  - **Font:** Coco Gothic, 1100pt
  - **Alignment:** Right

- **Vendor Email:** `hello@reallygreatsite.com`
  - **Field Name:** `vendor_email`
  - **Role:** Vendor contact email
  - **Font:** Coco Gothic, 1100pt
  - **Alignment:** Right

- **Vendor Address:** `123 Anywhere St., Any City`
  - **Field Name:** `vendor_address`
  - **Role:** Vendor physical address
  - **Font:** Coco Gothic, 1100pt
  - **Alignment:** Right

---

### 3. Line Items Table

#### Table Headers (Dark Header Row)
- **Header 1:** `DESCRIPTION`
  - **Field Name:** `table_header_description`
  - **Role:** Column header for item descriptions
  - **Font:** Coco Gothic Bold, 1400pt, Bold
  - **Color:** Light cream (#FFF2EA)
  - **Background:** Dark gray (#191919)
  - **Alignment:** Left

- **Header 2:** `PRIX HT` (Price excluding tax)
  - **Field Name:** `table_header_price`
  - **Role:** Column header for unit price
  - **Font:** Coco Gothic Bold, 1400pt, Bold
  - **Color:** Light cream (#FFF2EA)
  - **Background:** Dark gray (#191919)
  - **Alignment:** Center

- **Header 3:** `QUANTITÉ` (Quantity)
  - **Field Name:** `table_header_quantity`
  - **Role:** Column header for quantity
  - **Font:** Coco Gothic Bold, 1400pt, Bold
  - **Color:** Light cream (#FFF2EA)
  - **Background:** Dark gray (#191919)
  - **Alignment:** Center

- **Header 4:** `TOTAL`
  - **Field Name:** `table_header_total`
  - **Role:** Column header for line total
  - **Font:** Coco Gothic Bold, 1400pt, Bold
  - **Color:** Light cream (#FFF2EA)
  - **Background:** Dark gray (#191919)
  - **Alignment:** Center

#### Line Item 1
- **Description:** `Séance photo (portrait individuel)`
  - **Field Name:** `line_item_1_description`
  - **Font:** Coco Gothic, 1200pt

- **Unit Price:** `300€`
  - **Field Name:** `line_item_1_price`
  - **Font:** Coco Gothic, 1400pt
  - **Alignment:** Center

- **Quantity:** `1`
  - **Field Name:** `line_item_1_quantity`
  - **Font:** Coco Gothic, 1400pt
  - **Alignment:** Center

- **Total:** `300€`
  - **Field Name:** `line_item_1_total`
  - **Font:** Coco Gothic, 1400pt
  - **Alignment:** Center

#### Line Item 2
- **Description:** `Retouches photo (10 images)`
  - **Field Name:** `line_item_2_description`
  - **Font:** Coco Gothic, 1200pt

- **Unit Price:** `10€`
  - **Field Name:** `line_item_2_price`
  - **Font:** Coco Gothic, 1400pt
  - **Alignment:** Center

- **Quantity:** `10`
  - **Field Name:** `line_item_2_quantity`
  - **Font:** Coco Gothic, 1400pt
  - **Alignment:** Center

- **Total:** `100€`
  - **Field Name:** `line_item_2_total`
  - **Font:** Coco Gothic, 1400pt
  - **Alignment:** Center

#### Line Item 3
- **Description:** `Album photo imprimé (20 pages)`
  - **Field Name:** `line_item_3_description`
  - **Font:** Coco Gothic, 1200pt

- **Unit Price:** `30€`
  - **Field Name:** `line_item_3_price`
  - **Font:** Coco Gothic, 1400pt
  - **Alignment:** Center

- **Quantity:** `2`
  - **Field Name:** `line_item_3_quantity`
  - **Font:** Coco Gothic, 1400pt
  - **Alignment:** Center

- **Total:** `60€`
  - **Field Name:** `line_item_3_total`
  - **Font:** Coco Gothic, 1400pt
  - **Alignment:** Center

#### Line Item 4
- **Description:** `Tirage photo`
  - **Field Name:** `line_item_4_description`
  - **Font:** Coco Gothic, 1200pt

- **Unit Price:** `5€`
  - **Field Name:** `line_item_4_price`
  - **Font:** Coco Gothic, 1400pt
  - **Alignment:** Center

- **Quantity:** `45`
  - **Field Name:** `line_item_4_quantity`
  - **Font:** Coco Gothic, 1400pt
  - **Alignment:** Center

- **Total:** `225`
  - **Field Name:** `line_item_4_total`
  - **Font:** Coco Gothic, 1400pt
  - **Alignment:** Center

---

### 4. Totals Section

#### Subtotal
- **Label:** `SOUS TOTAL`
  - **Field Name:** `subtotal_label`
  - **Font:** Coco Gothic, 1400pt
  - **Alignment:** Left

- **Amount:** `685€`
  - **Field Name:** `subtotal_amount`
  - **Font:** Coco Gothic, 1400pt
  - **Alignment:** Left

#### Tax (TVA)
- **Label:** `TVA 0%`
  - **Field Name:** `tax_label`
  - **Font:** Coco Gothic, 1400pt
  - **Alignment:** Left

- **Amount:** `0€`
  - **Field Name:** `tax_amount`
  - **Font:** Coco Gothic, 1400pt
  - **Alignment:** Left

#### Grand Total
- **Label:** `TOTAL.` (with spacing)
  - **Field Name:** `grand_total_label`
  - **Font:** Coco Gothic Bold, 1400pt, Bold
  - **Color:** White (#FFFFFF)
  - **Background:** Black rectangle
  - **Alignment:** Left

- **Amount:** `685€`
  - **Field Name:** `grand_total_amount`
  - **Font:** Coco Gothic Bold, 1400pt, Bold
  - **Color:** White (#FFFFFF)
  - **Background:** Black rectangle
  - **Alignment:** Left

---

### 5. Payment & Terms Section

#### Payment Method
- **Placeholder:** `Mode de paiement : chèque`
  - **Field Name:** `payment_method`
  - **Role:** Payment type
  - **Font:** Coco Gothic, 1200pt
  - **Alignment:** Left
  - **Format:** "Mode de paiement : {method}"

#### Due Date
- **Placeholder:** `Date d'échéance : 30/12/27`
  - **Field Name:** `due_date`
  - **Role:** Payment due date
  - **Font:** Coco Gothic, 1200pt
  - **Alignment:** Left
  - **Format:** "Date d'échéance : {date}"

#### Signature Note
- **Text:** `Signature suivie de la mention` / `"Lu et approuvé, bon pour accord" :`
  - **Field Name:** `signature_instructions`
  - **Role:** Legal signature instructions
  - **Font:** Coco Gothic, 1199pt
  - **Alignment:** Left

---

### 6. Footer Section

#### Thank You Message - Part 1
- **Placeholder:** `Merci`
  - **Field Name:** `thank_you_script`
  - **Role:** Decorative thank you
  - **Font:** Mistrully (script), 2971pt
  - **Alignment:** Center

#### Thank You Message - Part 2
- **Placeholder:** `POUR VOTRE CONFIANCE`
  - **Field Name:** `thank_you_message`
  - **Role:** Thank you message
  - **Font:** Coco Gothic Heavy, Bold, 2683pt
  - **Alignment:** Center

---

## Design Elements (Non-Text)

### Images/Graphics
1. **Image 1** (rId2) - Decorative element (image1.png, 1.07 MB)
2. **Image 2** (rId3) - Decorative element, used twice (image2.png, 753 KB)
3. **Image 3** (rId4) - Decorative element (image3.png, 958 KB)

### Color Scheme
- **Primary Text:** Black (#000000)
- **Accent Text:** Light cream (#FFF2EA)
- **Background (Table Header):** Dark gray (#191919)
- **Background (Total Row):** Black (#000000)
- **Accent Text (Total):** White (#FFFFFF)

### Fonts Used
1. **Coco Gothic** - Regular body text
2. **Coco Gothic Bold** - Headers and emphasis
3. **Coco Gothic Heavy** - Main title and strong emphasis
4. **Mistrully** - Decorative script font for branding

---

## Placeholder Schema (JSON Format)

```json
{
  "header": {
    "document_title": "FACTURE",
    "company_logo_text": "La",
    "invoice_number": "0012345",
    "invoice_date": "30/07/27"
  },
  "vendor": {
    "name": "Andrea Sanchez",
    "email": "hello@reallygreatsite.com",
    "address": "123 Anywhere St., Any City"
  },
  "client": {
    "name": "Lou Huet",
    "phone": "123-456-7890",
    "email": "hello@reallygreatsite.com",
    "address": "123 Anywhere St., Any City"
  },
  "line_items": [
    {
      "description": "Séance photo (portrait individuel)",
      "unit_price": "300€",
      "quantity": "1",
      "total": "300€"
    },
    {
      "description": "Retouches photo (10 images)",
      "unit_price": "10€",
      "quantity": "10",
      "total": "100€"
    },
    {
      "description": "Album photo imprimé (20 pages)",
      "unit_price": "30€",
      "quantity": "2",
      "total": "60€"
    },
    {
      "description": "Tirage photo",
      "unit_price": "5€",
      "quantity": "45",
      "total": "225"
    }
  ],
  "totals": {
    "subtotal": "685€",
    "tax_label": "TVA 0%",
    "tax_amount": "0€",
    "grand_total": "685€"
  },
  "payment": {
    "payment_method": "chèque",
    "due_date": "30/12/27"
  },
  "footer": {
    "thank_you_script": "Merci",
    "thank_you_message": "POUR VOTRE CONFIANCE"
  }
}
```

---

## Content Generation Guidelines

### Text Length Constraints

#### Header Section
- **Invoice Number:** Max 10 characters
- **Invoice Date:** Fixed format DD/MM/YY (8 chars)
- **Company Logo Text:** Max 20 characters

#### Party Information
- **Names:** Max 50 characters
- **Email:** Max 40 characters
- **Phone:** Max 20 characters (formatted)
- **Address:** Max 60 characters

#### Line Items
- **Description:** Max 80 characters per line
- **Unit Price:** Max 15 characters (including currency)
- **Quantity:** Max 6 characters
- **Total:** Max 15 characters (including currency)
- **Maximum Rows:** 4 (based on current layout)

#### Payment Section
- **Payment Method:** Max 40 characters
- **Due Date:** Fixed format DD/MM/YY

#### Footer
- **Thank You Script:** Max 20 characters
- **Thank You Message:** Max 50 characters

---

## Sample Content Variants

### Variant 1: Construction Services
```json
{
  "header": {
    "document_title": "FACTURE",
    "company_logo_text": "BâtiPro",
    "invoice_number": "INV-2024-001",
    "invoice_date": "15/01/24"
  },
  "vendor": {
    "name": "BâtiPro Construction",
    "email": "contact@batipro.fr",
    "address": "45 Rue de la Paix, Paris"
  },
  "client": {
    "name": "Marie Dubois",
    "phone": "01-23-45-67-89",
    "email": "marie.dubois@email.fr",
    "address": "12 Avenue Victor Hugo, Lyon"
  },
  "line_items": [
    {
      "description": "Rénovation cuisine complète",
      "unit_price": "4500€",
      "quantity": "1",
      "total": "4500€"
    },
    {
      "description": "Installation électrique",
      "unit_price": "1200€",
      "quantity": "1",
      "total": "1200€"
    },
    {
      "description": "Plomberie sanitaire",
      "unit_price": "800€",
      "quantity": "1",
      "total": "800€"
    },
    {
      "description": "Main d'œuvre journée",
      "unit_price": "350€",
      "quantity": "3",
      "total": "1050€"
    }
  ],
  "totals": {
    "subtotal": "7550€",
    "tax_label": "TVA 20%",
    "tax_amount": "1510€",
    "grand_total": "9060€"
  },
  "payment": {
    "payment_method": "virement bancaire",
    "due_date": "15/02/24"
  },
  "footer": {
    "thank_you_script": "Merci",
    "thank_you_message": "POUR VOTRE CONFIANCE"
  }
}
```

### Variant 2: Consulting Services
```json
{
  "header": {
    "document_title": "FACTURE",
    "company_logo_text": "ConsultPro",
    "invoice_number": "CP-2024-042",
    "invoice_date": "22/03/24"
  },
  "vendor": {
    "name": "ConsultPro Services",
    "email": "info@consultpro.fr",
    "address": "18 Boulevard Haussmann, Paris"
  },
  "client": {
    "name": "Tech Innovations SAS",
    "phone": "02-98-76-54-32",
    "email": "admin@techinno.fr",
    "address": "34 Rue du Commerce, Nantes"
  },
  "line_items": [
    {
      "description": "Audit stratégique entreprise",
      "unit_price": "2800€",
      "quantity": "1",
      "total": "2800€"
    },
    {
      "description": "Formation management - 2 jours",
      "unit_price": "950€",
      "quantity": "1",
      "total": "950€"
    },
    {
      "description": "Consultation téléphonique (heure)",
      "unit_price": "120€",
      "quantity": "5",
      "total": "600€"
    },
    {
      "description": "Rapport d'analyse détaillé",
      "unit_price": "450€",
      "quantity": "1",
      "total": "450€"
    }
  ],
  "totals": {
    "subtotal": "4800€",
    "tax_label": "TVA 20%",
    "tax_amount": "960€",
    "grand_total": "5760€"
  },
  "payment": {
    "payment_method": "carte bancaire",
    "due_date": "22/04/24"
  },
  "footer": {
    "thank_you_script": "Merci",
    "thank_you_message": "AU PLAISIR DE VOUS REVOIR"
  }
}
```

### Variant 3: Graphic Design
```json
{
  "header": {
    "document_title": "FACTURE",
    "company_logo_text": "PixelArt",
    "invoice_number": "PA-2024-087",
    "invoice_date": "08/05/24"
  },
  "vendor": {
    "name": "PixelArt Studio",
    "email": "studio@pixelart.fr",
    "address": "27 Rue des Artistes, Marseille"
  },
  "client": {
    "name": "Boutique Mode & Style",
    "phone": "04-91-23-45-67",
    "email": "contact@modestyle.fr",
    "address": "56 Cours Julien, Marseille"
  },
  "line_items": [
    {
      "description": "Logo complet + variations",
      "unit_price": "850€",
      "quantity": "1",
      "total": "850€"
    },
    {
      "description": "Charte graphique complète",
      "unit_price": "1200€",
      "quantity": "1",
      "total": "1200€"
    },
    {
      "description": "Design carte de visite",
      "unit_price": "180€",
      "quantity": "1",
      "total": "180€"
    },
    {
      "description": "Affiche publicitaire A3",
      "unit_price": "220€",
      "quantity": "3",
      "total": "660€"
    }
  ],
  "totals": {
    "subtotal": "2890€",
    "tax_label": "TVA 20%",
    "tax_amount": "578€",
    "grand_total": "3468€"
  },
  "payment": {
    "payment_method": "chèque",
    "due_date": "08/06/24"
  },
  "footer": {
    "thank_you_script": "Merci",
    "thank_you_message": "VOTRE SATISFACTION NOUS INSPIRE"
  }
}
```

### Variant 4: Event Planning
```json
{
  "header": {
    "document_title": "FACTURE",
    "company_logo_text": "EventMagic",
    "invoice_number": "EM-2024-156",
    "invoice_date": "12/06/24"
  },
  "vendor": {
    "name": "EventMagic Organisation",
    "email": "events@eventmagic.fr",
    "address": "91 Avenue des Champs, Nice"
  },
  "client": {
    "name": "Sophie & Thomas Martin",
    "phone": "06-12-34-56-78",
    "email": "sophie.martin@email.fr",
    "address": "23 Promenade des Anglais, Nice"
  },
  "line_items": [
    {
      "description": "Organisation mariage complet",
      "unit_price": "3500€",
      "quantity": "1",
      "total": "3500€"
    },
    {
      "description": "Location salle de réception",
      "unit_price": "1800€",
      "quantity": "1",
      "total": "1800€"
    },
    {
      "description": "Décoration florale premium",
      "unit_price": "650€",
      "quantity": "1",
      "total": "650€"
    },
    {
      "description": "Coordination jour J (10h)",
      "unit_price": "85€",
      "quantity": "10",
      "total": "850€"
    }
  ],
  "totals": {
    "subtotal": "6800€",
    "tax_label": "TVA 10%",
    "tax_amount": "680€",
    "grand_total": "7480€"
  },
  "payment": {
    "payment_method": "virement bancaire",
    "due_date": "12/07/24"
  },
  "footer": {
    "thank_you_script": "Merci",
    "thank_you_message": "POUR CET ÉVÉNEMENT MAGIQUE"
  }
}
```

---

## Technical Notes

### Table Structure
- The table is a 4-column × 5-row grid
- Header row has dark background (#191919) with light text (#FFF2EA)
- Data rows have white background with black text
- All cells have black borders (19050 EMUs width)
- Cell margins: 114300 EMUs on all sides

### Positioning
- Uses EMUs (English Metric Units) for positioning
- Main table positioned at coordinates (382368, 3746916)
- Table dimensions: 6770226 × 2924175 EMUs

### Font Sizing in PPTX
- Sizes specified in hundredths of a point (e.g., 1400 = 14pt)

---

## Implementation Strategy

When filling this template programmatically:

1. **Parse the XML** to locate text boxes by their content
2. **Replace placeholder text** while preserving formatting
3. **Maintain font properties** (family, size, color, bold/italic)
4. **Keep alignment settings** intact
5. **Preserve spacing** (line spacing, paragraph spacing)
6. **Handle table rows** - duplicate row structure for additional line items
7. **Recalculate totals** based on line items
8. **Validate text lengths** against constraints
9. **Repackage the PPTX** (it's a ZIP file)

### Key Text Box IDs (from XML)
- TextBox 4: Main title (FACTURE)
- TextBox 11: Company logo text (La)
- TextBox 12-13: Party labels (Client)
- TextBox 14-17: Table headers
- TextBox 18-20: Total section labels
- TextBox 25-43: Line item data
- TextBox 44-48: Payment & terms
- TextBox 45-46: Footer messages

---

## Color Customization Points

Based on your requirement that "colors should be changeable through the tool":

### Customizable Color Elements
1. **Table header background** - Currently #191919 (dark gray)
2. **Table header text** - Currently #FFF2EA (light cream)
3. **Total row background** - Currently #000000 (black)
4. **Total row text** - Currently #FFFFFF (white)
5. **Body text** - Currently #000000 (black)

These colors can be modified in the XML without changing the layout structure.

---

## Summary
This is a professional French invoice template with:
- **51 text placeholders** mapped above
- **3 decorative images** (non-editable design elements)
- **4 line item rows** (expandable with table row duplication)
- **Bilingual potential** (all labels can be translated)
- **Professional styling** with multiple font weights and decorative script elements
- **Clear hierarchy** with distinct sections for readability

The template is ready for dynamic content population while maintaining the exact layout and design integrity.
