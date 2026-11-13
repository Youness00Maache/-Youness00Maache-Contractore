import * as D from '../../utils/templates/documentHtmlTemplates.ts';
import * as N from '../../utils/templates/allNewTemplates.ts';
import { adaptTemplateForContentDocument } from '../../utils/templates/templateAdapters.ts';

const fns: Record<string, any> = {
  template_html: D.getAdvancedHtmlTemplate,
  template_html_2: D.getHighEndHtmlTemplate,
  template_html_2_new: D.getGlassmorphismModernHtmlTemplate,
  template_html_3: D.getPremiumMinimalistHtmlTemplate,
  template_html_4: D.getGradientBorderPremiumHtmlTemplate,
  template_neon: N.getNeonCyberpunkHtmlTemplate,
  template_luxury: N.getLuxuryGoldNavyHtmlTemplate,
  template_nature: N.getOrganicNatureHtmlTemplate,
  template_geometric: N.getGeometricBoldHtmlTemplate,
  template_pastel: N.getPastelSoftHtmlTemplate,
  template_vintage: N.getVintageCraftHtmlTemplate,
  template_blueprint: N.getBlueprintTechHtmlTemplate,
  template_memphis: N.getAbstractMemphisHtmlTemplate,
  template_crimson: N.getCrimsonNoirHtmlTemplate,
  template_watercolor: N.getWatercolorArtisticHtmlTemplate,
  template_swiss: N.getSwissGridHtmlTemplate,
  template_space: N.getSpaceOdysseyHtmlTemplate,
  template_retro: N.getRetroTerminalHtmlTemplate,
  template_pop: N.getPlayfulPopHtmlTemplate,
  template_serif: N.getElegantSerifHtmlTemplate,
};

const profile: any = { companyName: 'Acme', address: '1 Main', phone: '555', website: 'acme.com', email: 'a@b.c', logoUrl: '' };
const invoice: any = {
  invoiceNumber: 'INV-1', issueDate: '2026-01-05', dueDate: '2026-02-05', status: 'Draft', clientName: 'Bob', clientAddress: '2 Elm',
  lineItems: [{ id: '1', description: 'A', quantity: 2, rate: 100, percentComplete: 50 }],
  taxRate: 10, discount: 20, shipping: 5, notes: 'N', signatureUrl: 'data:image/png;base64,AAA', isProgressBilling: false,
  themeColors: { primary: '#112233', secondary: '#445566' },
};
// expected UI total: sub 200 - disc 20 = 180; tax 18; +ship 5 => 203
const labels = { date: 'Date', dateValue: invoice.issueDate, id: 'Invoice #', idValue: invoice.invoiceNumber };
const report: any = { reportNumber: 'DR-1', date: '2026-01-05', content: '<p>CONTENT_MARKER</p>', projectName: 'P', clientName: 'Bob', projectAddress: '2 Elm', signatureUrl: 'data:image/png;base64,SIG', ai_visual_data: { metrics: [{ label: 'AIMARK', value: 1 }], progress_percentage: 40 } };

for (const [id, fn] of Object.entries(fns)) {
  const out: string[] = [];
  let html = '';
  try { html = fn(invoice, profile, 'INVOICE', labels); } catch (e: any) { out.push('THROW:' + e.message); }
  if (html) {
    if (/undefined/.test(html)) out.push('has"undefined"');
    if (/NaN/.test(html)) out.push('NaN');
    if (/Invalid Date/.test(html)) out.push('InvalidDate');
    if (!html.includes('203.00')) {
      const m = html.match(/\$\d[\d,]*\.\d\d/g) || [];
      out.push('total!=203 (amounts: ' + Array.from(new Set(m)).slice(-3).join(',') + ')');
    }
    if (!html.includes('AAA')) out.push('noSignature');
  }
  let rep = '';
  try { rep = adaptTemplateForContentDocument(fn, report, profile, 'DAILY REPORT', { date: 'Date', dateValue: report.date, id: 'Report #', idValue: report.reportNumber }); } catch (e: any) { out.push('ADAPT_THROW:' + e.message); }
  if (rep) {
    if (!rep.includes('CONTENT_MARKER')) out.push('REPORT_CONTENT_DROPPED');
    const aiCount = (rep.match(/AIMARK/g) || []).length;
    if (aiCount !== 1) out.push('AI_visuals_x' + aiCount);
    if (/undefined/.test(rep)) out.push('report"undefined"');
    if (/Invalid Date/.test(rep)) out.push('report InvalidDate');
    if (!rep.includes('SIG')) out.push('reportNoSignature');
  }
  console.log(id.padEnd(22), out.join(' | ') || 'OK');
}
// XSS check
const evil: any = { ...invoice, clientName: '<img src=x onerror=alert(1)>' };
console.log('XSS escaped?', !fns.template_html(evil, profile, 'INVOICE', labels).includes('<img src=x onerror'));
