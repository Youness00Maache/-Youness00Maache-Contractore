import React from 'react';

// Base Icon Component for consistency (Filled/Solid style)
const IconBase: React.FC<React.SVGProps<SVGSVGElement>> = ({ children, ...props }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="currentColor"
    stroke="none"
    {...props}
  >
    {children}
  </svg>
);

// Navigation & UI (Stroke based for UI elements)
const StrokeIcon: React.FC<React.SVGProps<SVGSVGElement>> = ({ children, ...props }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    {children}
  </svg>
);

export const AppLogo: React.FC<React.ImgHTMLAttributes<HTMLImageElement>> = (props) => (
  <img src="https://images.contractordocs.app/contractor-icon.png" alt="App Logo" loading="eager" {...props} />
);

// --- Navigation & UI ---
export const BackArrowIcon = (props: any) => <StrokeIcon {...props}><path d="m15 18-6-6 6-6" /></StrokeIcon>;
export const HomeIcon = (props: any) => <StrokeIcon {...props}><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></StrokeIcon>;
export const SettingsIcon = (props: any) => <StrokeIcon {...props}><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 0 2l-.15.08a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1 0-2l.15-.08a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></StrokeIcon>;
export const PlusIcon = (props: any) => <StrokeIcon {...props}><path d="M5 12h14" /><path d="M12 5v14" /></StrokeIcon>;
export const SearchIcon = (props: any) => <StrokeIcon {...props}><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></StrokeIcon>;
export const UserIcon = (props: any) => <StrokeIcon {...props}><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></StrokeIcon>;
export const UsersIcon = (props: any) => <StrokeIcon {...props}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></StrokeIcon>;
export const LogoutIcon = (props: any) => <StrokeIcon {...props}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" x2="9" y1="12" y2="12" /></StrokeIcon>;
export const TrashIcon = (props: any) => <StrokeIcon {...props}><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></StrokeIcon>;
export const CheckCircleIcon = (props: any) => <StrokeIcon {...props}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></StrokeIcon>;
export const XCircleIcon = (props: any) => <StrokeIcon {...props}><circle cx="12" cy="12" r="10" /><path d="m15 9-6 6" /><path d="m9 9 6 6" /></StrokeIcon>;
export const ClockIcon = (props: any) => <StrokeIcon {...props}><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></StrokeIcon>;
export const CreditCardIcon = (props: any) => <StrokeIcon {...props}><rect width="20" height="14" x="2" y="5" rx="2" /><line x1="2" x2="22" y1="10" y2="10" /></StrokeIcon>;
export const BriefcaseIcon = (props: any) => <StrokeIcon {...props}><rect width="20" height="14" x="2" y="7" rx="2" ry="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></StrokeIcon>;
export const SunIcon = (props: any) => <StrokeIcon {...props}><circle cx="12" cy="12" r="4" /><path d="M12 2v2" /><path d="M12 20v2" /><path d="m4.93 4.93 1.41 1.41" /><path d="m17.66 17.66 1.41 1.41" /><path d="M2 12h2" /><path d="M20 12h2" /><path d="m6.34 17.66-1.41 1.41" /><path d="m19.07 4.93-1.41 1.41" /></StrokeIcon>;
export const MoonIcon = (props: any) => <StrokeIcon {...props}><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" /></StrokeIcon>;
export const DropletIcon = (props: any) => <StrokeIcon {...props}><path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z" /></StrokeIcon>;
export const LanguageIcon = (props: any) => <StrokeIcon {...props}><circle cx="12" cy="12" r="10" /><line x1="2" x2="22" y1="12" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></StrokeIcon>;
export const ChevronDownIcon = (props: any) => <StrokeIcon {...props}><path d="m6 9 6 6 6-6" /></StrokeIcon>;
export const EyeIcon = (props: any) => <StrokeIcon {...props}><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></StrokeIcon>;
export const EyeOffIcon = (props: any) => <StrokeIcon {...props}><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" /><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" /><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" /><line x1="2" x2="22" y1="2" y2="22" /></StrokeIcon>;
export const CalendarIcon = (props: any) => <StrokeIcon {...props}><rect width="18" height="18" x="3" y="4" rx="2" ry="2" /><line x1="16" x2="16" y1="2" y2="6" /><line x1="8" x2="8" y1="2" y2="6" /><line x1="3" x2="21" y1="10" y2="10" /></StrokeIcon>;
export const TruckIcon = (props: any) => <StrokeIcon {...props}><rect width="16" height="13" x="2" y="5" rx="2" /><path d="M18 12h2.33a2 2 0 0 0 1.66-3.23l-1.5-2.33a2 2 0 0 0-1.66-.9h-2.83" /><path d="M5 18v2" /><path d="M19 18v2" /></StrokeIcon>;
export const BellIcon = (props: any) => <StrokeIcon {...props}><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></StrokeIcon>;
export const MailIcon = (props: any) => <StrokeIcon {...props}><rect width="20" height="16" x="2" y="4" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" /></StrokeIcon>;
export const CopyIcon = (props: any) => <StrokeIcon {...props}><rect width="14" height="14" x="8" y="8" rx="2" ry="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></StrokeIcon>;
export const ShareIcon = (props: any) => <StrokeIcon {...props}><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" /><polyline points="16 6 12 2 8 6" /><line x1="12" x2="12" y1="2" y2="15" /></StrokeIcon>;
export const PaperclipIcon = (props: any) => <StrokeIcon {...props}><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" /></StrokeIcon>;
export const BoxIcon = (props: any) => <StrokeIcon {...props}><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" x2="12" y1="22.08" y2="12" /></StrokeIcon>;
export const AlertTriangleIcon = (props: any) => <StrokeIcon {...props}><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><line x1="12" x2="12" y1="9" y2="13" /><line x1="12" x2="12.01" y1="17" y2="17" /></StrokeIcon>;
export const TagIcon = (props: any) => <StrokeIcon {...props}><path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z" /><path d="M7 7h.01" /></StrokeIcon>;
export const ConvertIcon = (props: any) => <StrokeIcon {...props}><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" /><path d="M8 16H3v5" /></StrokeIcon>;
export const GlobeIcon = (props: any) => <StrokeIcon {...props}><circle cx="12" cy="12" r="10" /><path d="M2 12h20" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></StrokeIcon>;
export const PercentIcon = (props: any) => <StrokeIcon {...props}><line x1="19" x2="5" y1="5" y2="19" /><circle cx="6.5" cy="6.5" r="2.5" /><circle cx="17.5" cy="17.5" r="2.5" /></StrokeIcon>;
export const CalculatorIcon = (props: any) => <StrokeIcon {...props}><rect width="16" height="20" x="4" y="2" rx="2" /><line x1="8" x2="16" y1="6" y2="6" /><line x1="8" x2="16" y1="18" y2="18" /><path d="M8 10h.01" /><path d="M12 10h.01" /><path d="M16 10h.01" /><path d="M8 14h.01" /><path d="M12 14h.01" /><path d="M16 14h.01" /></StrokeIcon>;
export const RefreshCwIcon = (props: any) => <StrokeIcon {...props}><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" /><path d="M8 16H3v5" /></StrokeIcon>;

