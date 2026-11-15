import React from 'react';

/** Leads icon for menus (a funnel drawn as four shrinking bars). Own file so the nav doesn't load the Leads screen. */
export const LeadsIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
        <path d="M3 5h18" />
        <path d="M6 10h12" />
        <path d="M9 15h6" />
        <path d="M11.5 20h1" />
    </svg>
);
