import React from 'react';

/** Pipeline board icon for menus (three lanes of different length). Own file so the nav doesn't load the board. */
export const PipelineIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
        <rect x="3" y="3" width="18" height="18" rx="2.5" />
        <path d="M8 7.5v8" />
        <path d="M12 7.5v4" />
        <path d="M16 7.5v6" />
    </svg>
);
