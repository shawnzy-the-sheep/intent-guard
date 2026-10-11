import type { UXContract } from '@ux-guard-pipeline/contracts';

// Read-only DOM projection shared by the browser collector and live-tab captures.
export function projectDomEvidence(contract: UXContract) {
  const entries = [
    ...Object.entries(contract.entities),
    ...Object.entries(contract.actions),
  ];
  const matches = new Map<string, Element[]>();
  for (const [id, definition] of entries)
    matches.set(id, [
      ...new Set(
        definition.selectors.flatMap((s) => [...document.querySelectorAll(s)]),
      ),
    ]);
  const relevant = new Set<Element>(
    document.querySelectorAll(
      'h1,h2,h3,h4,h5,h6,button,a,[role=button],[role=status],[role=alert],[data-entity],[data-action],main,section,aside',
    ),
  );
  for (const els of matches.values()) for (const el of els) relevant.add(el);
  const unmasked = [...relevant].filter(
    (el) => !el.closest('[data-ux-guard-pipeline-masked]'),
  );
  const required = new Set([...matches.values()].flat());
  const candidates = unmasked.filter((el) => {
    if (required.has(el)) return true;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    let ancestor: Element | null = el;
    while (ancestor) {
      const style = getComputedStyle(ancestor);
      if (
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        style.visibility === 'collapse' ||
        +style.opacity === 0
      )
        return false;
      ancestor = ancestor.parentElement;
    }
    return true;
  });
  const selected = candidates.slice(0, 400);
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
        +style.opacity === 0
      )
        visible = false;
      ancestor = ancestor.parentElement;
    }
    ancestor = el.parentElement;
    while (/rgba\([^)]*,\s*0\)$/.test(background) && ancestor) {
      background = getComputedStyle(ancestor).backgroundColor;
      ancestor = ancestor.parentElement;
    }
    if (/rgba\([^)]*,\s*0\)$/.test(background)) background = 'rgb(255,255,255)';
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
    const interactive = el.matches(
      'button,a[href],input:not([type=hidden]),select,textarea,[role=button]',
    );
    let occluded =
      !!hit && !(hit === el || el.contains(hit) || hit.contains(el));
    // Transparent, empty aria-hidden click targets do not obscure painted text.
    // Keep the hit-test obstruction for actions, which must receive clicks.
    if (
      occluded &&
      !interactive &&
      hit?.getAttribute('aria-hidden') === 'true' &&
      !hit.textContent?.trim() &&
      hit.childElementCount === 0
    ) {
      const hitStyle = getComputedStyle(hit);
      if (
        /rgba\([^)]*,\s*0\)$/.test(hitStyle.backgroundColor) &&
        hitStyle.backgroundImage === 'none'
      )
        occluded = false;
    }
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
      interactive,
      disabled:
        el.matches(':disabled') || el.getAttribute('aria-disabled') === 'true',
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
    truncated: candidates.length > 400,
  };
}
