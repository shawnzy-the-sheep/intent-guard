import { createServer } from 'node:http';
import { glob, readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join, extname } from 'node:path';
import { launchBrowser } from '../packages/playwright/dist/index.js';
import { loadContract } from '../packages/contracts/dist/index.js';
import { ConfigSchema } from '../packages/core/dist/config.js';
import { runContract } from '../packages/core/dist/runContract.js';
const root = resolve('benchmarks/uxbench');
const server = createServer(async (req, res) => {
  const path = resolve(
    root,
    '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname),
  );
  if (!path.startsWith(root + '/')) {
    res.writeHead(403);
    res.end();
    return;
  }
  try {
    const content = await readFile(path);
    res.setHeader(
      'Content-Type',
      extname(path) === '.html' ? 'text/html' : 'application/octet-stream',
    );
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const baseURL = `http://127.0.0.1:${server.address().port}`;
const provider = process.env.INTENTGUARD_BENCH_PROVIDER || 'mock';
const config = ConfigSchema.parse({
  baseURL,
  outputDir: '.intentguard/benchmark',
  provider,
  model: process.env.INTENTGUARD_MODEL,
  cache: false,
});
let browser;
const results = [];
try {
  browser = await launchBrowser();
  for await (const relative of glob('*/*/contract.yaml', { cwd: root })) {
    const folder = relative.slice(0, -'/contract.yaml'.length),
      c = await loadContract(join(root, relative));
    const expected = JSON.parse(
      await readFile(join(root, folder, 'expected.json'), 'utf8'),
    );
    for (const variant of ['good', 'bad']) {
      c.page.route = `/${folder}/${variant}.html`;
      const r = await runContract(c, config, undefined, { browser });
      results.push({
        case: folder,
        variant,
        expected: expected[variant],
        result: r.result,
        aiCalls: r.aiCalls,
        latencyMs: r.latencyMs,
        source: r.source,
        artifactDir: r.artifactDir,
      });
      console.log(
        `${folder}/${variant}: ${r.result} (expected ${expected[variant]})`,
      );
    }
  }
} finally {
  await browser?.close();
  await new Promise((r) => server.close(r));
}
const tp = results.filter(
  (r) => r.expected === 'REVIEW' && r.result === 'REVIEW',
).length;
const tn = results.filter(
  (r) => r.expected === 'PASS' && r.result === 'PASS',
).length;
const fp = results.filter(
  (r) => r.expected === 'PASS' && r.result === 'REVIEW',
).length;
const fn = results.filter(
  (r) => r.expected === 'REVIEW' && r.result === 'PASS',
).length;
const undecided = results.filter((r) =>
  ['INCONCLUSIVE', 'ERROR'].includes(r.result),
).length;
const ratio = (a, b) => (b ? a / b : null);
const precision = ratio(tp, tp + fp),
  recall = ratio(tp, results.filter((r) => r.expected === 'REVIEW').length);
const summary = {
  provider,
  labelStatus:
    'authored synthetic expectations; independent human labels pending',
  cases: results.length,
  tp,
  tn,
  fp,
  fn,
  undecided,
  precision,
  recall,
  f1:
    precision !== null && recall !== null && precision + recall
      ? (2 * precision * recall) / (precision + recall)
      : null,
  falsePositiveRate: ratio(
    fp,
    results.filter((r) => r.expected === 'PASS').length,
  ),
  coverage: ratio(results.length - undecided, results.length),
  averageAiCalls: ratio(
    results.reduce((n, r) => n + r.aiCalls, 0),
    results.length,
  ),
  averageLatencyMs: ratio(
    results.reduce((n, r) => n + r.latencyMs, 0),
    results.length,
  ),
  costUSD: null,
  humanModelAgreement: null,
  results,
};
await mkdir('.intentguard/benchmark', { recursive: true });
await writeFile(
  '.intentguard/benchmark/summary.json',
  JSON.stringify(summary, null, 2),
);
console.log(JSON.stringify({ ...summary, results: undefined }, null, 2));
if (
  results.some((r) => r.result === 'ERROR') ||
  (provider === 'mock' && results.some((r) => r.result !== r.expected))
)
  process.exitCode = 1;
