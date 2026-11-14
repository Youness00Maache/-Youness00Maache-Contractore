/**
 * Real template preview images for the marketing Templates page: the sample invoice in every current design,
 * rendered by `npx tsx scripts/templates-qa.ts --kinds=invoice --previews` (public/templates/previews/<id>.webp).
 * Kept as a static list so the marketing bundle does not load the template engine; scripts/templates-qa.ts checks
 * that it matches the design registry (every Basic and Premium design, no retired ids, every image present).
 * When this list is empty the Templates page shows HTML illustrations instead.
 */
export interface TemplatePreview {
  /** design id (utils/templates/registry.ts) */
  id: string;
  src: string;
  name: string;
  /** Premium designs need a paid plan (lib/designAccess.ts) */
  premium: boolean;
}

const preview = (id: string, name: string, premium: boolean): TemplatePreview => ({ id, src: `/templates/previews/${id}.webp`, name, premium });

/** Basic designs: free on every plan. */
const BASIC: TemplatePreview[] = [
  preview('classic', 'Classic Professional', false),
  preview('standard', 'Standard', false),
  preview('professional', 'Professional', false),
  preview('modern_blue', 'Modern Blue', false),
  preview('elegant', 'Elegant', false),
  preview('warm', 'Warm', false),
  preview('industrial', 'Industrial', false),
  preview('minimal', 'Minimal', false),
  preview('bold', 'Bold', false),
  preview('tech', 'Tech', false),
  preview('retro', 'Retro', false),
];

/** Premium designs: Premium and Premium + AI plans, customizable (fonts, header, table, sections). */
const PREMIUM: TemplatePreview[] = [
  preview('modern_contractor', 'Modern Contractor', true),
  preview('classic_trade', 'Classic Trade', true),
  preview('field_ready', 'Field Ready', true),
  preview('executive', 'Executive', true),
  preview('corporate', 'Corporate', true),
  preview('craftsman', 'Craftsman', true),
  preview('blueprint_pro', 'Blueprint Pro', true),
  preview('slate', 'Slate', true),
  preview('proposal', 'Proposal', true),
  preview('letterhead', 'Letterhead', true),
  preview('minimal_line', 'Minimal Line', true),
  preview('bold_block', 'Bold Block', true),
  preview('heritage', 'Heritage', true),
  preview('studio', 'Studio Grid', true),
  preview('work_ticket', 'Work Ticket', true),
];

export const TEMPLATE_PREVIEWS: TemplatePreview[] = [...BASIC, ...PREMIUM];
