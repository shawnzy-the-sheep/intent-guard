import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { UXContractSchema } from '../packages/contracts/dist/index.js';
import { normalizeEvidence } from '../packages/evidence/dist/index.js';
import { evaluateRules } from '../packages/rules/dist/index.js';
import { writeReport } from '../packages/reporter/dist/index.js';

// Input is a read-only DOM projection captured through the browser extension.
// This evaluates the same rules but does not claim a full Playwright/axe run.
if (!process.argv[2])
  throw new Error(
    'Usage: node scripts/evaluate-live-capture.mjs <capture-directory>',
  );
const artifactDir = resolve(process.argv[2]);
const capture = JSON.parse(
  await readFile(resolve(artifactDir, 'capture.json'), 'utf8'),
);
const contract = UXContractSchema.parse(capture.contract);
const start = performance.now();
const evidence = normalizeEvidence(capture.evidence);
const deterministic = evaluateRules(evidence, contract);
const result = deterministic.incomplete
  ? 'INCONCLUSIVE'
  : deterministic.signals.length
    ? 'REVIEW'
    : 'PASS';
const report = {
  runId: randomUUID(),
  contractId: contract.id,
  result,
  source: 'existing-browser-capture',
  explanation: deterministic.incomplete
    ? 'Captured DOM evidence is incomplete.'
    : deterministic.signals.length
      ? 'Deterministic findings from a read-only browser capture; semantic judgment skipped.'
      : 'No deterministic suspicion in the selected contract. Browser automation, axe and masking were not run.',
  artifactDir,
  viewport: evidence.viewport,
  evidenceIds: [
    ...new Set(deterministic.signals.flatMap((s) => s.evidenceIds)),
  ],
  deterministic,
  model: null,
  promptVersion: 'read-only-capture-v1',
  aiCalls: 0,
  cacheHit: false,
  latencyMs: Math.round(performance.now() - start),
  timestamp: capture.capturedAt,
};
await writeFile(
  resolve(artifactDir, 'page-evidence.json'),
  JSON.stringify(evidence, null, 2),
);
await writeReport(report, evidence);
console.log(
  JSON.stringify({
    contractId: contract.id,
    result,
    elements: evidence.elements.length,
    truncated: evidence.truncated,
    signals: deterministic.signals.map((s) => s.type),
    artifactDir,
  }),
);
