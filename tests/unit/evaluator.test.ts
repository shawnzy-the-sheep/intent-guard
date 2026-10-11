import { it, expect, vi } from 'vitest';
import { evaluateWithRetry } from '../../packages/evaluator/src/evaluateHierarchy.js';
import {
  MockProvider,
  OpenAIProvider,
} from '../../packages/evaluator/src/provider.js';
import { loadContract } from '../../packages/contracts/src/loader.js';
import { normalizeEvidence } from '../../packages/evidence/src/salience.js';
import { evaluateRules } from '../../packages/rules/src/index.js';
import { element, page } from './fixtures.js';
async function input() {
  const contract = await loadContract('intent/task-details.yaml');
  const evidence = normalizeEvidence(
    page([
      element('task'),
      element('job'),
      element('continue', { interactive: true }),
    ]),
  );
  return {
    contract,
    evidence,
    deterministic: evaluateRules(evidence, contract),
  };
}
it('retries invalid visual output once and returns INCONCLUSIVE', async () => {
  const provider = new MockProvider();
  const visual = vi
    .spyOn(provider, 'evaluateVisualHierarchy')
    .mockResolvedValue({
      ranking: [{ evidenceId: 'invented', prominence: 1 }],
      observations: [],
      confidence: 1,
    });
  const result = await evaluateWithRetry(provider, await input());
  expect(result.intent.result).toBe('INCONCLUSIVE');
  expect(visual).toHaveBeenCalledTimes(2);
});
it('rejects invented intent citations and wrong contract IDs', async () => {
  const provider = new MockProvider();
  vi.spyOn(provider, 'evaluateIntent').mockResolvedValue({
    result: 'REVIEW',
    severity: 'HIGH',
    contractId: 'other',
    confidence: 0.9,
    explanation: 'bad',
    evidenceIds: ['invented'],
    uncertainty: null,
  });
  const result = await evaluateWithRetry(provider, await input());
  expect(result.intent.result).toBe('INCONCLUSIVE');
  expect(result.calls).toBe(3);
});
it('bounds hung provider calls', async () => {
  const provider = new MockProvider();
  vi.spyOn(provider, 'evaluateVisualHierarchy').mockImplementation(
    () => new Promise(() => {}),
  );
  const result = await evaluateWithRetry(provider, await input(), 10);
  expect(result.intent.result).toBe('INCONCLUSIVE');
  expect(result.calls).toBe(2);
});
it('turns low confidence into INCONCLUSIVE', async () => {
  const provider = new MockProvider();
  vi.spyOn(provider, 'evaluateIntent').mockResolvedValue({
    result: 'PASS',
    severity: null,
    confidence: 0.3,
    contractId: 'task-details',
    explanation: 'uncertain',
    evidenceIds: [],
    uncertainty: null,
  });
  expect((await evaluateWithRetry(provider, await input())).intent.result).toBe(
    'INCONCLUSIVE',
  );
});
it('uses the Responses structured-output protocol without persisting API secrets', async () => {
  const mock = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        status: 'completed',
        output: [
          {
            type: 'message',
            content: [
              {
                type: 'output_text',
                text: JSON.stringify({
                  result: 'PASS',
                  severity: null,
                  confidence: 0.9,
                  contractId: 'task-details',
                  explanation: 'No conflict.',
                  evidenceIds: [],
                  uncertainty: null,
                }),
              },
            ],
          },
        ],
      }),
      { status: 200 },
    ),
  );
  vi.stubGlobal('fetch', mock);
  try {
    const provider = new OpenAIProvider('configured-model', 'test-key');
    const i = await input();
    const visual = await new MockProvider().evaluateVisualHierarchy(i);
    await provider.evaluateIntent({ ...i, visual });
    const body = JSON.parse(mock.mock.calls[0]![1].body);
    expect(body.store).toBe(false);
    expect(body.text.format.type).toBe('json_schema');
    expect(body.text.format.strict).toBe(true);
    expect(JSON.stringify(body)).not.toContain('test-key');
  } finally {
    vi.unstubAllGlobals();
  }
});
