/**
 * All design modules beyond the 13 Featured designs in themes.ts. Each module exports `DESIGNS: DesignDef[]`
 * ({ meta: TemplateMeta, theme: ThemeDef } pairs); the registry and the renderer pick them up from here.
 *
 *   standard.ts  - the 10 original Standard designs (standard … bold)
 *   premium1-4   - the 20 original Premium designs (template_html … template_serif)
 *   fresh1-2     - new designs
 */
import type { DesignDef } from '../blocks.ts';
import { DESIGNS as standard } from './standard.ts';
import { DESIGNS as premium1 } from './premium1.ts';
import { DESIGNS as premium2 } from './premium2.ts';
import { DESIGNS as premium3 } from './premium3.ts';
import { DESIGNS as premium4 } from './premium4.ts';
import { DESIGNS as fresh1 } from './fresh1.ts';
import { DESIGNS as fresh2 } from './fresh2.ts';

export const DESIGN_LIST: DesignDef[] = [...standard, ...premium1, ...premium2, ...premium3, ...premium4, ...fresh1, ...fresh2];
