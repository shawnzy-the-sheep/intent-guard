import type { Page } from 'playwright';
import { projectDomEvidence } from './projection.js';
import { AxeBuilder } from '@axe-core/playwright';
import {
  cleanText,
  publicUrl,
  UxGuardPipelineError,
} from '@ux-guard-pipeline/shared';
import type { UXContract } from '@ux-guard-pipeline/contracts';
import type { PageEvidence } from '@ux-guard-pipeline/evidence';

export const DEFAULT_REDACT = [
  '[data-sensitive]',
  'input[type=password]',
  '.customer-email',
  'input[type=hidden]',
];

export async function collectPageEvidence(
  page: Page,
  contract: UXContract,
  screenshotPath: string,
  redact: string[] = [],
): Promise<PageEvidence> {
  const selectors = [...new Set([...DEFAULT_REDACT, ...redact])];
  // Fail closed if a configured selector is invalid. No evidence leaves this boundary first.
  await page.evaluate((selectors) => {
    for (const selector of selectors) {
      for (const el of document.querySelectorAll(selector)) {
        el.setAttribute('data-ux-guard-pipeline-masked', 'true');
        (el as HTMLElement).style.setProperty(
          'visibility',
          'hidden',
          'important',
        );
      }
    }
    const style = document.createElement('style');
    style.textContent =
      '[data-ux-guard-pipeline-masked], [data-ux-guard-pipeline-masked] * { visibility: hidden !important; } *, *::before, *::after { animation: none !important; transition: none !important; }';
    document.head.append(style);
    const scrub = (value: string) =>
      value
        .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[EMAIL]')
        .replace(/\bBearer\s+\S+/gi, '[AUTH]')
        .replace(/\b(?:sk-|ghp_|github_pat_)[a-zA-Z0-9_-]+/g, '[TOKEN]');
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walk.nextNode())) {
      if (
        !node.parentElement?.closest(
          'script,style,[data-ux-guard-pipeline-masked]',
        )
      )
        node.textContent = scrub(node.textContent || '');
    }
    for (const el of document.querySelectorAll('input,textarea')) {
      const input = el as HTMLInputElement;
      if (scrub(input.value) !== input.value) {
        input.value = '[REDACTED]';
        input.setAttribute('value', '[REDACTED]');
      }
    }
  }, selectors);
  await page.screenshot({
    path: screenshotPath,
    fullPage: true,
    animations: 'disabled',
    mask: selectors.map((s) => page.locator(s)),
    maskColor: '#111827',
  });
  const raw = await page.evaluate(projectDomEvidence, contract);
  if (!raw.elements.length)
    throw new UxGuardPipelineError(
      'EVIDENCE_ERROR',
      'No relevant unmasked elements were collected.',
    );
  const axe = await new AxeBuilder({ page }).analyze();
  // ARIA snapshots are restricted to collected elements; never extract input values or a full document tree.
  const accessibilityTree = raw.elements
    .filter(
      (e) => e.visible && (e.role || /^h[1-6]$/.test(e.tag) || e.interactive),
    )
    .map(
      (e) => `${e.id}: ${e.role || e.tag} ${cleanText(e.ariaLabel || e.text)}`,
    )
    .join('\n');
  return {
    url: publicUrl(page.url()),
    screenshotPath,
    viewport: page.viewportSize() || { width: 1280, height: 800 },
    ...raw,
    elements: raw.elements.map((e) => ({
      ...e,
      text: cleanText(e.text),
      ariaLabel: e.ariaLabel ? cleanText(e.ariaLabel) : null,
    })),
    accessibility: {
      violations: axe.violations.map((v) => ({
        id: v.id,
        impact: v.impact || null,
        count: v.nodes.length,
        description: v.description,
      })),
      passes: axe.passes.length,
    },
    accessibilityTree,
  };
}
