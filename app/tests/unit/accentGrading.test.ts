import { describe, it, expect } from 'vitest';
import { deriveAccentVars } from '@/lib/accentGrading';

// Parse "hsl(H S% L%)" → [h, s, l]
function parseHsl(v: string): [number, number, number] {
  const m = v.match(/hsl\(\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%/i);
  if (!m) throw new Error(`not hsl: ${v}`);
  return [parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3])];
}

describe('accent grading', () => {
  it('follows the chosen hue across all surfaces (dark)', () => {
    const v = deriveAccentVars('#ff7a18', 'dark'); // orange ~ hue 25
    const [bh] = parseHsl(v['--bg']);
    const [ph] = parseHsl(v['--panel']);
    const [ah] = parseHsl(v['--accent']);
    expect(Math.abs(bh - 25)).toBeLessThan(6);
    expect(Math.abs(ph - 25)).toBeLessThan(6);
    expect(Math.abs(ah - 25)).toBeLessThan(6);
  });

  it('keeps surfaces dark + low-saturation (professional, not garish)', () => {
    const v = deriveAccentVars('#ff0000', 'dark'); // pure saturated red
    const [, bgS, bgL] = parseHsl(v['--bg']);
    expect(bgL).toBeLessThan(12);   // background stays very dark
    expect(bgS).toBeLessThan(30);   // surfaces never use the raw high saturation
  });

  it('clamps the accent into a readable band even for extreme inputs (dark)', () => {
    const black = parseHsl(deriveAccentVars('#000000', 'dark')['--accent']);
    const white = parseHsl(deriveAccentVars('#ffffff', 'dark')['--accent']);
    expect(black[2]).toBeGreaterThanOrEqual(55); // not invisibly dark
    expect(white[2]).toBeLessThanOrEqual(73);    // not blinding
  });

  it('picks readable ink on the accent by contrast', () => {
    // Pale yellow accent → dark ink; deep/low-luminance accent → white ink.
    expect(deriveAccentVars('#f5e642', 'dark')['--accent-ink']).toBe('#0A0B12');
    expect(deriveAccentVars('#10204a', 'dark')['--accent-ink']).toBe('#FFFFFF');
  });

  it('produces light surfaces in light mode', () => {
    const v = deriveAccentVars('#3b82f6', 'light');
    const [, , bgL] = parseHsl(v['--bg']);
    expect(bgL).toBeGreaterThan(90);
  });

  it('falls back gracefully on invalid hex', () => {
    const v = deriveAccentVars('not-a-color', 'dark');
    expect(v['--accent']).toMatch(/^hsl\(/);
    expect(v['--bg']).toMatch(/^hsl\(/);
  });
});
