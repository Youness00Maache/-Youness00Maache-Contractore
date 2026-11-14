/**
 * All design modules besides Classic (themes.ts). Each module exports `DESIGNS: DesignDef[]`
 * ({ meta: TemplateMeta, theme: ThemeDef } pairs); the registry and the renderer pick them up from here.
 *
 *   standard.ts  - the 10 original Standard designs (standard … bold): Basic, free on every plan
 *   premium.ts   - the Premium designs (2026-11-14 redesign, engine in pro.ts): paid plans, customizable
 *
 * The Premium designs replaced the 20 original Premium designs and the 2026-11 "Featured"/"New" designs; every
 * retired id still resolves (registry.ts RETIRED_TEMPLATE_MAP), so saved documents keep rendering.
 */
import type { DesignDef } from '../blocks.ts';
import { DESIGNS as standard } from './standard.ts';
import { DESIGNS as premium } from './premium.ts';

export const DESIGN_LIST: DesignDef[] = [...standard, ...premium];
