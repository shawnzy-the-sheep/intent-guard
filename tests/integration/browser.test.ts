import { beforeAll, afterAll, it, expect } from 'vitest';
import { type Browser } from 'playwright';
import { launchBrowser } from '../../packages/playwright/src/browser.js';
import { createServer, type Server } from 'node:http';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadContract } from '../../packages/contracts/src/loader.js';
import { projectDomEvidence } from '../../packages/playwright/src/projection.js';
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

it('ignores hidden navigation bulk while retaining hidden contract actions', async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.setContent(
    `<html lang="en"><head><title>Hidden menus</title></head><body><nav style="display:none">${'<a href="#">Hidden navigation</a>'.repeat(450)}</nav><main><section data-entity="task"><h1>Current task</h1><button data-action="continue-task" style="display:none">Continue Task</button></section><aside data-entity="parent-job"><h2>Parent Job</h2></aside></main></body></html>`,
  );
  const contract = await loadContract('intent/task-details.yaml');
  const evidence = await collectPageEvidence(
    page,
    contract,
    join(dir, 'hidden-menu.png'),
  );
  expect(evidence.truncated).toBe(false);
  const binding = evidence.actions.find((a) => a.id === 'continue_task');
  expect(binding?.elementIds).toHaveLength(1);
  expect(
    evidence.elements.find((e) => e.id === binding?.elementIds[0])?.visible,
  ).toBe(false);
  await page.setContent(
    `<main>${'<a href="#">Visible action</a>'.repeat(450)}</main>`,
  );
  const large = await collectPageEvidence(
    page,
    contract,
    join(dir, 'large.png'),
  );
  expect(large.truncated).toBe(true);
  await context.close();
});

it('does not mistake an empty transparent card link for text occlusion', async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  const contract = await loadContract('intent/task-details.yaml');
  await page.setContent(
    `<main><section data-entity="task" style="position:relative;width:600px;height:200px"><h1 style="pointer-events:none">Current task</h1><a aria-hidden="true" tabindex="-1" href="#" style="position:absolute;inset:0"></a></section><aside data-entity="parent-job"><h2>Parent Job</h2></aside><button data-action="continue-task">Continue Task</button></main>`,
  );
  let raw = await page.evaluate(projectDomEvidence, contract);
  expect(raw.elements.find((e) => e.tag === 'h1')?.occluded).toBe(false);
  await page
    .locator('a')
    .evaluate((el) => ((el as HTMLElement).style.backgroundColor = 'black'));
  raw = await page.evaluate(projectDomEvidence, contract);
  expect(raw.elements.find((e) => e.tag === 'h1')?.occluded).toBe(true);
  await context.close();
});
