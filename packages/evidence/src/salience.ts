import type { ElementEvidence, Features, PageEvidence } from './types.js';
const clamp = (n: number) => Math.max(0, Math.min(1, n));
function luminance(color: string): number {
  const match = color.match(/[\d.]+/g)?.map(Number);
  if (!match || match.length < 3) return 1;
  const c = match.slice(0, 3).map((v) => {
    const x = v / 255;
    return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
}
export function features(
  element: ElementEvidence,
  viewport: PageEvidence['viewport'],
  medianFont = 16,
): Features {
  const { rect, style } = element;
  const fontSizePx = parseFloat(style.fontSize) || 16;
  const fontWeight =
    parseFloat(style.fontWeight) || (style.fontWeight === 'bold' ? 700 : 400);
  const foreground = luminance(style.color),
    background = luminance(style.backgroundColor);
  const contrastStrength = clamp(
    ((Math.max(foreground, background) + 0.05) /
      (Math.min(foreground, background) + 0.05) -
      1) /
      20,
  );
  const viewportCoverage = clamp(
    (rect.width * rect.height) / (viewport.width * viewport.height),
  );
  const containerWidthRatio = clamp(rect.width / viewport.width);
  const sticky = ['sticky', 'fixed'].includes(style.position);
  const area = clamp(viewportCoverage / 0.25);
  const top = clamp(1 - Math.max(0, rect.y) / viewport.height);
  const typography = clamp(
    0.65 * (fontSizePx / medianFont / 2) +
      0.25 * (fontWeight / 900) +
      0.1 * (/^h[1-6]$/.test(element.tag) ? 1 : 0),
  );
  const salience =
    element.visible && !element.occluded
      ? 0.25 * area +
        0.2 * top +
        0.2 * typography +
        0.15 * contrastStrength +
        0.1 * containerWidthRatio +
        0.1 * (sticky ? 1 : 0)
      : 0;
  return {
    viewportCoverage,
    containerWidthRatio,
    distanceFromTopPx: rect.y,
    fontSizePx,
    fontWeight,
    contrastStrength,
    sticky,
    salience: Math.round(salience * 10000) / 10000,
  };
}
export function normalizeEvidence(evidence: PageEvidence): PageEvidence {
  const fonts = evidence.elements
    .filter((e) => e.visible)
    .map((e) => parseFloat(e.style.fontSize) || 16)
    .sort((a, b) => a - b);
  const median = fonts[Math.floor(fonts.length / 2)] || 16;
  return {
    ...evidence,
    elements: evidence.elements.map((e) => ({
      ...e,
      features: features(e, evidence.viewport, median),
    })),
  };
}
