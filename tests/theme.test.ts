import { darkPalette, lightPalette, type Palette } from '@/theme/tokens';

function lum(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function ratio(a: string, b: string): number {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

const textPairs: [keyof Palette, keyof Palette][] = [
  ['text', 'bg'],
  ['text', 'surface'],
  ['textMuted', 'bg'],
  ['textMuted', 'surface'],
  ['textMuted', 'sunken'],
  ['onPrimary', 'primary'],
  ['onHero', 'hero'],
  ['heroMuted', 'hero'],
  ['onPrimarySoft', 'primarySoft'],
  ['onAccentSoft', 'accentSoft'],
  ['onSuccessSoft', 'successSoft'],
  ['onDangerSoft', 'dangerSoft'],
  ['primary', 'bg'],
  ['primary', 'surface'],
  ['success', 'surface'],
  ['danger', 'surface'],
  ['danger', 'bg'],
];

describe.each([
  ['light', lightPalette],
  ['dark', darkPalette],
])('%s palette contrast', (_name, p) => {
  it.each(textPairs)('%s on %s is at least 4.5:1', (fg, bg) => {
    expect(ratio(p[fg] as string, p[bg] as string)).toBeGreaterThanOrEqual(4.5);
  });

  it('box colours are visible (>=3:1) against the surface they sit on', () => {
    for (const n of [1, 2, 3, 4, 5] as const) expect(ratio(p.box[n], p.surface)).toBeGreaterThanOrEqual(3);
  });

  it('borders are distinguishable from the surface (>=1.3:1) and the page', () => {
    expect(ratio(p.border, p.surface)).toBeGreaterThanOrEqual(1.3);
    expect(ratio(p.border, p.bg)).toBeGreaterThanOrEqual(1.3);
  });
});
