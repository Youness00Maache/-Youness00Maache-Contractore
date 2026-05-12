import { generateDailyJobReportPDF } from './services/pdfGenerator';
import { generateNotePDF } from './services/pdfGenerator';

// Initialize application
const init = async () => {
    // Example usage of PDF generation functions
    const userProfile = { /* User profile data */ };
    const dailyReportData = { /* Daily report data */ };
    const noteData = { /* Note data */ };

    // Generate Daily Job Report PDF
    await generateDailyJobReportPDF(userProfile, dailyReportData, 'template_html');

    // Generate Note PDF
    await generateNotePDF(userProfile, { /* Job data */ }, noteData, 'template_html');
};

// Start the application
init();