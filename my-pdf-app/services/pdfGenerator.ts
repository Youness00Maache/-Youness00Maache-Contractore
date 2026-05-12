import { adaptTemplateForContentDocument } from '../utils/templates/templateAdapters.ts';
import { UserProfile, DailyJobReportData, NoteData } from '../types';
import { jsPDF } from 'jspdf';
import { renderHtmlToPdf, drawTemplateBackground, loadImage, hexToRgb } from './helpers'; // Assuming these functions are defined in helpers

export const generateDailyJobReportPDF = async (profile: UserProfile, data: DailyJobReportData, templateId: string, getBlob: boolean = false) => {
    const doc = new jsPDF();

    const htmlTemplates = ['template_html', 'template_html_2', 'template_html_2_new', 'template_html_3', 'template_html_4', 'template_neon', 'template_luxury', 'template_nature', 'template_geometric', 'template_pastel', 'template_vintage', 'template_blueprint', 'template_memphis', 'template_crimson', 'template_watercolor', 'template_swiss', 'template_space', 'template_retro', 'template_pop', 'template_serif'];
    
    if (htmlTemplates.includes(templateId)) {
        let templateFn = getAdvancedHtmlTemplate;
        if (templateId === 'template_html_2') templateFn = getHighEndHtmlTemplate;
        if (templateId === 'template_html_2_new') templateFn = getGlassmorphismModernHtmlTemplate;
        if (templateId === 'template_html_3') templateFn = getPremiumMinimalistHtmlTemplate;
        if (templateId === 'template_html_4') templateFn = getGradientBorderPremiumHtmlTemplate;
        if (templateId === 'template_neon') templateFn = getNeonCyberpunkHtmlTemplate;
        if (templateId === 'template_luxury') templateFn = getLuxuryGoldNavyHtmlTemplate;
        if (templateId === 'template_nature') templateFn = getOrganicNatureHtmlTemplate;
        if (templateId === 'template_geometric') templateFn = getGeometricBoldHtmlTemplate;
        if (templateId === 'template_pastel') templateFn = getPastelSoftHtmlTemplate;
        if (templateId === 'template_vintage') templateFn = getVintageCraftHtmlTemplate;
        if (templateId === 'template_blueprint') templateFn = getBlueprintTechHtmlTemplate;
        if (templateId === 'template_memphis') templateFn = getAbstractMemphisHtmlTemplate;
        if (templateId === 'template_crimson') templateFn = getCrimsonNoirHtmlTemplate;
        if (templateId === 'template_watercolor') templateFn = getWatercolorArtisticHtmlTemplate;
        if (templateId === 'template_swiss') templateFn = getSwissGridHtmlTemplate;
        if (templateId === 'template_space') templateFn = getSpaceOdysseyHtmlTemplate;
        if (templateId === 'template_retro') templateFn = getRetroTerminalHtmlTemplate;
        if (templateId === 'template_pop') templateFn = getPlayfulPopHtmlTemplate;
        if (templateId === 'template_serif') templateFn = getElegantSerifHtmlTemplate;

        const html = adaptTemplateForContentDocument(
            templateFn,
            data,
            profile,
            'DAILY REPORT',
            {
                date: 'Date',
                dateValue: data.date,
                id: 'Report #',
                idValue: data.reportNumber
            }
        );

        await renderHtmlToPdf(doc, html, 0, 0, 210);

        if (getBlob) return doc.output('datauristring');
        doc.save(`DailyReport-${data.date}.pdf`);
        return;
    }

    const template = templates[templateId] || templates.standard;
    const primaryRgb = hexToRgb(data.themeColors?.primary || template.primaryColor) || [0, 0, 0];

    const yPos = await drawDocumentHeader(doc, data, profile, template, primaryRgb, 'DAILY REPORT', 'Date', data.date, 'Report #', data.reportNumber);

    let currentY = yPos + 5;

    doc.setFontSize(10);
    doc.setFont(template.font, 'bold');
    doc.text('Project:', 20, currentY);
    doc.setFont(template.font, 'normal');
    doc.text(data.projectName, 40, currentY);

    doc.setFont(template.font, 'bold');
    doc.text('Weather:', 120, currentY);
    doc.setFont(template.font, 'normal');
    doc.text(`${data.weather} / ${data.temperature}`, 140, currentY);
    currentY += 10;

    if (data.content) {
        currentY = await renderHtmlToPdf(doc, data.content, 20, currentY, 170, () => {
            drawTemplateBackground(doc, template, primaryRgb);
        });
    }

    currentY += 10;
    if (data.signatureUrl) {
        const sig = await loadImage(data.signatureUrl);
        if (sig) {
            if (currentY > doc.internal.pageSize.height - 40) {
                doc.addPage();
                drawTemplateBackground(doc, template, primaryRgb);
                currentY = 20;
            }
            doc.addImage(sig.data, sig.format, 20, currentY, 40, 15);
            doc.line(20, currentY + 15, 80, currentY + 15);
            doc.setFontSize(9);
            doc.text('Signed By Foreman/Superintendent', 20, currentY + 20);
        }
    }

    if (getBlob) return doc.output('datauristring');
    doc.save(`DailyReport-${data.date}.pdf`);
};

