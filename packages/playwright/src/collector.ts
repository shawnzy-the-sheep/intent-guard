import type { Page } from 'playwright';
import { AxeBuilder } from '@axe-core/playwright';
import { cleanText, publicUrl, IntentGuardError } from '@intentguard/shared';
import type { UXContract } from '@intentguard/contracts';
import type { PageEvidence } from '@intentguard/evidence';

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
        el.setAttribute('data-intentguard-masked', 'true');
        (el as HTMLElement).style.setProperty(
          'visibility',
          'hidden',
          'important',
        );
      }
    }
    const style = document.createElement('style');
    style.textContent =
      '[data-intentguard-masked], [data-intentguard-masked] * { visibility: hidden !important; } *, *::before, *::after { animation: none !important; transition: none !important; }';
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
        !node.parentElement?.closest('script,style,[data-intentguard-masked]')
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
  const raw = await page.evaluate((contract) => {
    const entries = [
      ...Object.entries(contract.entities),
      ...Object.entries(contract.actions),
    ];
    const matches = new Map<string, Element[]>();
    for (const [id, definition] of entries)
      matches.set(id, [
        ...new Set(
          definition.selectors.flatMap((s) => [
            ...document.querySelectorAll(s),
          ]),
        ),
      ]);
    const relevant = new Set<Element>(
      document.querySelectorAll(
        'h1,h2,h3,h4,h5,h6,button,a,[role=button],[role=status],[role=alert],[data-entity],[data-action],main,section,aside',
      ),
    );
    for (const els of matches.values()) for (const el of els) relevant.add(el);
    const unmasked = [...relevant].filter(
      (el) => !el.closest('[data-intentguard-masked]'),
    );
    const selected = unmasked.slice(0, 400);
    const ids = new Map(selected.map((el, i) => [el, `e${i + 1}`]));
    const elements = selected.map((el) => {
      const rect = el.getBoundingClientRect();
      const computed = getComputedStyle(el);
      let visible = rect.width > 0 && rect.height > 0;
      let background = computed.backgroundColor;
      let ancestor: Element | null = el;
      while (ancestor) {
        const style = getComputedStyle(ancestor);
        if (
          style.display === 'none' ||
          style.visibility === 'hidden' ||
          style.visibility === 'collapse' ||
          parseFloat(style.opacity) === 0
        )
          visible = false;
        ancestor = ancestor.parentElement;
      }
      ancestor = el.parentElement;
      while (/rgba\([^)]*,\s*0\)$/.test(background) && ancestor) {
        background = getComputedStyle(ancestor).backgroundColor;
        ancestor = ancestor.parentElement;
      }
      if (/rgba\([^)]*,\s*0\)$/.test(background))
        background = 'rgb(255,255,255)';
      const inViewport =
        visible &&
        rect.bottom > 0 &&
        rect.right > 0 &&
        rect.top < innerHeight &&
        rect.left < innerWidth;
      const hit = inViewport
        ? document.elementFromPoint(
            Math.min(innerWidth - 1, Math.max(0, rect.x + rect.width / 2)),
            Math.min(innerHeight - 1, Math.max(0, rect.y + rect.height / 2)),
          )
        : null;
      const occluded =
        !!hit && !(hit === el || el.contains(hit) || hit.contains(el));
      ancestor = el.parentElement;
      while (ancestor && !ids.has(ancestor)) ancestor = ancestor.parentElement;
      const role = el.getAttribute('role');
      return {
        id: ids.get(el)!,
        tag: el.tagName.toLowerCase(),
        text: visible
          ? ((el as HTMLElement).innerText || '')
              .replace(/\s+/g, ' ')
              .trim()
              .slice(0, 500)
          : '',
        role,
        ariaLabel: visible ? el.getAttribute('aria-label') : null,
        rect: {
          x: rect.x + scrollX,
          y: rect.y + scrollY,
          width: rect.width,
          height: rect.height,
        },
        style: {
          fontSize: computed.fontSize,
          fontWeight: computed.fontWeight,
          color: computed.color,
          backgroundColor: background,
          position: computed.position,
          zIndex: computed.zIndex,
          opacity: computed.opacity,
        },
        visible,
        inViewport,
        interactive: el.matches(
          'button,a[href],input:not([type=hidden]),select,textarea,[role=button]',
        ),
        disabled:
          el.matches(':disabled') ||
          el.getAttribute('aria-disabled') === 'true',
        occluded,
        entityIds: [...matches]
          .filter(([, els]) =>
            els.some((root) => root === el || root.contains(el)),
          )
          .map(([id]) => id),
        parentId: ancestor ? ids.get(ancestor)! : null,
      };
    });
    const binding = (registry: UXContract['entities']) =>
      Object.entries(registry).map(([id, definition]) => ({
        id,
        priority: definition.priority,
        elementIds: (matches.get(id) || []).flatMap((el) =>
          ids.has(el) ? [ids.get(el)!] : [],
        ),
      }));
    return {
      elements,
      entities: binding(contract.entities),
      actions: binding(contract.actions),
      truncated: unmasked.length > 400,
    };
  }, contract);
  if (!raw.elements.length)
    throw new IntentGuardError(
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
