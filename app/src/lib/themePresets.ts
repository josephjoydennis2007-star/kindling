/**
 * Kindling Studio theme system — disciplined and small on purpose.
 *
 * The visual design is ONE coherent system. The user controls two knobs:
 *
 *   1. Mode  — Light / Dark / System
 *   2. Accent — one of four professionally-tuned palettes
 *
 * Each accent carries TWO colors:
 *   - The solid `--accent`  — used flatly everywhere (active tab, Save,
 *     revision badge, primary CTAs, icon highlights).
 *   - The `--accent-pair`   — used in exactly four sanctioned gradients:
 *       1. Dashboard hero card halo
 *       2. AuthWall background blob
 *       3. FAB on hover
 *       4. Active IconRail icon background (subtle radial)
 *
 * Anywhere else, gradients are forbidden by policy. Flat solid only.
 *
 * The applier (in App.tsx) sets `data-accent="<id>"` on <html> and toggles
 * the `theme-light` class. CSS variables in index.css do the rest.
 */

export type AccentId = 'indigo' | 'salmon' | 'forest' | 'violet';
export type ThemeMode = 'system' | 'light' | 'dark';

export interface AccentDef {
  id: AccentId;
  label: string;
  /** Hex of the solid accent — the swatch in Settings. */
  swatch: string;
  /** Hex of the gradient pair color — shown as a small split chip. */
  pair: string;
  /** One-line voice cue. */
  description: string;
}

export const ACCENTS: AccentDef[] = [
  { id: 'indigo', label: 'Indigo Dusk',     swatch: '#818CF8', pair: '#C084FC', description: 'Cool, modern, software-grade. Default.' },
  { id: 'salmon', label: 'Sunset Salmon',   swatch: '#FB7185', pair: '#F59E0B', description: 'Warm, intimate, sunset bay.' },
  { id: 'forest', label: 'Forest Calm',     swatch: '#34D399', pair: '#06B6D4', description: 'Mint + cyan — calm, organic, daytime.' },
  { id: 'violet', label: 'Violet Theatre',  swatch: '#C084FC', pair: '#F472B6', description: 'Stage lighting energy. Theatrical.' },
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
