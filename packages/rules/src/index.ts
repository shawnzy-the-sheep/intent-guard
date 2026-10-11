import type { UXContract } from '@intentguard/contracts';
import type { PageEvidence, DeterministicEvidence, Signal, ElementEvidence } from '@intentguard/evidence';
export function evaluateRules(evidence: PageEvidence, contract: UXContract, hierarchyRatio = 1.15): DeterministicEvidence {
  const signals: Signal[] = [];
  let incomplete = evidence.truncated;
  const bindings = [...evidence.entities, ...evidence.actions];
  const members = (id: string) => evidence.elements.filter(e => bindings.find(b => b.id === id)?.elementIds.includes(e.id));
  const strongest = (id: string) => members(id).filter(e => e.visible).sort((a,b) => (b.features?.salience || 0) - (a.features?.salience || 0))[0];
  const actions = evidence.elements.filter(e => e.interactive && e.visible && e.inViewport && !e.occluded && !e.disabled);
  const actionRanking = actions.map(e => ({ id: e.id, label: e.ariaLabel || e.text, salience: e.features?.salience || 0 })).sort((a,b) => b.salience-a.salience);
  for (const intent of contract.intents) {
    const elements = members(intent.subject);
    if (!elements.length) { incomplete = true; continue; }
    const subject = strongest(intent.subject);
    if (!subject) {
      signals.push({ intentId: intent.id, type: 'visibility', severity: 'HIGH', explanation: `${intent.subject} is present but hidden.`, evidenceIds: elements.map(e=>e.id), facts: { visible: false }, definitive: intent.type === 'action_discoverability' });
      continue;
    }
    if (intent.type === 'hierarchy') {
      const other = strongest(intent.relativeTo);
      if (!members(intent.relativeTo).length) { incomplete = true; continue; }
      if (!other) continue;
      const primary = intent.expectation === 'dominant' ? subject : other;
      const contextual = intent.expectation === 'dominant' ? other : subject;
      const a = primary.features?.salience || 0, b = contextual.features?.salience || 0;
      if (b > a * hierarchyRatio) signals.push({ intentId: intent.id, type: 'hierarchy', severity: 'MEDIUM', explanation: `Contextual element has greater salience than the expected dominant entity (${b.toFixed(2)} vs ${a.toFixed(2)}).`, evidenceIds: [primary.id, contextual.id], facts: { primarySalience: a, contextualSalience: b, ratio: hierarchyRatio }, definitive: false });
    } else if (intent.type === 'action_discoverability') {
      const visible = elements.filter(e=>e.visible && e.inViewport && !e.occluded && !e.disabled && e.interactive);
      const rank = Math.min(...visible.map(e => actionRanking.findIndex(a=>a.id===e.id) + 1));
      if (!visible.length || (intent.expectation === 'immediate' && rank > 2)) {
        signals.push({ intentId: intent.id, type: 'action_discoverability', severity: !visible.length ? 'HIGH' : 'MEDIUM', explanation: !visible.length ? 'Declared action is outside the viewport, obscured, disabled or not interactive.' : `Primary action ranks ${rank} among visible actions; immediate actions should rank in the top two.`, evidenceIds: [...elements.map(e=>e.id), ...actionRanking.slice(0,2).map(e=>e.id)], facts: { rank: Number.isFinite(rank) ? rank : 0, available: !!visible.length }, definitive: !visible.length });
      }
    } else {
      const primaryIds = evidence.entities.filter(b=>b.priority==='primary').map(b=>b.id);
      const statuses = evidence.elements.filter(e=>e.visible && e.entityIds.includes(intent.subject) && (e.role==='status' || e.role==='alert' || /not started|in progress|completed|has not|pending|failed/i.test(e.text)) && e.id !== subject.id);
      const labels = evidence.elements.filter(e=>e.visible && e.entityIds.includes(intent.subject) && (/^h[1-6]$/.test(e.tag) || e.role === 'heading') && !statuses.includes(e));
      for (const status of statuses) {
        const near = (e: ElementEvidence) => Math.hypot(e.rect.x-status.rect.x, e.rect.y-status.rect.y);
        const labelDistance = labels.length ? Math.min(...labels.map(near)) : Infinity;
        const primaryHeadings = evidence.elements.filter(e=>e.visible && /^h[1-6]$/.test(e.tag) && e.entityIds.some(id=>primaryIds.includes(id)));
        const primaryDistance = primaryHeadings.length ? Math.min(...primaryHeadings.map(near)) : Infinity;
        const mixed = status.entityIds.some(id=>primaryIds.includes(id));
        if (mixed || !labels.length || (labelDistance > 160 && primaryDistance < labelDistance)) {
          signals.push({ intentId: intent.id, type: 'semantic_ownership', severity: 'MEDIUM', explanation: mixed ? 'Contextual status shares DOM containment with the primary entity.' : 'Contextual status lacks a nearby entity heading and is closer to the primary context.', evidenceIds: [status.id, subject.id, ...labels.map(e=>e.id), ...primaryHeadings.map(e=>e.id)], facts: { primaryDistance: Number.isFinite(primaryDistance) ? Math.round(primaryDistance) : -1, labelDistance: Number.isFinite(labelDistance) ? Math.round(labelDistance) : -1, mixedContainer: mixed }, definitive: false });
        }
      }
    }
  }
  return { requiresAI: signals.some(s=>!s.definitive), incomplete, signals, actionRanking };
}
