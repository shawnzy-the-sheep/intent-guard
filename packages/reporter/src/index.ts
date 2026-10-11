import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import type {
  PageEvidence,
  DeterministicEvidence,
} from '@ux-guard-pipeline/evidence';
import type {
  IntentEvaluation,
  VisualEvaluation,
} from '@ux-guard-pipeline/evaluator';
import type { Result, ErrorKind } from '@ux-guard-pipeline/shared';
export interface RunReport {
  runId: string;
  contractId: string;
  result: Result;
  source: string;
  explanation: string;
  artifactDir: string;
  viewport: { width: number; height: number };
  evidenceIds: string[];
  deterministic?: DeterministicEvidence;
  intent?: IntentEvaluation;
  visual?: VisualEvaluation;
  errorKind?: ErrorKind;
  model: string | null;
  promptVersion: string;
  aiCalls: number;
  cacheHit: boolean;
  latencyMs: number;
  timestamp: string;
  accessibility?: PageEvidence['accessibility'];
}
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&apos;',
      })[c]!,
  );
const md = (s: string) =>
  s.replace(/[\r\n]/g, ' ').replace(/[\\`*_{}[\]<>|]/g, '\\$&');
export function consoleReport(report: RunReport): string {
  return [
    `${report.result === 'PASS' ? '✓' : report.result === 'ERROR' ? '✗' : '⚠'} ${report.contractId} — ${report.result} (${report.source})`,
    `  ${report.explanation}`,
    report.evidenceIds.length
      ? `  Evidence: ${report.evidenceIds.join(', ')}`
      : '',
    `  AI calls: ${report.aiCalls}${report.cacheHit ? ' (cached)' : ''} | Accessibility violations: ${report.accessibility?.violations.length ?? 'unavailable'}`,
    `  Artifacts: ${report.artifactDir}`,
  ]
    .filter(Boolean)
    .join('\n');
}
export function markdownReport(report: RunReport): string {
  return [
    `# ux-guard-pipeline: ${md(report.contractId)}`,
    '',
    `**${report.result}** · ${report.source} · ${report.viewport.width} × ${report.viewport.height}`,
    '',
    md(report.explanation),
    '',
    '## Evidence',
    '',
    `IDs: ${report.evidenceIds.map(md).join(', ') || 'None'}`,
    '',
    '![Annotated evidence](annotated.png)',
    '',
    ...(report.deterministic?.signals.flatMap((s) => [
      `### ${md(s.intentId)}`,
      '',
      md(s.explanation),
      '',
      `Evidence: ${s.evidenceIds.map(md).join(', ')}`,
      '',
      '```json',
      JSON.stringify(s.facts, null, 2),
      '```',
      '',
    ]) || []),
    '## Accessibility (deterministic)',
    '',
    ...(report.accessibility?.violations.map(
      (v) => `- ${md(v.id)} (${v.impact || 'unknown'}): ${v.count} node(s)`,
    ) || ['Unavailable']),
    '',
    '## Reproducibility',
    '',
    `Model: ${md(report.model || 'none')} · Prompts: ${report.promptVersion} · AI calls: ${report.aiCalls} · Cache hit: ${report.cacheHit}`,
    '',
    `Latency: ${report.latencyMs}ms · Run: ${report.runId}`,
    '',
    report.intent?.uncertainty
      ? `Uncertainty: ${md(report.intent.uncertainty)}`
      : '',
    '',
    'Salience weights are provisional suspicion heuristics. REVIEW requires human judgment. Mock results do not establish model accuracy.',
    '',
  ].join('\n');
}
export async function annotateScreenshot(
  evidence: PageEvidence,
  highlighted: string[],
  outputPath: string,
) {
  const metadata = await sharp(evidence.screenshotPath).metadata();
  const width = metadata.width!,
    height = metadata.height!;
  const chosen = evidence.elements.filter(
    (e) => highlighted.includes(e.id) && e.visible,
  );
  const overlay = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${chosen.map((e) => `<rect x="${e.rect.x}" y="${e.rect.y}" width="${e.rect.width}" height="${e.rect.height}" fill="none" stroke="#ef4444" stroke-width="3"/><rect x="${Math.max(0, e.rect.x)}" y="${Math.max(0, e.rect.y - 20)}" width="${Math.min(220, width - e.rect.x)}" height="20" fill="#991b1b"/><text x="${Math.max(0, e.rect.x) + 4}" y="${Math.max(0, e.rect.y - 20) + 14}" font-family="sans-serif" font-size="12" fill="white">${escape(e.id)} · ${(e.features?.salience || 0).toFixed(2)}</text>`).join('')}</svg>`;
  await sharp(evidence.screenshotPath)
    .composite([{ input: Buffer.from(overlay) }])
    .png()
    .toFile(outputPath);
}
export async function writeReport(
  report: RunReport,
  evidence?: PageEvidence,
): Promise<void> {
  if (evidence)
    await annotateScreenshot(
      evidence,
      report.evidenceIds,
      join(report.artifactDir, 'annotated.png'),
    );
  await writeFile(
    join(report.artifactDir, 'report.json'),
    JSON.stringify(report, null, 2),
  );
  await writeFile(
    join(report.artifactDir, 'report.md'),
    markdownReport(report),
  );
}
