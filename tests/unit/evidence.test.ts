import { expect, it } from 'vitest';
import { normalizeEvidence } from '../../packages/evidence/src/salience.js';
import { evaluateRules } from '../../packages/rules/src/index.js';
import { loadContract } from '../../packages/contracts/src/loader.js';
import { element, page } from './fixtures.js';
it('ranks main content actions without treating global navigation as task competition', async () => {
  const c = await loadContract('intent/task-details.yaml');
  const e = normalizeEvidence(
    page([
      element('main', { tag: 'main' }),
      element('task', { parentId: 'main' }),
      element('job', { parentId: 'main' }),
      element('continue', {
        tag: 'button',
        interactive: true,
        parentId: 'task',
      }),
      element('nav', {
        tag: 'a',
        interactive: true,
        rect: { x: 0, y: 0, width: 1200, height: 100 },
      }),
    ]),
  );
  expect(evaluateRules(e, c).actionRanking.map((r) => r.id)).toEqual([
    'continue',
  ]);
});
it('normalises salience reproducibly and suppresses hidden/occluded elements', () => {
  const a = element('a'),
    b = element('b', { visible: false }),
    c = element('c', { occluded: true });
  const evidence = normalizeEvidence(page([a, b, c]));
  expect(evidence.elements[0]?.features?.salience).toBeGreaterThan(0);
  expect(evidence.elements[1]?.features?.salience).toBe(0);
  expect(evidence.elements[2]?.features?.salience).toBe(0);
  expect(normalizeEvidence(evidence)).toEqual(evidence);
});
it('distinguishes hierarchy suspicion from missing evidence', async () => {
  const contract = await loadContract('intent/task-details.yaml');
  const e = normalizeEvidence(
    page([
      element('task', { rect: { x: 0, y: 400, width: 400, height: 100 } }),
      element('job', {
        rect: { x: 0, y: 0, width: 1200, height: 300 },
        style: {
          ...element('x').style,
          fontSize: '36px',
          fontWeight: '800',
          position: 'sticky',
        },
      }),
      element('continue', { interactive: true, tag: 'button' }),
    ]),
  );
  const result = evaluateRules(e, contract);
  expect(result.requiresAI).toBe(true);
  expect(result.signals.some((s) => s.type === 'hierarchy')).toBe(true);
  expect(
    evaluateRules(
      { ...e, elements: e.elements.filter((e) => e.id !== 'job') },
      contract,
    ).incomplete,
  ).toBe(true);
});
it('makes an offscreen/disabled primary action a deterministic fact', async () => {
  const c = await loadContract('intent/task-details.yaml');
  const e = normalizeEvidence(
    page([
      element('task'),
      element('job'),
      element('continue', { interactive: true, inViewport: false }),
    ]),
  );
  expect(
    evaluateRules(e, c).signals.find((s) => s.type === 'action_discoverability')
      ?.definitive,
  ).toBe(true);
});
