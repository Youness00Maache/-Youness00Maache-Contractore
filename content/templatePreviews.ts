/**
 * Real template preview images (rendered by DOCS into public/templates/previews/*.png).
 * When this list is empty the Templates page shows HTML illustrations instead.
 */
export interface TemplatePreview {
  src: string;
  name: string;
}

export const TEMPLATE_PREVIEWS: TemplatePreview[] = [
  { src: '/templates/previews/construction.png', name: 'Construction' },
  { src: '/templates/previews/classic.png', name: 'Classic Professional' },
  { src: '/templates/previews/modern.png', name: 'Modern Minimal' },
  { src: '/templates/previews/corporate.png', name: 'Corporate Blue' },
  { src: '/templates/previews/executive.png', name: 'Executive Slate' },
  { src: '/templates/previews/elegant.png', name: 'Elegant Serif' },
  { src: '/templates/previews/bold.png', name: 'Bold Header' },
  { src: '/templates/previews/statement.png', name: 'Bold Statement' },
  { src: '/templates/previews/spectrum.png', name: 'Spectrum Edge' },
  { src: '/templates/previews/coastal.png', name: 'Coastal Serif' },
  { src: '/templates/previews/boutique.png', name: 'Boutique' },
  { src: '/templates/previews/friendly.png', name: 'Friendly Rounded' },
  { src: '/templates/previews/ledger.png', name: 'Ledger' },
];
