import React from 'react';

/** Crew icon for menus: a time card with a punch notch. Own file so the nav doesn't load the crew screens. */
export const CrewIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
        <path d="M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
        <path d="M9 3v2.5a3 3 0 0 0 6 0V3" />
        <path d="M9 12h6" />
        <path d="M9 16h3" />
    </svg>
);