// --- Actions ---
export const CameraIcon = (props: any) => <StrokeIcon {...props}><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" /><circle cx="12" cy="13" r="3" /></StrokeIcon>;
export const UploadImageIcon = (props: any) => <StrokeIcon {...props}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" x2="12" y1="3" y2="15" /></StrokeIcon>;
export const ExportIcon = (props: any) => <StrokeIcon {...props}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" x2="12" y1="15" y2="3" /></StrokeIcon>;
export const MicIcon = (props: any) => <StrokeIcon {...props}><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" x2="12" y1="19" y2="23" /><line x1="8" x2="16" y1="23" y2="23" /></StrokeIcon>;
export const PenIcon = (props: any) => <StrokeIcon {...props}><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></StrokeIcon>;
export const PaletteIcon = (props: any) => <StrokeIcon {...props}><circle cx="13.5" cy="6.5" r=".5" /><circle cx="17.5" cy="10.5" r=".5" /><circle cx="8.5" cy="7.5" r=".5" /><circle cx="6.5" cy="12.5" r=".5" /><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" /></StrokeIcon>;

// --- Social ---
export const GoogleIcon = (props: any) => <IconBase {...props} viewBox="0 0 48 48"><path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z" /><path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z" /><path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z" /><path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z" /></IconBase>;
export const FacebookIcon = (props: any) => <StrokeIcon {...props}><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" /></StrokeIcon>;
export const TwitterIcon = (props: any) => <StrokeIcon {...props}><path d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z" /></StrokeIcon>;
export const InstagramIcon = (props: any) => <StrokeIcon {...props}><rect width="20" height="20" x="2" y="2" rx="5" ry="5" /><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" /><line x1="17.5" x2="17.51" y1="6.5" y2="6.5" /></StrokeIcon>;
export const LinkedinIcon = (props: any) => <StrokeIcon {...props}><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" /><rect width="4" height="12" x="2" y="9" /><circle cx="4" cy="4" r="2" /></StrokeIcon>;