export const generateNotePDF = async (profile: UserProfile, job: Job, data: NoteData, templateId: string, getBlob: boolean = false) => {
    const doc = new jsPDF();

    const htmlTemplates = ['template_html', 'template_html_2', 'template_html_2_new', 'template_html_3', 'template_html_4', 'template_neon', 'template_luxury', 'template_nature', 'template_geometric', 'template_pastel', 'template_vintage', 'template_blueprint', 'template_memphis', 'template_crimson', 'template_watercolor', 'template_swiss', 'template_space', 'template_retro', 'template_pop', 'template_serif'];
    
    if (htmlTemplates.includes(templateId)) {
        let templateFn = getAdvancedHtmlTemplate;
        if (templateId === 'template_html_2') templateFn = getHighEndHtmlTemplate;
        if (templateId === 'template_html_2_new') templateFn = getGlassmorphismModernHtmlTemplate;
        if (templateId === 'template_html_3') templateFn = getPremiumMinimalistHtmlTemplate;
        if (templateId === 'template_html_4') templateFn = getGradientBorderPremiumHtmlTemplate;
        if (templateId === 'template_neon') templateFn = getNeonCyberpunkHtmlTemplate;
        if (templateId === 'template_luxury') templateFn = getLuxuryGoldNavyHtmlTemplate;
        if (templateId === 'template_nature') templateFn = getOrganicNatureHtmlTemplate;
        if (templateId === 'template_geometric') templateFn = getGeometricBoldHtmlTemplate;
        if (templateId === 'template_pastel') templateFn = getPastelSoftHtmlTemplate;
        if (templateId === 'template_vintage') templateFn = getVintageCraftHtmlTemplate;
        if (templateId === 'template_blueprint') templateFn = getBlueprintTechHtmlTemplate;
        if (templateId === 'template_memphis') templateFn = getAbstractMemphisHtmlTemplate;
        if (templateId === 'template_crimson') templateFn = getCrimsonNoirHtmlTemplate;
        if (templateId === 'template_watercolor') templateFn = getWatercolorArtisticHtmlTemplate;
        if (templateId === 'template_swiss') templateFn = getSwissGridHtmlTemplate;
        if (templateId === 'template_space') templateFn = getSpaceOdysseyHtmlTemplate;
        if (templateId === 'template_retro') templateFn = getRetroTerminalHtmlTemplate;
        if (templateId === 'template_pop') templateFn = getPlayfulPopHtmlTemplate;
        if (templateId === 'template_serif') templateFn = getElegantSerifHtmlTemplate;

        const html = adaptTemplateForContentDocument(
            templateFn,
            data,
            profile,
            data.title || 'NOTE',
            {
                date: 'Created',
                dateValue: new Date().toLocaleDateString(),
                id: 'Note',
                idValue: data.title || 'Untitled'
            }
        );

        await renderHtmlToPdf(doc, html, 0, 0, 210);

        if (getBlob) return doc.output('datauristring');
        doc.save(`${data.title || 'Note'}.pdf`);
        return;
    }

    const template = templates[templateId] || templates.standard;
    const primaryRgb = hexToRgb(data.themeColors?.primary || template.primaryColor) || [0, 0, 0];

    drawTemplateBackground(doc, template, primaryRgb);

    doc.setFont(template.headerFont, 'bold');
    doc.setFontSize(20);
    doc.text(data.title || 'Note', 20, 20);

    await renderHtmlToPdf(doc, data.content, 20, 30, 170, () => {
        drawTemplateBackground(doc, template, primaryRgb);
    });

    if (getBlob) return doc.output('datauristring');
    doc.save(`${data.title || 'Note'}.pdf`);
};