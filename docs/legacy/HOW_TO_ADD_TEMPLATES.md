# 📋 How to Add New Templates to Your Application

## Quick Summary
Your **French Invoice** template from `1.pptx` has been added! You'll now see it in the customize menu as:
- **Name:** French Invoice
- **Type:** Invoice Style
- **Colors:** Dark gray (#191919) and cream (#FFF2EA)

---

## Step-by-Step Guide: Adding a New Template

### Step 1: Analyze Your Template File
When you have a PPTX template file (like the `1.pptx` you provided), first analyze it to understand:
- ✅ All text placeholders and their roles
- ✅ Color scheme used
- ✅ Layout structure
- ✅ Font information

**I've already done this for `1.pptx`** - see these files:
- `TEMPLATE_ANALYSIS_1.md` - Detailed human-readable analysis
- `template_schema.json` - Machine-readable structure

---

### Step 2: Add Template Colors

Open: `components/TemplateSelector.tsx`

Find the `templateColors` object (around line 15) and add your template's colors:

```typescript
const templateColors: Record<string, { primary: string, secondary: string }> = {
    // ... existing templates ...
    
    // YOUR NEW TEMPLATE
    your_template_id: { primary: '#HEXCOLOR1', secondary: '#HEXCOLOR2' },
};
```

**Example (French Invoice):**
```typescript
french_invoice: { primary: '#191919', secondary: '#FFF2EA' },
```

**Where to find colors:**
- Primary: Usually the main table header background or accent color
- Secondary: Usually the header text color or complementary accent

---

### Step 3: Add Template to Layouts Array

In the same file, find the `layouts` array (around line 30) and add your template:

```typescript
const layouts = [
    // ... existing templates ...
    
    {
        id: 'your_template_id',           // Must match the key in templateColors
        name: 'Display Name',              // What users see
        description: 'Brief description',  // Shown on hover/subtitle
        type: 'Category Name'              // Groups similar templates
    },
];
```

**Example (French Invoice):**
```typescript
{
    id: 'french_invoice',
    name: 'French Invoice',
    description: 'Professional invoice with warm gradients and decorative elements',
    type: 'Invoice Style'
},
```

---

### Step 4: Category Types

The `type` field groups templates. Current categories:
- **Certificate Style** - Traditional bordered layouts
- **Modern Style** - Clean, contemporary designs
- **Invoice Style** - Invoice/billing documents (NEW!)

You can create new categories simply by adding a new type value!

---

## Template ID Naming Convention

Use lowercase with underscores:
- ✅ `french_invoice`
- ✅ `modern_estimate`
- ✅ `daily_report_classic`
- ❌ `FrenchInvoice`
- ❌ `Modern-Estimate`

---

## Color Selection Tips

### For Light Backgrounds:
- Primary: Dark color for text/headers (e.g., `#2c3e50`, `#191919`)
- Secondary: Lighter shade (e.g., `#34495e`, `#FFF2EA`)

### For Dark Backgrounds:
- Primary: Dark background color (e.g., `#000000`, `#1a1a1a`)
- Secondary: Light text color (e.g., `#FFFFFF`, `#F0F0F0`)

### Gradient Templates:
- Primary: Dominant gradient color
- Secondary: Accent/highlight color

---

## Full Example: Adding "Modern Estimate" Template

### 1. Add colors:
```typescript
const templateColors: Record<string, { primary: string, secondary: string }> = {
    // ... existing ...
    modern_estimate: { primary: '#16a085', secondary: '#1abc9c' },
};
```

### 2. Add layout:
```typescript
const layouts = [
    // ... existing ...
    {
        id: 'modern_estimate',
        name: 'Modern Estimate',
        description: 'Clean estimate with teal accent colors',
        type: 'Estimate Style'
    },
];
```

### 3. Result:
Users will see "Modern Estimate" in the "Estimate Style" category with teal colors!

---

## Testing Your New Template

1. Save `TemplateSelector.tsx`
2. The app will auto-reload (Vite HMR)
3. Click "Customize Look"
4. Look for your template in the grid
5. Select it and click "Apply Changes"

---

## Troubleshooting

### Template doesn't appear?
- ✅ Check that `id` in `templateColors` matches `id` in `layouts`
- ✅ Verify both objects are saved
- ✅ Check browser console for errors

### Colors look wrong?
- ✅ Ensure hex colors start with `#`
- ✅ Use 6-character hex codes (e.g., `#191919` not `#191`)
- ✅ Test both light and dark mode if applicable

### Category not showing?
- ✅ The `type` field is case-sensitive
- ✅ Make sure you're using the exact same string for related templates

---

## Current Templates in Your App

| ID | Name | Type | Colors |
|---|---|---|---|
| `professional` | Classic Frame | Certificate Style | #2c3e50, #34495e |
| `modern_blue` | Modern Header | Modern Style | #3498db, #2980b9 |
| `elegant` | Elegant Certificate | Certificate Style | #8e44ad, #9b59b6 |
| `minimal` | Minimalist | Modern Style | #95a5a6, #7f8c8d |
| `bold` | Bold Statement | Modern Style | #000000, #000000 |
| `french_invoice` | **French Invoice** | **Invoice Style** | **#191919, #FFF2EA** |

---

## Next Steps for Your French Invoice Template

The template is now visible in the UI, but to fully integrate it with PDF generation, you'll need to:

1. **Map the placeholders** (from `template_schema.json`) to your document data
2. **Create PDF generation logic** that uses the PPTX structure
3. **Handle the decorative images** (image1.png, image2.png, image3.png)

Would you like help with any of these steps?

---

## Quick Reference Commands

**View your template analysis:**
```bash
cat utils/templates/TEMPLATE_ANALYSIS_1.md
```

**View template schema:**
```bash
cat utils/templates/template_schema.json
```

**Edit template selector:**
```bash
code components/TemplateSelector.tsx
```

---

**✨ Your French Invoice template is now live!** 

Check the "Customize Look" button - you should see "French Invoice" under "Invoice Style"! 🎉
