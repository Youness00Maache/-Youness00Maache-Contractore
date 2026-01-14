
export interface EmailTemplateDefinition {
    id: string;
    name: string;
    category: 'modern' | 'corporate' | 'minimalist' | 'creative' | 'billing';
    thumbnail: string; // base64 or URL for preview
    html: string; // HTML template with placeholders
}

/**
 * Replace placeholders in HTML template with actual values
 */
export const applyTemplateVariables = (
    html: string,
    variables: Record<string, string>
): string => {
    let result = html;
    for (const [key, value] of Object.entries(variables)) {
        const placeholder = `{{${key}}}`;
        result = result.split(placeholder).join(value || '');
    }
    return result;
};

/**
 * Collection of 13-15 professional HTML email templates
 */
export const EMAIL_TEMPLATES: EmailTemplateDefinition[] = [
    // ===== MODERN TEMPLATES =====
    {
        id: 'modern-gradient',
        name: 'Modern Gradient',
        category: 'modern',
        thumbnail: '',
        html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f7fa; }
    .container { max-width: 600px; margin: 0 auto; background: white; }
    .header { background: linear-gradient(135deg, {{primary_color}} 0%, {{secondary_color}} 100%); padding: 40px 30px; text-align: center; }
    .logo { max-width: 150px; height: auto; margin-bottom: 15px; }
    .header h1 { color: white; margin: 0; font-size: 24px; font-weight: 600; }
    .content { padding: 40px 30px; color: #333; line-height: 1.6; }
    .footer { background: #f8f9fa; padding: 30px; text-align: center; color: #6c757d; font-size: 13px; border-top: 1px solid #e9ecef; }
    .signature { margin-top: 30px; padding-top: 20px; border-top: 2px solid {{primary_color}}; }
    .signature-name { font-weight: 600; color: #333; font-size: 16px; }
    .signature-title { color: #6c757d; font-size: 14px; margin-top: 5px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      {{#if logo_url}}<img src="{{logo_url}}" alt="{{company_name}}" class="logo">{{/if}}
      <h1>{{company_name}}</h1>
    </div>
    <div class="content">
      {{body}}
      <div class="signature">
        <div class="signature-name">{{user_name}}</div>
        <div class="signature-title">{{user_job_title}}</div>
        <div class="signature-title">{{company_name}}</div>
        {{#if user_phone}}<div class="signature-title">{{user_phone}}</div>{{/if}}
        {{#if user_website}}<div class="signature-title">{{user_website}}</div>{{/if}}
      </div>
    </div>
    <div class="footer">
      <p>{{company_name}}<br>
      {{company_address}}<br>
      {{company_phone}} | {{company_website}}</p>
    </div>
  </div>
</body>
</html>`
    },

    {
        id: 'modern-clean',
        name: 'Modern Clean',
        category: 'modern',
        thumbnail: '',
        html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #ffffff; }
    .container { max-width: 600px; margin: 0 auto; }
    .header { padding: 30px; border-bottom: 3px solid {{primary_color}}; }
    .logo { max-width: 140px; height: auto; }
    .content { padding: 40px 30px; color: #2d3748; line-height: 1.8; font-size: 15px; }
    .accent-bar { height: 4px; background: {{primary_color}}; margin: 30px 0; }
    .footer { padding: 30px; background: #f7fafc; margin-top: 40px; text-align: center; font-size: 13px; color: #718096; }
    .signature { margin-top: 40px; }
    .signature-name { font-weight: 700; color: {{primary_color}}; font-size: 17px; }
    .signature-details { color: #4a5568; margin-top: 8px; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      {{#if logo_url}}<img src="{{logo_url}}" alt="{{company_name}}" class="logo">{{/if}}
    </div>
    <div class="content">
      {{body}}
      <div class="accent-bar"></div>
      <div class="signature">
        <div class="signature-name">{{user_name}}</div>
        <div class="signature-details">
          {{user_job_title}}<br>
          {{company_name}}<br>
          {{#if user_phone}}{{user_phone}}<br>{{/if}}
          {{#if user_website}}{{user_website}}{{/if}}
        </div>
      </div>
    </div>
    <div class="footer">
      <p>© {{company_name}} | {{company_address}}</p>
    </div>
  </div>
</body>
</html>`
    },

    {
        id: 'modern-bold',
        name: 'Modern Bold',
        category: 'modern',
        thumbnail: '',
        html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { margin: 0; padding: 0; font-family: 'Inter', -apple-system, sans-serif; background: #0f172a; }
    .container { max-width: 600px; margin: 40px auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,0.3); }
    .header { background: {{primary_color}}; padding: 50px 30px; text-align: center; position: relative; }
    .header::after { content: ''; position: absolute; bottom: -20px; left: 0; right: 0; height: 20px; background: white; border-radius: 20px 20px 0 0; }
    .logo { max-width: 160px; filter: brightness(0) invert(1); }
    .content { padding: 40px 40px 50px; color: #1e293b; line-height: 1.7; font-size: 15px; }
    .signature-card { background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%); padding: 25px; border-radius: 10px; margin-top: 30px; border-left: 4px solid {{primary_color}}; }
    .signature-name { font-weight: 700; font-size: 18px; color: #0f172a; }
    .signature-role { color: #64748b; margin-top: 5px; font-size: 14px; }
    .footer { padding: 25px; background: #f8fafc; text-align: center; font-size: 12px; color: #94a3b8; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      {{#if logo_url}}<img src="{{logo_url}}" alt="{{company_name}}" class="logo">{{/if}}
    </div>
    <div class="content">
      {{body}}
      <div class="signature-card">
        <div class="signature-name">{{user_name}}</div>
        <div class="signature-role">{{user_job_title}} at {{company_name}}</div>
        <div class="signature-role">
          {{#if user_phone}}📞 {{user_phone}} | {{/if}}
          {{#if user_website}}🌐 {{user_website}}{{/if}}
        </div>
      </div>
    </div>
    <div class="footer">
      {{company_name}} · {{company_address}}
    </div>
  </div>
</body>
</html>`
    },

    // ===== CORPORATE TEMPLATES =====
    {
        id: 'corporate-classic',
        name: 'Corporate Classic',
        category: 'corporate',
        thumbnail: '',
        html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { margin: 0; padding: 0; font-family: Georgia, 'Times New Roman', serif; background-color: #f5f5f5; }
    .container { max-width: 650px; margin: 0 auto; background: white; border: 1px solid #ddd; }
    .header { background: #ffffff; padding: 25px 40px; border-bottom: 4px solid {{primary_color}}; }
    .logo { max-width: 180px; }
    .content { padding: 50px 40px; color: #333; line-height: 1.8; font-size: 15px; }
    .divider { border-top: 1px solid #e0e0e0; margin: 30px 0; }
    .signature-block { margin-top: 40px; }
    .signature-name { font-weight: bold; font-size: 16px; color: {{primary_color}}; font-family: 'Segoe UI', sans-serif; }
    .signature-info { margin-top: 10px; color: #666; font-size: 14px; line-height: 1.6; }
    .footer { background: #fafafa; padding: 30px 40px; border-top: 1px solid #e0e0e0; text-align: center; font-size: 12px; color: #888; }
    .footer-line { margin: 5px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      {{#if logo_url}}<img src="{{logo_url}}" alt="{{company_name}}" class="logo">{{/if}}
    </div>
    <div class="content">
      {{body}}
      <div class="divider"></div>
      <div class="signature-block">
        <div class="signature-name">{{user_name}}</div>
        <div class="signature-info">
          {{user_job_title}}<br>
          {{company_name}}<br>
          {{#if user_phone}}Direct: {{user_phone}}<br>{{/if}}
          {{#if user_website}}Web: {{user_website}}{{/if}}
        </div>
      </div>
    </div>
    <div class="footer">
      <div class="footer-line"><strong>{{company_name}}</strong></div>
      <div class="footer-line">{{company_address}}</div>
      <div class="footer-line">{{company_phone}} | {{company_website}}</div>
    </div>
  </div>
</body>
</html>`
    },

    {
        id: 'corporate-professional',
        name: 'Corporate Professional',
        category: 'corporate',
        thumbnail: '',
        html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { margin: 0; padding: 0; font-family: 'Arial', sans-serif; background-color: #e8ecef; }
    .container { max-width: 600px; margin: 20px auto; background: white; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    .header-stripe { height: 8px; background: linear-gradient(90deg, {{primary_color}} 0%, {{secondary_color}} 100%); }
    .header { padding: 30px 40px; background: #f8f9fa; }
    .logo { max-width: 150px; }
    .content { padding: 40px; color: #212529; line-height: 1.7; font-size: 14px; }
    .signature-table { width: 100%; margin-top: 35px; border-top: 2px solid {{primary_color}}; padding-top: 20px; }
    .sig-label { color: #6c757d; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600; }
    .sig-value { color: #212529; font-size: 14px; margin-top: 4px; }
    .footer { background: #343a40; color: #adb5bd; padding: 25px 40px; text-align: center; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header-stripe"></div>
    <div class="header">
      {{#if logo_url}}<img src="{{logo_url}}" alt="{{company_name}}" class="logo">{{/if}}
    </div>
    <div class="content">
      {{body}}
      <table class="signature-table">
        <tr>
          <td>
            <div class="sig-label">Name</div>
            <div class="sig-value">{{user_name}}</div>
          </td>
          <td>
            <div class="sig-label">Title</div>
            <div class="sig-value">{{user_job_title}}</div>
          </td>
        </tr>
        <tr>
          <td colspan="2" style="padding-top: 15px;">
            <div class="sig-label">Company</div>
            <div class="sig-value">{{company_name}}</div>
          </td>
        </tr>
        {{#if user_phone}}
        <tr>
          <td colspan="2" style="padding-top: 10px;">
            <div class="sig-label">Contact</div>
            <div class="sig-value">{{user_phone}}{{#if user_website}} | {{user_website}}{{/if}}</div>
          </td>
        </tr>
        {{/if}}
      </table>
    </div>
    <div class="footer">
      {{company_name}} | {{company_address}}<br>
      This email and any attachments are confidential.
    </div>
  </div>
</body>
</html>`
    },

    {
        id: 'corporate-executive',
        name: 'Corporate Executive',
        category: 'corporate',
        thumbnail: '',
        html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background: #1a1a1a; }
    .container { max-width: 620px; margin: 30px auto; background: #ffffff; }
    .top-bar { height: 5px; background: {{primary_color}}; }
    .header { padding: 35px 45px; background: #fafafa; border-bottom: 1px solid #e5e5e5; display: flex; align-items: center; justify-content: space-between; }
    .logo { max-width: 140px; }
    .header-text { font-size: 11px; color: #888; text-align: right; text-transform: uppercase; letter-spacing: 1px; }
    .content { padding: 50px 45px; color: #2c2c2c; line-height: 1.9; font-size: 15px; }
    .vcard { margin-top: 45px; padding: 25px; background: #f8f8f8; border-left: 5px solid {{primary_color}}; }
    .vcard-name { font-weight: 700; font-size: 17px; color: #1a1a1a; }
    .vcard-title { color: #666; font-size: 13px; margin-top: 5px; font-style: italic; }
    .vcard-company { font-weight: 600; color: {{primary_color}}; margin-top: 12px; font-size: 14px; }
    .vcard-contact { color: #888; font-size: 12px; margin-top: 8px; }
    .footer { padding: 25px 45px; background: #2c2c2c; color: #999; font-size: 11px; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <div class="top-bar"></div>
    <div class="header">
      {{#if logo_url}}<img src="{{logo_url}}" alt="{{company_name}}" class="logo">{{/if}}
      <div class="header-text">Professional Correspondence</div>
    </div>
    <div class="content">
      {{body}}
      <div class="vcard">
        <div class="vcard-name">{{user_name}}</div>
        <div class="vcard-title">{{user_job_title}}</div>
        <div class="vcard-company">{{company_name}}</div>
        <div class="vcard-contact">
          {{#if user_phone}}T: {{user_phone}}{{/if}}
          {{#if user_website}}<br>W: {{user_website}}{{/if}}
        </div>
      </div>
    </div>
    <div class="footer">
      {{company_name}} | {{company_address}} | {{company_phone}}
    </div>
  </div>
</body>
</html>`
    },

    // ===== MINIMALIST TEMPLATES =====
    {
        id: 'minimalist-simple',
        name: 'Minimalist Simple',
        category: 'minimalist',
        thumbnail: '',
        html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { margin: 0; padding: 0; font-family: 'Helvetica', 'Arial', sans-serif; background-color: #ffffff; }
    .container { max-width: 560px; margin: 60px auto; padding: 0 20px; }
    .logo { max-width: 100px; margin-bottom: 40px; }
    .content { color: #000; line-height: 1.8; font-size: 15px; }
    .signature { margin-top: 50px; font-size: 14px; }
    .signature-name { font-weight: 600; }
    .signature-details { color: #666; margin-top: 8px; }
    .accent-line { width: 40px; height: 2px; background: {{primary_color}}; margin: 40px 0; }
  </style>
</head>
<body>
  <div class="container">
    {{#if logo_url}}<img src="{{logo_url}}" alt="{{company_name}}" class="logo">{{/if}}
    <div class="content">
      {{body}}
    </div>
    <div class="accent-line"></div>
    <div class="signature">
      <div class="signature-name">{{user_name}}</div>
      <div class="signature-details">
        {{user_job_title}}<br>
        {{company_name}}
        {{#if user_phone}}<br>{{user_phone}}{{/if}}
        {{#if user_website}}<br>{{user_website}}{{/if}}
      </div>
    </div>
  </div>
</body>
</html>`
    },

    {
        id: 'minimalist-elegant',
        name: 'Minimalist Elegant',
        category: 'minimalist',
        thumbnail: '',
        html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { margin: 0; padding: 0; font-family: 'Lato', 'Helvetica Neue', sans-serif; background-color: #fefefe; }
    .container { max-width: 580px; margin: 80px auto; padding: 0 30px; }
    .header-minimal { margin-bottom: 50px; }
    .logo-minimal { max-width: 90px; opacity: 0.9; }
    .content { color: #1a1a1a; line-height: 2; font-size: 15px; font-weight: 300; }
    .signature-minimal { margin-top: 60px; padding-top: 25px; border-top: 1px solid #e0e0e0; }
    .sig-name { font-weight: 400; font-size: 15px; letter-spacing: 0.5px; }
    .sig-meta { color: #888; font-size: 13px; margin-top: 6px; font-weight: 300; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header-minimal">
      {{#if logo_url}}<img src="{{logo_url}}" alt="{{company_name}}" class="logo-minimal">{{/if}}
    </div>
    <div class="content">
      {{body}}
    </div>
    <div class="signature-minimal">
      <div class="sig-name">{{user_name}}</div>
      <div class="sig-meta">{{user_job_title}} · {{company_name}}</div>
      {{#if user_phone}}<div class="sig-meta">{{user_phone}}</div>{{/if}}
      {{#if user_website}}<div class="sig-meta">{{user_website}}</div>{{/if}}
    </div>
  </div>
</body>
</html>`
    },

    {
        id: 'minimalist-zen',
        name: 'Minimalist Zen',
        category: 'minimalist',
        thumbnail: '',
        html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { margin: 0; padding: 0; font-family: 'Courier New', monospace; background: #f9f9f9; }
    .container { max-width: 500px; margin: 100px auto; background: white; padding: 60px 40px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
    .zen-logo { max-width: 70px; margin-bottom: 50px; filter: grayscale(100%); opacity: 0.7; }
    .content { color: #333; line-height: 1.9; font-size: 14px; }
    .zen-divider { width: 30px; height: 1px; background: #ccc; margin: 50px 0; }
    .zen-signature { font-size: 13px; color: #666; }
    .zen-name { color: #000; margin-bottom: 5px; }
  </style>
</head>
<body>
  <div class="container">
    {{#if logo_url}}<img src="{{logo_url}}" alt="{{company_name}}" class="zen-logo">{{/if}}
    <div class="content">{{body}}</div>
    <div class="zen-divider"></div>
    <div class="zen-signature">
      <div class="zen-name">{{user_name}}</div>
      <div>{{user_job_title}}</div>
      <div>{{company_name}}</div>
      {{#if user_phone}}<div>{{user_phone}}</div>{{/if}}
    </div>
  </div>
</body>
</html>`
    },

    // ===== BILLING/INVOICE TEMPLATES =====
    {
        id: 'billing-structured',
        name: 'Billing Structured',
        category: 'billing',
        thumbnail: '',
        html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { margin: 0; padding: 0; font-family: 'Arial', sans-serif; background: #f4f4f4; }
    .container { max-width: 650px; margin: 20px auto; background: white; }
    .header-billing { background: {{primary_color}}; padding: 25px 40px; color: white; }
    .header-billing h1 { margin: 0; font-size: 22px; font-weight: 700; }
    .header-billing .tagline { margin-top: 5px; font-size: 13px; opacity: 0.9; }
    .logo-billing { max-width: 130px; margin-bottom: 15px; filter: brightness(0) invert(1); }
    .content { padding: 35px 40px; color: #333; line-height: 1.7; font-size: 14px; }
    .info-grid { display: table; width: 100%; margin: 30px 0; border-top: 2px solid {{primary_color}}; padding-top: 20px; }
    .info-row { display: table-row; }
    .info-label { display: table-cell; font-weight: 700; padding: 8px 0; width: 30%; color: #666; font-size: 12px; text-transform: uppercase; }
    .info-value { display: table-cell; padding: 8px 0; color: #333; }
    .footer-billing { background: #2c2c2c; color: #ccc; padding: 20px 40px; font-size: 12px; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header-billing">
      {{#if logo_url}}<img src="{{logo_url}}" alt="{{company_name}}" class="logo-billing">{{/if}}
      <h1>{{company_name}}</h1>
      <div class="tagline">Professional Services</div>
    </div>
    <div class="content">
      {{body}}
      <div class="info-grid">
        <div class="info-row">
          <div class="info-label">From:</div>
          <div class="info-value">{{user_name}}, {{user_job_title}}</div>
        </div>
        <div class="info-row">
          <div class="info-label">Company:</div>
          <div class="info-value">{{company_name}}</div>
        </div>
        {{#if user_phone}}
        <div class="info-row">
          <div class="info-label">Phone:</div>
          <div class="info-value">{{user_phone}}</div>
        </div>
        {{/if}}
        {{#if user_website}}
        <div class="info-row">
          <div class="info-label">Website:</div>
          <div class="info-value">{{user_website}}</div>
        </div>
        {{/if}}
      </div>
    </div>
    <div class="footer-billing">
      {{company_name}} | {{company_address}} | {{company_phone}}
    </div>
  </div>
</body>
</html>`
    },

    {
        id: 'billing-professional',
        name: 'Billing Professional',
        category: 'billing',
        thumbnail: '',
        html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, sans-serif; background: #e9ecef; }
    .invoice-container { max-width: 700px; margin: 30px auto; background: white; border: 1px solid #dee2e6; }
    .invoice-header { padding: 30px 40px; background: linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%); border-bottom: 3px solid {{primary_color}}; }
    .invoice-logo { max-width: 160px; margin-bottom: 20px; }
    .invoice-title { font-size: 28px; font-weight: 700; color: {{primary_color}}; margin: 0; }
    .invoice-subtitle { color: #6c757d; font-size: 14px; margin-top: 5px; }
    .invoice-body { padding: 40px; }
    .content-text { color: #495057; line-height: 1.8; font-size: 15px; }
    .signature-section { margin-top: 50px; padding: 25px; background: #f8f9fa; border-radius: 8px; border: 1px solid #e9ecef; }
    .sig-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; font-size: 14px; }
    .sig-item-label { font-weight: 600; color: #6c757d; font-size: 11px; text-transform: uppercase; margin-bottom: 4px; }
    .sig-item-value { color: #212529; }
    .invoice-footer { padding: 25px 40px; background: #343a40; color: #adb5bd; text-align: center; font-size: 13px; }
  </style>
</head>
<body>
  <div class="invoice-container">
    <div class="invoice-header">
      {{#if logo_url}}<img src="{{logo_url}}" alt="{{company_name}}" class="invoice-logo">{{/if}}
      <h1 class="invoice-title">Professional Communication</h1>
      <div class="invoice-subtitle">From {{company_name}}</div>
    </div>
    <div class="invoice-body">
      <div class="content-text">{{body}}</div>
      <div class="signature-section">
        <div class="sig-grid">
          <div>
            <div class="sig-item-label">Sent By</div>
            <div class="sig-item-value">{{user_name}}</div>
          </div>
          <div>
            <div class="sig-item-label">Position</div>
            <div class="sig-item-value">{{user_job_title}}</div>
          </div>
          <div>
            <div class="sig-item-label">Company</div>
            <div class="sig-item-value">{{company_name}}</div>
          </div>
          {{#if user_phone}}
          <div>
            <div class="sig-item-label">Phone</div>
            <div class="sig-item-value">{{user_phone}}</div>
          </div>
          {{/if}}
        </div>
      </div>
    </div>
    <div class="invoice-footer">
      {{company_name}} · {{company_address}} · {{company_website}}
    </div>
  </div>
</body>
</html>`
    },

    // ===== CREATIVE TEMPLATES =====
    {
        id: 'creative-vibrant',
        name: 'Creative Vibrant',
        category: 'creative',
        thumbnail: '',
        html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { margin: 0; padding: 0; font-family: 'Poppins', sans-serif; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
    .creative-wrapper { max-width: 600px; margin: 40px auto; }
    .creative-card { background: white; border-radius: 20px; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,0.3); }
    .creative-header { background: linear-gradient(135deg, {{primary_color}} 0%, {{secondary_color}} 100%); padding: 50px 35px; text-align: center; position: relative; }
    .creative-header::before { content: ''; position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 120"><path fill="rgba(255,255,255,0.1)" d="M0,0V46.29c47.79,22.2,103.59,32.17,158,28,70.36-5.37,136.33-33.31,206.8-37.5C438.64,32.43,512.34,53.67,583,72.05c69.27,18,138.3,24.88,209.4,13.08,36.15-6,69.85-17.84,104.45-29.34C989.49,25,1113-14.29,1200,52.47V0Z" opacity=".25"/></svg>'); background-size: cover; opacity: 0.3; }
    .creative-logo { max-width: 140px; position: relative; z-index: 1; filter: brightness(0) invert(1); }
    .creative-subtitle { color: rgba(255,255,255,0.9); margin-top: 15px; font-size: 16px; font-weight: 300; position: relative; z-index: 1; }
    .creative-content { padding: 45px 35px; color: #2d3748; line-height: 1.8; font-size: 15px; }
    .creative-sig { margin-top: 40px; padding: 25px; background: linear-gradient(135deg, #f7fafc 0%, #edf2f7 100%); border-radius: 15px; text-align: center; }
    .creative-sig-name { font-weight: 700; font-size: 19px; color: #1a202c; }
    .creative-sig-role { color: #718096; margin-top: 8px; font-size: 14px; }
    .creative-sig-contact { color: #a0aec0; font-size: 13px; margin-top: 10px; }
  </style>
</head>
<body>
  <div class="creative-wrapper">
    <div class="creative-card">
      <div class="creative-header">
        {{#if logo_url}}<img src="{{logo_url}}" alt="{{company_name}}" class="creative-logo">{{/if}}
        <div class="creative-subtitle">{{company_name}}</div>
      </div>
      <div class="creative-content">
        {{body}}
        <div class="creative-sig">
          <div class="creative-sig-name">{{user_name}}</div>
          <div class="creative-sig-role">{{user_job_title}}</div>
          <div class="creative-sig-role">{{company_name}}</div>
          <div class="creative-sig-contact">
            {{#if user_phone}}{{user_phone}}{{/if}}
            {{#if user_website}} · {{user_website}}{{/if}}
          </div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`
    },

    {
        id: 'creative-playful',
        name: 'Creative Playful',
        category: 'creative',
        thumbnail: '',
        html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { margin: 0; padding: 0; font-family: 'Comic Sans MS', 'Chalkboard SE', sans-serif; background: #fff5e6; }
    .playful-container { max-width: 580px; margin: 30px auto; background: white; border: 8px solid {{primary_color}}; border-radius: 30px; padding: 40px; box-shadow: 12px 12px 0 rgba(0,0,0,0.1); }
    .playful-logo { max-width: 120px; margin-bottom: 25px; }
    .playful-title { font-size: 26px; color: {{primary_color}}; font-weight: bold; transform: rotate(-2deg); display: inline-block; }
    .playful-content { color: #333; line-height: 1.9; font-size: 15px; margin-top: 30px; }
    .playful-sig { margin-top: 40px; padding: 20px; background: #fffacd; border-left: 6px solid {{primary_color}}; border-radius: 0 15px 15px 0; transform: rotate(1deg); }
    .playful-sig-name { font-weight: bold; font-size: 18px; color: #333; }
    .playful-sig-details { color: #666; margin-top: 8px; font-size: 14px; }
  </style>
</head>
<body>
  <div class="playful-container">
    {{#if logo_url}}<img src="{{logo_url}}" alt="{{company_name}}" class="playful-logo">{{/if}}
    <div class="playful-title">Hello! ✨</div>
    <div class="playful-content">{{body}}</div>
    <div class="playful-sig">
      <div class="playful-sig-name">— {{user_name}}</div>
      <div class="playful-sig-details">
        {{user_job_title}} @ {{company_name}}<br>
        {{#if user_phone}}📞 {{user_phone}}<br>{{/if}}
        {{#if user_website}}🌐 {{user_website}}{{/if}}
      </div>
    </div>
  </div>
</body>
</html>`
    },

    {
        id: 'creative-artistic',
        name: 'Creative Artistic',
        category: 'creative',
        thumbnail: '',
        html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { margin: 0; padding: 0; font-family: 'Garamond', 'Georgia', serif; background: linear-gradient(to bottom, #fdfbfb 0%, #ebedee 100%); }
    .artistic-frame { max-width: 650px; margin: 50px auto; background: white; padding: 50px; box-shadow: 0 30px 60px rgba(0,0,0,0.12); border: 20px solid #f8f8f8; position: relative; }
    .artistic-frame::before { content: ''; position: absolute; top: 10px; right: 10px; bottom: 10px; left: 10px; border: 2px solid {{primary_color}}; pointer-events: none; }
    .artistic-logo { max-width: 110px; margin-bottom: 30px; position: relative; z-index: 1; }
    .artistic-content { color: #2c2c2c; line-height: 2; font-size: 16px; position: relative; z-index: 1; }
    .artistic-divider { width: 60px; height: 3px; background: linear-gradient(90deg, {{primary_color}} 0%, transparent 100%); margin: 40px 0; }
    .artistic-sig { position: relative; z-index: 1; font-style: italic; }
    .artistic-sig-name { font-weight: 600; font-size: 18px; color: #1a1a1a; font-style: normal; }
    .artistic-sig-info { color: #666; margin-top: 8px; font-size: 14px; }
    .artistic-watermark { position: absolute; bottom: 20px; right: 20px; font-size: 10px; color: #ccc; text-transform: uppercase; letter-spacing: 2px; }
  </style>
</head>
<body>
  <div class="artistic-frame">
    {{#if logo_url}}<img src="{{logo_url}}" alt="{{company_name}}" class="artistic-logo">{{/if}}
    <div class="artistic-content">{{body}}</div>
    <div class="artistic-divider"></div>
    <div class="artistic-sig">
      <div class="artistic-sig-name">{{user_name}}</div>
      <div class="artistic-sig-info">
        {{user_job_title}}<br>
        {{company_name}}
        {{#if user_phone}}<br>{{user_phone}}{{/if}}
        {{#if user_website}}<br>{{user_website}}{{/if}}
      </div>
    </div>
    <div class="artistic-watermark">{{company_name}}</div>
  </div>
</body>
</html>`
    },

    {
        id: 'signature-focused',
        name: 'Signature Focused',
        category: 'minimalist',
        thumbnail: '',
        html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { margin: 0; padding: 0; font-family: 'Verdana', sans-serif; background-color: #ffffff; }
    .email-wrapper { max-width: 600px; margin: 40px auto; padding: 0 20px; }
    .email-body { color: #333; line-height: 1.8; font-size: 15px; margin-bottom: 40px; }
    .signature-box { border-top: 3px double {{primary_color}}; padding-top: 25px; margin-top: 40px; }
    .sig-row { margin-bottom: 15px; }
    .sig-photo { width: 80px; height: 80px; border-radius: 50%; object-fit: cover; float: left; margin-right: 20px; }
    .sig-details { overflow: hidden; }
    .sig-name-large { font-size: 20px; font-weight: 700; color: {{primary_color}}; margin-bottom: 5px; }
    .sig-title-large { font-size: 14px; color: #666; margin-bottom: 3px; }
    .sig-company-large { font-size: 14px; color: #333; font-weight: 600; margin-bottom: 10px; }
    .sig-contact-line { font-size: 13px; color: #555; margin: 3px 0; }
    .sig-logo-small { max-width: 100px; margin-top: 15px; opacity: 0.7; }
  </style>
</head>
<body>
  <div class="email-wrapper">
    <div class="email-body">{{body}}</div>
    <div class="signature-box">
      {{#if logo_url}}<img src="{{logo_url}}" alt="Photo" class="sig-photo">{{/if}}
      <div class="sig-details">
        <div class="sig-name-large">{{user_name}}</div>
        <div class="sig-title-large">{{user_job_title}}</div>
        <div class="sig-company-large">{{company_name}}</div>
        {{#if user_phone}}<div class="sig-contact-line">📞 {{user_phone}}</div>{{/if}}
        {{#if user_website}}<div class="sig-contact-line">🌐 {{user_website}}</div>{{/if}}
        <div class="sig-contact-line">📧 {{company_name}}</div>
        {{#if company_address}}<div class="sig-contact-line">📍 {{company_address}}</div>{{/if}}
      </div>
    </div>
  </div>
</body>
</html>`
    }
];

/**
 * Get template by ID
 */
export const getTemplateById = (id: string): EmailTemplateDefinition | undefined => {
    return EMAIL_TEMPLATES.find(t => t.id === id);
};

/**
 * Get templates by category
 */
export const getTemplatesByCategory = (category: string): EmailTemplateDefinition[] => {
    return EMAIL_TEMPLATES.filter(t => t.category === category);
};
