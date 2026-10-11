import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { access, mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchBrowser } from '../packages/playwright/dist/index.js';
import { startDemo, waitForURL, availablePort } from './process-utils.mjs';
const port = await availablePort();
const baseURL = `http://127.0.0.1:${port}`;
const child = startDemo(port);
const dir = await mkdtemp(join(tmpdir(), 'ux-guard-pipeline-e2e-'));
const config = join(dir, 'ux-guard-pipeline.config.json');
await writeFile(
  config,
  JSON.stringify({
    baseURL,
    contracts: ['intent/*.yaml'],
    outputDir: dir,
    provider: 'mock',
    readySelector: '[data-entity="task"]',
  }),
);
async function cli(args) {
  const p = spawn(
    process.execPath,
    [
      'packages/cli/dist/index.js',
      'test',
      'task-details',
      '--config',
      config,
      '--json',
      ...args,
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let stdout = '',
    stderr = '';
  p.stdout.on('data', (d) => (stdout += d));
  p.stderr.on('data', (d) => (stderr += d));
  const code = await new Promise((r) => p.on('close', r));
  return { code, stdout, stderr };
}
try {
  await waitForURL(baseURL, child);
  for (const variant of ['good', 'hierarchy', 'ownership', 'action']) {
    const result = await cli(['--route', `/demo/${variant}`, '--debug']);
    assert.equal(result.code, 0, result.stderr);
    const [report] = JSON.parse(result.stdout);
    assert.equal(
      report.accessibility.violations.length,
      0,
      JSON.stringify(report.accessibility),
    );
    assert.equal(
      report.result,
      variant === 'good' ? 'PASS' : 'REVIEW',
      JSON.stringify(report),
    );
    if (variant !== 'good') assert.ok(report.evidenceIds.length);
    for (const file of [
      'screenshot.png',
      'annotated.png',
      'report.md',
      'page-evidence.json',
      'deterministic.json',
      'events.jsonl',
    ])
      await access(join(report.artifactDir, file));
    if (variant === 'hierarchy') {
      assert.ok(
        report.deterministic.signals.some((s) => s.type === 'hierarchy'),
      );
      assert.ok(
        report.deterministic.signals.every(
          (s) => s.type !== 'action_discoverability',
        ),
      );
      const rerun = await cli(['--route', '/demo/hierarchy']);
      const [cached] = JSON.parse(rerun.stdout);
      assert.equal(cached.cacheHit, true);
      assert.equal(cached.aiCalls, 0);
      console.log(`Cache verified: ${cached.artifactDir}`);
    }
    console.log(
      `${variant}: ${report.result}; ${report.aiCalls} AI calls; ${report.artifactDir}`,
    );
  }
  const failure = await cli([
    '--route',
    '/missing',
    '--base-url',
    'http://127.0.0.1:1',
  ]);
  assert.equal(failure.code, 1);
  const offline = await cli([
    '--route',
    '/demo/ownership',
    '--provider',
    'none',
  ]);
  assert.equal(offline.code, 0);
  assert.equal(JSON.parse(offline.stdout)[0].result, 'INCONCLUSIVE');
  const deterministic = await cli([
    '--route',
    '/demo/ownership',
    '--deterministic-only',
  ]);
  const [signal] = JSON.parse(deterministic.stdout);
  assert.equal(signal.result, 'REVIEW');
  assert.equal(signal.aiCalls, 0);
  assert.ok(await readFile(join(dir, 'summary.json'), 'utf8'));
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    for (const variant of ['good', 'hierarchy', 'ownership', 'action']) {
      await page.goto(`${baseURL}/demo/${variant}`);
      await page.locator('[data-action="continue-task"]').click();
      await page.getByRole('heading', { name: 'Migration review' }).waitFor();
    }
  } finally {
    await browser.close();
  }
  console.log(
    'E2E passed: identical functional actions across variants, CLI outcomes, artifacts, cache and technical failure exit.',
  );
} finally {
  child.kill('SIGTERM');
}