// --- Editor Icons (Google Docs Style / Standard Library Look) ---
export const BoldIcon = (props: any) => <IconBase {...props}><path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z" /><path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z" /></IconBase>;
export const ItalicIcon = (props: any) => <StrokeIcon {...props}><line x1="19" y1="4" x2="10" y2="4" /><line x1="14" y1="20" x2="5" y2="20" /><line x1="15" y1="4" x2="9" y2="20" /></StrokeIcon>;
export const UnderlineIcon = (props: any) => <StrokeIcon {...props}><path d="M6 3v7a6 6 0 0 0 6 6 6 6 0 0 0 6-6V3" /><line x1="4" y1="21" x2="20" y2="21" /></StrokeIcon>;
export const StrikethroughIcon = (props: any) => <StrokeIcon {...props}><path d="M16 4H9a3 3 0 0 0-2.83 2M14 12a4 4 0 0 1 0 8H6" /><line x1="4" y1="12" x2="20" y2="12" /></StrokeIcon>;
export const TextColorIcon = (props: any) => <StrokeIcon {...props}><path d="M4 20h16" /><path d="m6 16 6-14 6 14" /><path d="M8 12h8" /></StrokeIcon>;
export const HighlighterIcon = (props: any) => <StrokeIcon {...props}><path d="m9 11-6 6v3h9l3-3" /><path d="m22 7-9.08 9.08a.6.6 0 0 0-.17.41V20h3.5a.6.6 0 0 0 .41-.17l8.77-8.76A2.62 2.62 0 0 0 22 7.38a2.62 2.62 0 0 0 0-3.71v0a2.62 2.62 0 0 0-3.71 0z" /></StrokeIcon>;
export const RemoveFormatIcon = (props: any) => <StrokeIcon {...props}><path d="M2 12.5 L7 7.5 L12 12.5 L7 17.5 Z" fill="currentColor" className="text-muted-foreground" /><line x1="14" y1="4" x2="22" y2="4" /><line x1="18" y1="4" x2="18" y2="20" /><line x1="16" y1="20" x2="20" y2="20" /></StrokeIcon>;

export const LinkIcon = (props: any) => <StrokeIcon {...props}><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></StrokeIcon>;
export const HeadingIcon = (props: any) => <StrokeIcon {...props}><path d="M6 4v16" /><path d="M18 4v16" /><path d="M6 12h12" /></StrokeIcon>;
export const QuoteIcon = (props: any) => <StrokeIcon {...props}><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z" /><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z" /></StrokeIcon>;
export const AlignLeftIcon = (props: any) => <StrokeIcon {...props}><line x1="17" y1="10" x2="3" y2="10" /><line x1="21" y1="6" x2="3" y2="6" /><line x1="21" y1="14" x2="3" y2="14" /><line x1="17" y1="18" x2="3" y2="18" /></StrokeIcon>;
export const AlignCenterIcon = (props: any) => <StrokeIcon {...props}><line x1="21" y1="6" x2="3" y2="6" /><line x1="17" y1="12" x2="7" y2="12" /><line x1="19" y1="18" x2="5" y2="18" /></StrokeIcon>;
export const AlignRightIcon = (props: any) => <StrokeIcon {...props}><line x1="21" y1="10" x2="7" y2="10" /><line x1="21" y1="6" x2="3" y2="6" /><line x1="21" y1="14" x2="3" y2="14" /><line x1="21" y1="18" x2="7" y2="18" /></StrokeIcon>;
export const ListIcon = (props: any) => <StrokeIcon {...props}><line x1="8" x2="21" y1="6" y2="6" /><line x1="8" x2="21" y1="12" y2="12" /><line x1="8" x2="21" y1="18" y2="18" /><line x1="3" x2="3.01" y1="6" y2="6" /><line x1="3" x2="3.01" y1="12" y2="12" /><line x1="3" x2="3.01" y1="18" y2="18" /></StrokeIcon>;
export const ListOrderedIcon = (props: any) => <StrokeIcon {...props}><line x1="10" x2="21" y1="6" y2="6" /><line x1="10" x2="21" y1="12" y2="12" /><line x1="10" x2="21" y1="18" y2="18" /><path d="M4 6h1v4" /><path d="M4 10h2" /></StrokeIcon>;
export const IndentIcon = (props: any) => <StrokeIcon {...props}><polyline points="3 8 7 12 3 16" /><line x1="21" x2="11" y1="12" y2="12" /><line x1="21" x2="11" y1="6" y2="6" /><line x1="21" x2="11" y1="18" y2="18" /></StrokeIcon>;
export const OutdentIcon = (props: any) => <StrokeIcon {...props}><polyline points="7 8 3 12 7 16" /><line x1="21" x2="11" y1="12" y2="12" /><line x1="21" x2="11" y1="6" y2="6" /><line x1="21" x2="11" y1="18" y2="18" /></StrokeIcon>;
export const TableIcon = (props: any) => <IconBase {...props}><path d="M20 2H4c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM8 20H4v-4h4v4zm0-6H4v-4h4v4zm0-6H4V4h4v4zm6 12h-4v-4h4v4zm0-6h-4v-4h4v4zm0-6h-4V4h4v4zm6 12h-4v-4h4v4zm0-6h-4v-4h4v4zm0-6h-4V4h4v4z" /></IconBase>;
export const TextSizeIcon = (props: any) => <IconBase {...props}><path d="M9 4v3h5v12h3V7h5V4H9zm-6 8h3v7h3v-7h3V9H3v3z" /></IconBase>;
export const FontIcon = (props: any) => <IconBase {...props}><path d="M9 4v3h5v12h3V7h5V4H9zm-6 8h3v7h3v-7h3V9H3v3z" /></IconBase>;
export const ColumnsIcon = (props: any) => <IconBase {...props}><path d="M10 18h5V5h-5v13zm-6 0h5V5H4v13zM16 5v13h5V5h-5z" /></IconBase>;
export const UndoIcon = (props: any) => <IconBase {...props}><path d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z" /></IconBase>;
export const RedoIcon = (props: any) => <IconBase {...props}><path d="M18.4 10.6C16.55 9 14.15 8 11.5 8c-4.65 0-8.58 3.03-9.96 7.22L3.9 16c1.05-3.19 4.05-5.5 7.6-5.5 1.95 0 3.73.72 5.12 1.88L13 16h9V7l-3.6 3.6z" /></IconBase>;
export const MinusIcon = (props: any) => <StrokeIcon {...props}><line x1="5" x2="19" y1="12" y2="12" /></StrokeIcon>;

