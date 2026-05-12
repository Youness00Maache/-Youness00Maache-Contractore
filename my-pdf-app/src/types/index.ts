export interface UserProfile {
    id: string;
    name: string;
    email: string;
    // Add other relevant fields as needed
}

export interface DailyJobReportData {
    date: string;
    reportNumber: string;
    projectName: string;
    weather: string;
    temperature: string;
    content?: string;
    signatureUrl?: string;
    themeColors?: {
        primary?: string;
    };
    // Add other relevant fields as needed
}

export interface NoteData {
    title?: string;
    content: string;
    themeColors?: {
        primary?: string;
    };
    // Add other relevant fields as needed
}