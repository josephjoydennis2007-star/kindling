/**
 * Accent colour grading.
 *
 * Goal: the user can pick ANY colour and the whole app still looks
 * professional. The trick the good apps use (Linear, Vercel, Raycast): don't
 * paint surfaces with the raw brand colour — instead keep a FIXED, tasteful
 * lightness/saturation ramp for every surface and let only the HUE follow the
 * chosen colour. The accent itself is clamped into a readable, vivid-but-not-
 * garish band. The result is a cohesive, graded theme for any input hue.
 *
 * This module derives that full palette from one hex and writes the CSS
 * variables inline on <html> (inline styles win over index.css, so they
 * override whichever preset/base palette is otherwise active). Call
 * clearCustomAccent() to remove them and fall back to the built-in presets.
 */

export type GradeMode = 'dark' | 'light';

// ── colour math ────────────────────────────────────────────────────────────
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  let h = (hex || '').trim().replace(/^#/, '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0;
  const l = (max + min) / 2;
  const d = max - min;
  let s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case r: h = ((g - b) / d) % 6; break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4; break;
    }
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, s * 100, l * 100];
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const hsl = (h: number, s: number, l: number) => `hsl(${h.toFixed(0)} ${s.toFixed(1)}% ${l.toFixed(1)}%)`;

/** Relative luminance (0–1). */
function luminance(r: number, g: number, b: number): number {
  const f = (c: number) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  s /= 100; l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return { r: Math.round((r + m) * 255), g: Math.round((g + m) * 255), b: Math.round((b + m) * 255) };
}

/** Pick black or white ink for best contrast on a given accent (h,s,l). */
function bestInk(h: number, s: number, l: number): string {
  const { r, g, b } = hslToRgb(h, s, l);
  const La = luminance(r, g, b);
  const contrastWhite = 1.05 / (La + 0.05);
  const contrastBlack = (La + 0.05) / 0.05;
  return contrastBlack >= contrastWhite ? '#0A0B12' : '#FFFFFF';
}

/**
 * Build the full set of CSS variables for a given accent hex + mode.
 * Returns a plain map of `--var` → value.
 */
export function deriveAccentVars(hex: string, mode: GradeMode): Record<string, string> {
  const rgb = hexToRgb(hex) || { r: 129, g: 140, b: 248 }; // fallback: indigo
  const { r, g, b } = rgb;
  const [h, s] = rgbToHsl(r, g, b);

  if (mode === 'dark') {
    // Accent: readable + vivid on dark surfaces, never muddy or blinding.
    const aS = clamp(s, 58, 92);
    const aL = clamp(rgbToHsl(r, g, b)[2], 56, 72);
    const accent = hsl(h, aS, aL);
    const pair = hsl((h + 32) % 360, clamp(aS - 4, 50, 90), clamp(aL + 4, 56, 76));
    const ink = bestInk(h, aS, aL);

    // Surfaces: the chosen hue at low saturation, fixed dark lightness ramp.
    const su = (sat: number, light: number) => hsl(h, sat, light);
    return {
      '--accent': accent,
      '--accent-pair': pair,
      '--accent-soft': `hsl(${h.toFixed(0)} ${aS.toFixed(0)}% ${aL.toFixed(0)}% / 0.15)`,
      '--accent-ink': ink,
      '--primary': accent,
      '--bg':          su(16, 6),
      '--sidebar':     su(16, 6),
      '--rail-bg':     su(18, 8),
      '--panel':       su(14, 11),
      '--surface':     su(14, 11),
      '--card':        su(13, 14.5),
      '--surface-2':   su(13, 14.5),
      '--hover':       su(15, 18),
      '--active':      su(16, 23),
      '--border':      su(15, 24),
      '--rule':        su(15, 24),
      '--border-light':su(15, 30),
      '--text':           su(22, 93),
      '--text-secondary': su(14, 75),
      '--text-muted':     su(12, 60),
    };
  }

  // Light mode: same idea, light surface ramp, deeper accent for contrast.
  const aS = clamp(s, 55, 90);
  const aL = clamp(rgbToHsl(r, g, b)[2], 36, 52);
  const accent = hsl(h, aS, aL);
  const pair = hsl((h + 32) % 360, clamp(aS - 4, 48, 88), clamp(aL + 6, 38, 56));
  const su = (sat: number, light: number) => hsl(h, sat, light);
  return {
    '--accent': accent,
    '--accent-pair': pair,
    '--accent-soft': `hsl(${h.toFixed(0)} ${aS.toFixed(0)}% ${aL.toFixed(0)}% / 0.10)`,
    '--accent-ink': bestInk(h, aS, aL),
    '--primary': accent,
    '--bg':          su(28, 97),
    '--sidebar':     su(28, 97),
    '--rail-bg':     su(26, 95),
    '--panel':       su(30, 100),
    '--surface':     su(30, 100),
    '--card':        su(28, 99),
    '--surface-2':   su(24, 96),
    '--hover':       su(22, 93),
    '--active':      su(22, 90),
    '--border':      su(20, 89),
    '--rule':        su(20, 89),
    '--border-light':su(18, 84),
    '--text':           su(28, 12),
    '--text-secondary': su(18, 30),
    '--text-muted':     su(14, 44),
  };
}

const MANAGED_VARS = [
  '--accent', '--accent-pair', '--accent-soft', '--accent-ink', '--primary',
  '--bg', '--sidebar', '--rail-bg', '--panel', '--surface', '--card', '--surface-2',
  '--hover', '--active', '--border', '--rule', '--border-light',
  '--text', '--text-secondary', '--text-muted',
];

/** Apply a custom accent grade to <html>. */
export function applyCustomAccent(hex: string, mode: GradeMode): void {
  if (typeof document === 'undefined') return;
  const vars = deriveAccentVars(hex, mode);
  const root = document.documentElement;
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
}

/** Remove the custom grade so the built-in presets take over again. */
export function clearCustomAccent(): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  for (const k of MANAGED_VARS) root.style.removeProperty(k);
}