// --- Document Types ---
export const InvoiceIcon = (props: any) => <StrokeIcon {...props}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="12" x2="12" y1="18" y2="12" /><line x1="9" x2="15" y1="15" y2="15" /></StrokeIcon>;
export const DailyReportIcon = (props: any) => <StrokeIcon {...props}><rect width="18" height="18" x="3" y="4" rx="2" ry="2" /><line x1="16" x2="16" y1="2" y2="6" /><line x1="8" x2="8" y1="2" y2="6" /><line x1="3" x2="21" y1="10" y2="10" /><path d="m9 16 2 2 4-4" /></StrokeIcon>;
export const TimeSheetIcon = (props: any) => <StrokeIcon {...props}><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></StrokeIcon>;
export const MaterialLogIcon = (props: any) => <StrokeIcon {...props}><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" x2="12" y1="22.08" y2="12" /></StrokeIcon>;
export const EstimateIcon = (props: any) => <StrokeIcon {...props}><rect width="18" height="18" x="3" y="4" rx="2" ry="2" /><line x1="16" x2="16" y1="2" y2="6" /><line x1="8" x2="8" y1="2" y2="6" /><line x1="3" x2="21" y1="10" y2="10" /><path d="M8 14h.01" /><path d="M12 14h.01" /><path d="M16 14h.01" /><path d="M8 18h.01" /><path d="M12 18h.01" /><path d="M16 18h.01" /></StrokeIcon>;
export const ExpenseLogIcon = (props: any) => <StrokeIcon {...props}><rect width="20" height="14" x="2" y="5" rx="2" /><line x1="2" x2="22" y1="10" y2="10" /></StrokeIcon>;
export const WarrantyIcon = (props: any) => <StrokeIcon {...props}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" /><path d="m9 12 2 2 4-4" /></StrokeIcon>;
export const NoteIcon = (props: any) => <StrokeIcon {...props}><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" /><polyline points="14 2 14 8 20 8" /></StrokeIcon>;
export const ReceiptIcon = (props: any) => <StrokeIcon {...props}><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1Z" /><line x1="16" x2="8" y="8" y2="8" /><line x1="16" x2="8" y1="12" y2="12" /><line x1="10" x2="8" y1="16" y2="16" /></StrokeIcon>;
export const WorkOrderIcon = (props: any) => <StrokeIcon {...props}><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" /></StrokeIcon>;
export const ChangeOrderIcon = (props: any) => <StrokeIcon {...props}><polyline points="16 3 21 3 21 8" /><line x1="4" x2="21" y1="20" y2="3" /><polyline points="21 16 21 21 16 21" /><line x1="15" x2="21" y1="15" y2="21" /><line x1="4" x2="9" y1="4" y2="9" /></StrokeIcon>;
export const BarChartIcon = (props: any) => <StrokeIcon {...props}><line x1="12" x2="12" y1="20" y2="10" /><line x1="18" x2="18" y1="20" y2="4" /><line x1="6" x2="6" y1="20" y2="16" /></StrokeIcon>;
export const MessageSquareIcon = (props: any) => <StrokeIcon {...props}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></StrokeIcon>;
export const TrendingUpIcon = (props: any) => <StrokeIcon {...props}><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" /></StrokeIcon>;

