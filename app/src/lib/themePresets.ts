/**
 * Kindling Studio theme system — disciplined and small on purpose.
 *
 * The visual design is ONE coherent system. The user controls two knobs:
 *
 *   1. Mode  — Light / Dark / System
 *   2. Accent — one of four professionally-tuned metals
 *
 * Everything else (typography, spacing, radii, borders, elevation) is fixed
 * by the brand. No "custom" mode, no color pickers — that's how the previous
 * iteration ended up looking like a kid's app.
 *
 * The applier (in App.tsx) sets `data-accent="<id>"` on <html> and toggles
 * the `theme-light` class. CSS variables in index.css do the rest.
 */

export type AccentId = 'tobacco' | 'bronze' | 'verdigris' | 'slate-blue';
export type ThemeMode = 'system' | 'light' | 'dark';

export interface AccentDef {
  id: AccentId;
  label: string;
  /** Hex used for the chip in Settings. */
  swatch: string;
  /** One-line voice cue. */
  description: string;
}

export const ACCENTS: AccentDef[] = [
  { id: 'tobacco',    label: 'Tobacco Gold', swatch: '#C99B5E', description: 'Warm, classical, our default.' },
  { id: 'bronze',     label: 'Bronze',       swatch: '#B5765B', description: 'Warmer, autumnal, lit by lamplight.' },
  { id: 'verdigris',  label: 'Verdigris',    swatch: '#5C8B7E', description: 'Cool, archival, leather-bound.' },
  { id: 'slate-blue', label: 'Slate Blue',   swatch: '#6B7DA0', description: 'Cool, editorial, after-hours.' },
];

export const THEME_MODES: { id: ThemeMode; label: string }[] = [
  { id: 'system', label: 'System' },
  { id: 'light',  label: 'Light' },
  { id: 'dark',   label: 'Dark' },
];

/**
 * Resolve "system" to a concrete light/dark choice based on the browser's
 * prefers-color-scheme media query. Returns 'light' or 'dark'.
 */
export function resolveThemeMode(mode: ThemeMode | undefined): 'light' | 'dark' {
  if (mode === 'light') return 'light';
  if (mode === 'dark') return 'dark';
  if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: light)').matches) return 'light';
  return 'dark';
}
