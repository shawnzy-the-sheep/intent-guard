import { beforeAll, afterAll, it, expect } from 'vitest';
import { type Browser } from 'playwright';
import { launchBrowser } from '../../packages/playwright/src/browser.js';
import { createServer, type Server } from 'node:http';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadContract } from '../../packages/contracts/src/loader.js';
import { collectPageEvidence } from '../../packages/playwright/src/collector.js';
import { runContract } from '../../packages/core/src/runContract.js';
import { ConfigSchema } from '../../packages/core/src/config.js';
let browser: Browser, server: Server, baseURL: string, dir: string;
const html = `<!doctype html><html lang="en"><head><title>Evidence fixture</title></head><body><main><section data-entity="task" style="padding:40px"><h1>Task #1042</h1><p data-sensitive>private-secret-938</p><p class="customer-email">alice@example.com</p><p>Visible contact bob@example.com</p><input type="password" value="password-secret-731"/><button data-action="continue-task">Continue Task</button></section><aside data-entity="parent-job"><h2>Parent Job</h2><p role="status">Not Started</p></aside></main></body></html>`;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'ux-guard-pipeline-test-'));
  server = createServer((req, res) => {
    res.writeHead(req.url?.startsWith('/404') ? 404 : 200, {
      'Content-Type': 'text/html',
    });
    res.end(html);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No address');
  baseURL = `http://127.0.0.1:${address.port}`;
  browser = await launchBrowser();
});
afterAll(async () => {
  await browser?.close();
  await new Promise<void>((r) => server?.close(() => r()));
});
it('captures geometry, selector bindings, accessibility and redacted screenshot/text', async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(baseURL);
  const evidence = await collectPageEvidence(
    page,
    await loadContract('intent/task-details.yaml'),
    join(dir, 'page.png'),
  );
  const data = JSON.stringify(evidence);
  expect(data).not.toContain('private-secret');
  expect(data).not.toContain('password-secret');
  expect(data).not.toContain('alice@example');
  expect(data).not.toContain('bob@example');
  expect(data).toContain('[EMAIL]');
  expect(
    await page
      .locator('[data-sensitive]')
      .evaluate((el) => getComputedStyle(el).visibility),
  ).toBe('hidden');
  expect(evidence.entities[0]?.elementIds.length).toBe(1);
  expect(evidence.elements.some((e) => e.rect.width > 0)).toBe(true);
  expect(evidence.accessibility.passes).toBeGreaterThan(0);
  await context.close();
});
it('fails closed for invalid redaction selectors', async () => {
  const page = await browser.newPage();
  await page.goto(baseURL);
  await expect(
    collectPageEvidence(
      page,
      await loadContract('intent/task-details.yaml'),
      join(dir, 'invalid.png'),
      ['[invalid'],
    ),
  ).rejects.toThrow();
  await page.close();
});
it('returns INCONCLUSIVE for missing subjects and ERROR for HTTP failures', async () => {
  const c = await loadContract('intent/task-details.yaml');
  const config = ConfigSchema.parse({ baseURL, outputDir: dir });
  c.actions.continue_task!.selectors = ['.missing'];
  const missing = await runContract(c, config, undefined, { browser });
  expect(missing.result).toBe('INCONCLUSIVE');
  c.page.route = '/404';
  const failed = await runContract(c, config, undefined, { browser });
  expect(failed.result).toBe('ERROR');
  expect(failed.errorKind).toBe('EXECUTION_ERROR');
});
it('keeps local debug artifacts free of masked content', async () => {
  const c = await loadContract('intent/task-details.yaml');
  const config = ConfigSchema.parse({
    baseURL,
    outputDir: dir,
    provider: 'mock',
  });
  const r = await runContract(c, config, undefined, { browser, debug: true });
  const report = await readFile(
    join(r.artifactDir, 'page-evidence.json'),
    'utf8',
  );
  expect(report).not.toContain('private-secret');
  expect(report).not.toContain('password-secret');
  expect(report).not.toContain('@example.com');
});
