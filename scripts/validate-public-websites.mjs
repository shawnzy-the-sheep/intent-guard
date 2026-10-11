import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, relative, basename } from 'node:path';
import { stringify } from 'yaml';
import { launchBrowser } from '../packages/playwright/dist/index.js';
import { UXContractSchema } from '../packages/contracts/dist/index.js';
import { ConfigSchema } from '../packages/core/dist/config.js';
import { runContract } from '../packages/core/dist/runContract.js';

// The collector and runner are unchanged. This browser wrapper waits for public
// page rendering and applies explicit controls only to an isolated local DOM.
const suiteDir = resolve(process.argv[2] || 'benchmarks/public-websites');
const cases = JSON.parse(
  await readFile(resolve(suiteDir, 'cases.json'), 'utf8'),
);
const outputDir = resolve('.ux-guard-pipeline', basename(suiteDir));
await mkdir(outputDir, { recursive: true });
const browser = await launchBrowser();
const results = [];
const liveConfigured =
  !!process.env.OPENAI_API_KEY && !!process.env.UX_GUARD_PIPELINE_MODEL;
try {
  for (const example of cases) {
    for (const variant of ['baseline', 'regression']) {
      const id = `${example.id}-${variant}`;
      const url = new URL(example.url);
      const action = example.type === 'action_discoverability';
      const contract = UXContractSchema.parse({
        version: 1,
        id,
        page: { route: url.pathname + url.search },
        user: { role: 'signed-out public visitor' },
        goal: { primary: example.goal },
        entities: action
          ? {}
          : {
              primary: { priority: 'primary', selectors: [example.subject] },
              context: {
                priority: 'contextual',
                selectors: [example.relativeTo],
              },
            },
        actions: action
          ? {
              primary_action: {
                priority: 'primary',
                selectors: [example.subject],
              },
            }
          : {},
        intents: [
          {
            id: `${id}-intent`,
            type: example.type,
            subject: action ? 'primary_action' : 'primary',
            expectation: example.expectation,
            ...(!action ? { relativeTo: 'context' } : {}),
          },
        ],
      });
      await mkdir(resolve(suiteDir, 'contracts'), { recursive: true });
      await writeFile(
        resolve(suiteDir, 'contracts', `${id}.yaml`),
        stringify(contract),
      );
      let mutationApplied = false;
      let selectorCounts = null;
      let httpStatus = null;
      let finalURL = null;
      let loadTimedOut = false;
      let stylesheetStatus = null;
      const wrappedBrowser = {
        async newContext(options) {
          const context = await browser.newContext(options);
          const newPage = context.newPage.bind(context);
          context.newPage = async () => {
            const page = await newPage();
            const goto = page.goto.bind(page);
            page.goto = async (...args) => {
              const response = await goto(...args);
              httpStatus = response?.status() ?? null;
              finalURL = page.url();
              try {
                await page.waitForLoadState('load', { timeout: 10000 });
              } catch {
                loadTimedOut = true;
              }
              await page.waitForTimeout(1500);
              stylesheetStatus = await page.evaluate(() => {
                const links = [
                  ...document.querySelectorAll('link[rel=stylesheet]'),
                ];
                return {
                  total: links.length,
                  unavailable: links.filter((link) => !link.sheet).length,
                };
              });
              selectorCounts = {
                subject: await page.locator(example.subject).count(),
                ...(!action
                  ? {
                      relativeTo: await page
                        .locator(example.relativeTo)
                        .count(),
                    }
                  : {}),
              };
              if (variant === 'regression') {
                mutationApplied = await page.evaluate(
                  ({ selector, mutation }) => {
                    const elements = [...document.querySelectorAll(selector)];
                    for (const el of elements) {
                      if (mutation === 'disable') {
                        el.setAttribute('disabled', '');
                        el.setAttribute('aria-disabled', 'true');
                      } else {
                        const style =
                          mutation === 'hide'
                            ? { display: 'none' }
                            : mutation === 'offscreen'
                              ? { position: 'absolute', top: '2500px' }
                              : {
                                  position: 'fixed',
                                  top: '80px',
                                  left: '40px',
                                  width: '1100px',
                                  height: '500px',
                                  'font-size': '100px',
                                  'font-weight': '900',
                                  color: '#ffffff',
                                  background: '#000000',
                                  'z-index': '999999',
                                  display: 'block',
                                };
                        for (const [name, value] of Object.entries(style))
                          el.style.setProperty(name, value, 'important');
                      }
                    }
                    return elements.length > 0;
                  },
                  {
                    selector: action ? example.subject : example.relativeTo,
                    mutation: example.mutation,
                  },
                );
              }
              return response;
            };
            return page;
          };
          return context;
        },
      };
      const config = ConfigSchema.parse({
        baseURL: url.origin,
        outputDir,
        cache: false,
        timeoutMs: 30000,
        provider: 'none',
        viewports: [{ width: 1280, height: 800 }],
      });
      const report = await runContract(contract, config, undefined, {
        browser: wrappedBrowser,
        deterministicOnly: true,
      });
      let collection = null;
      if (report.deterministic) {
        const evidence = JSON.parse(
          await readFile(
            resolve(report.artifactDir, 'page-evidence.json'),
            'utf8',
          ),
        );
        collection = {
          elements: evidence.elements.length,
          truncated: evidence.truncated,
        };
      }
      const expected = example[`${variant}Expected`];
      const result = {
        id,
        url: example.url,
        finalURL,
        httpStatus,
        loadTimedOut,
        stylesheetStatus,
        variant,
        type: example.type,
        selectors: {
          subject: example.subject,
          ...(!action ? { relativeTo: example.relativeTo } : {}),
        },
        selectorCounts,
        collection,
        mutation: variant === 'regression' ? example.mutation : null,
        mutationApplied,
        expected,
        actual: report.result,
        matchesExpected: report.result === expected,
        rationale: example.rationale,
        timestamp: report.timestamp,
        viewport: report.viewport,
        explanation: report.explanation,
        evidenceIds: report.evidenceIds,
        signals: report.deterministic?.signals ?? [],
        incomplete: report.deterministic?.incomplete ?? null,
        aiCalls: report.aiCalls,
        source: report.source,
        latencyMs: report.latencyMs,
        artifacts: relative(process.cwd(), report.artifactDir),
      };
      results.push(result);
      console.log(
        `${id}: ${report.result} (expected ${expected}); selectors ${JSON.stringify(selectorCounts)}`,
      );
    }
  }
} finally {
  await browser.close();
}
const summary = {
  capturedAt: new Date().toISOString(),
  mode: 'deterministic-only',
  liveConfigured,
  labels:
    'Authored expectations declared before execution; no independent human labels',
  cases: results.length,
  matched: results.filter((r) => r.matchesExpected).length,
  falsePositiveSuspicions: results.filter(
    (r) => r.expected === 'PASS' && r.actual === 'REVIEW',
  ).length,
  misses: results.filter((r) => r.expected === 'REVIEW' && r.actual === 'PASS')
    .length,
  inconclusive: results.filter((r) => r.actual === 'INCONCLUSIVE').length,
  errors: results.filter((r) => r.actual === 'ERROR').length,
  results,
};
await writeFile(
  resolve(suiteDir, 'results.json'),
  JSON.stringify(summary, null, 2) + '\n',
);
console.log(JSON.stringify({ ...summary, results: undefined }, null, 2));
if (
  results.some(
    (r) =>
      !r.matchesExpected ||
      !r.selectorCounts ||
      Object.values(r.selectorCounts).some((count) => count !== 1) ||
      (r.variant === 'regression' && !r.mutationApplied),
  )
)
  process.exitCode = 1;