// --- Landing Page Icons ---
export const PlayIcon = (props: any) => <StrokeIcon {...props}><polygon points="5 3 19 12 5 21 5 3" /></StrokeIcon>;
export const StarIcon = (props: any) => <StrokeIcon {...props}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></StrokeIcon>;
export const MenuIcon = (props: any) => <StrokeIcon {...props}><line x1="4" x2="20" y1="12" y2="12" /><line x1="4" x2="20" y1="6" y2="6" /><line x1="4" x2="20" y1="18" y2="18" /></StrokeIcon>;
export const CheckIcon = (props: any) => <StrokeIcon {...props}><polyline points="20 6 9 17 4 12" /></StrokeIcon>;
export const ArrowRightIcon = (props: any) => <StrokeIcon {...props}><line x1="5" x2="19" y1="12" y2="12" /><polyline points="12 5 19 12 12 19" /></StrokeIcon>;
export const ShieldIcon = (props: any) => <StrokeIcon {...props}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" /></StrokeIcon>;
export const SmartphoneIcon = (props: any) => <StrokeIcon {...props}><rect width="14" height="20" x="5" y="2" rx="2" ry="2" /><path d="M12 18h.01" /></StrokeIcon>;
export const ChartIcon = (props: any) => <StrokeIcon {...props}><path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" /></StrokeIcon>;
export const FilterIcon = (props: any) => <StrokeIcon {...props}><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></StrokeIcon>;
export const DollarIcon = (props: any) => <StrokeIcon {...props}><line x1="12" x2="12" y1="2" y2="22" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></StrokeIcon>;
export const MapPinIcon = (props: any) => <StrokeIcon {...props}><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></StrokeIcon>;
export const FileTextIcon = (props: any) => <StrokeIcon {...props}><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" /><polyline points="14 2 14 8 20 8" /><line x1="16" x2="8" y1="13" y2="13" /><line x1="16" x2="8" y1="17" y2="17" /><line x1="10" x2="8" y1="9" y2="9" /></StrokeIcon>;
export const RobotIcon = (props: any) => <StrokeIcon {...props}><rect width="18" height="12" x="3" y="6" rx="2" /><circle cx="9" cy="12" r="2" /><circle cx="15" cy="12" r="2" /><line x1="12" x2="12" y1="2" y2="6" /><line x1="12" x2="12" y1="18" y2="22" /></StrokeIcon>;
export const AwardIcon = (props: any) => <StrokeIcon {...props}><circle cx="12" cy="8" r="7" /><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88" /></StrokeIcon>;
export const PieChartIcon = (props: any) => <StrokeIcon {...props}><path d="M21.21 15.89A10 10 0 1 1 8 2.83" /><path d="M22 12A10 10 0 0 0 12 2v10z" /></StrokeIcon>;
export const ThumbsUpIcon = (props: any) => <StrokeIcon {...props}><path d="M7 10v12" /><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2h0a3.13 3.13 0 0 1 3 3.88Z" /></StrokeIcon>;
export const ThumbsDownIcon = (props: any) => <StrokeIcon {...props}><path d="M17 14V2" /><path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22h0a3.13 3.13 0 0 1-3-3.88Z" /></StrokeIcon>;
export const MessageCircleIcon = (props: any) => <StrokeIcon {...props}><path d="m3 21 1.9-5.7a8.5 8.5 0 1 1 3.8 3.8z" /></StrokeIcon>;
export const SendIcon = (props: any) => <StrokeIcon {...props}><line x1="22" x2="11" y1="2" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></StrokeIcon>;
export const MoreVerticalIcon = (props: any) => <StrokeIcon {...props}><circle cx="12" cy="12" r="1" /><circle cx="12" cy="5" r="1" /><circle cx="12" cy="19" r="1" /></StrokeIcon>;