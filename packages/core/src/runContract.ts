import { randomUUID, createHash } from 'node:crypto';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { type Browser } from 'playwright';
import type { UXContract } from '@intentguard/contracts';
import { normalizeEvidence, type PageEvidence } from '@intentguard/evidence';
import { collectPageEvidence, launchBrowser } from '@intentguard/playwright';
import { evaluateRules } from '@intentguard/rules';
import {
  OpenAIProvider,
  MockProvider,
  evaluateWithRetry,
  modelEvidence,
  PROMPT_VERSION,
  VISUAL_PROMPT,
  INTENT_PROMPT,
  IntentEvaluationSchema,
  VisualEvaluationSchema,
  type ModelProvider,
  type EvaluationOutcome,
} from '@intentguard/evaluator';
import { IntentGuardError, publicUrl } from '@intentguard/shared';
import { writeReport, type RunReport } from '@intentguard/reporter';
import type { IntentGuardConfig } from './config.js';
export interface RunOptions {
  deterministicOnly?: boolean;
  debug?: boolean;
  provider?: ModelProvider;
  browser?: Browser;
  log?: (entry: Record<string, unknown>) => void;
}
export async function runContract(
  contract: UXContract,
  config: IntentGuardConfig,
  viewport = config.viewports[0]!,
  options: RunOptions = {},
): Promise<RunReport> {
  const start = performance.now(),
    runId = randomUUID();
  const artifactDir = resolve(
    config.outputDir,
    'runs',
    `${runId}-${contract.id}-${viewport.width}x${viewport.height}`,
  );
  await mkdir(artifactDir, { recursive: true });
  const report: RunReport = {
    runId,
    contractId: contract.id,
    result: 'ERROR',
    source: 'deterministic',
    explanation: 'Run not completed',
    artifactDir,
    viewport,
    evidenceIds: [],
    model: null,
    promptVersion: PROMPT_VERSION,
    aiCalls: 0,
    cacheHit: false,
    latencyMs: 0,
    timestamp: new Date().toISOString(),
  };
  let browser: Browser | undefined = options.browser;
  let evidence: PageEvidence | undefined;
  let context: Awaited<ReturnType<Browser['newContext']>> | undefined;
  let stage = 'browser';
  const events: Record<string, unknown>[] = [];
  const log = (name: string, details: Record<string, unknown> = {}) => {
    const entry = {
      runId,
      contract: contract.id,
      stage: name,
      elapsedMs: Math.round(performance.now() - start),
      ...details,
    };
    events.push(entry);
    options.log?.(entry);
  };
  try {
    browser ||= await launchBrowser();
    context = await browser.newContext({
      viewport,
      reducedMotion: 'reduce',
      serviceWorkers: 'block',
    });
    const page = await context.newPage();
    page.setDefaultTimeout(config.timeoutMs);
    const url = new URL(contract.page.route, config.baseURL);
    if (url.origin !== new URL(config.baseURL).origin)
      throw new IntentGuardError(
        'CONTRACT_ERROR',
        'Contract navigation must stay on configured origin.',
      );
    log('navigation', { url: publicUrl(url.href) });
    const response = await page.goto(url.href, {
      waitUntil: 'domcontentloaded',
      timeout: config.timeoutMs,
    });
    if (!response || !response.ok())
      throw new IntentGuardError(
        'EXECUTION_ERROR',
        `Page returned HTTP ${response?.status() ?? 'unavailable'}`,
      );
    if (new URL(page.url()).origin !== url.origin)
      throw new IntentGuardError(
        'EXECUTION_ERROR',
        'Unexpected cross-origin redirect.',
      );
    if (config.readySelector)
      await page.locator(config.readySelector).waitFor({ state: 'visible' });
    await page.waitForFunction(
      () => document.fonts.status === 'loaded',
      undefined,
      { timeout: config.timeoutMs },
    );
    stage = 'evidence';
    evidence = normalizeEvidence(
      await collectPageEvidence(
        page,
        contract,
        join(artifactDir, 'screenshot.png'),
        config.redact,
      ),
    );
    report.accessibility = evidence.accessibility;
    await writeFile(
      join(artifactDir, 'page-evidence.json'),
      JSON.stringify(evidence, null, 2),
    );
    log('evidence', { elements: evidence.elements.length });
    const deterministic = evaluateRules(
      evidence,
      contract,
      config.hierarchyRatio,
    );
    report.deterministic = deterministic;
    report.evidenceIds = [
      ...new Set(deterministic.signals.flatMap((s) => s.evidenceIds)),
    ];
    await writeFile(
      join(artifactDir, 'deterministic.json'),
      JSON.stringify(deterministic, null, 2),
    );
    log('deterministic', { signals: deterministic.signals.length });
    if (deterministic.incomplete) {
      report.result = 'INCONCLUSIVE';
      report.explanation =
        'Required contract selectors did not resolve to unmasked evidence, or evidence exceeded the collection limit.';
    } else if (!deterministic.signals.length) {
      report.result = 'PASS';
      report.explanation =
        'No relevant deterministic suspicion found; AI was not invoked.';
    } else if (!deterministic.requiresAI || options.deterministicOnly) {
      report.result = 'REVIEW';
      report.explanation = `Deterministic ${deterministic.requiresAI ? 'suspicion (semantic judgment skipped)' : 'conflict'}: ${deterministic.signals.map((s) => s.explanation).join(' ')}`;
    } else {
      stage = 'model';
      const provider =
        options.provider ||
        (config.provider === 'mock'
          ? new MockProvider()
          : config.provider === 'openai' &&
              process.env.OPENAI_API_KEY &&
              config.model
            ? new OpenAIProvider(
                config.model,
                process.env.OPENAI_API_KEY,
                config.timeoutMs,
              )
            : undefined);
      if (!provider) {
        report.result = 'INCONCLUSIVE';
        report.source = 'unavailable';
        report.explanation =
          'Deterministic suspicion requires semantic evaluation. Configure a provider, OPENAI_API_KEY and model, or explicitly use --deterministic-only / --provider mock.';
      } else {
        report.source = provider.name;
        report.model = provider.model;
        const input = { contract, evidence, deterministic };
        const imageHash = createHash('sha256')
          .update(await readFile(evidence.screenshotPath))
          .digest('hex');
        const key = createHash('sha256')
          .update(
            JSON.stringify({
              input: modelEvidence(input),
              imageHash,
              provider: provider.name,
              model: provider.model,
              promptVersion: PROMPT_VERSION,
            }),
          )
          .digest('hex');
        const cachePath = resolve(config.outputDir, 'cache', `${key}.json`);
        let outcome: EvaluationOutcome | undefined;
        if (config.cache)
          try {
            const cached = JSON.parse(
              await readFile(cachePath, 'utf8'),
            ) as EvaluationOutcome;
            const intent = IntentEvaluationSchema.parse(cached.intent),
              visual = VisualEvaluationSchema.parse(cached.visual);
            const ids = new Set(evidence.elements.map((e) => e.id));
            if (
              intent.contractId === contract.id &&
              intent.confidence >= 0.65 &&
              intent.result !== 'INCONCLUSIVE' &&
              (intent.result !== 'REVIEW' ||
                intent.evidenceIds.some((id) =>
                  evidence!.elements.some((e) => e.id === id && e.visible),
                )) &&
              [
                ...intent.evidenceIds,
                ...visual.ranking.map((r) => r.evidenceId),
                ...visual.observations.flatMap((o) => o.evidenceIds),
              ].every((id) => ids.has(id))
            ) {
              outcome = { intent, visual, calls: 0 };
              report.cacheHit = true;
            }
          } catch {
            /* A missing or invalid cache entry is evaluated again. */
          }
        if (!outcome) {
          outcome = await evaluateWithRetry(provider, input, config.timeoutMs);
          if (
            config.cache &&
            outcome.intent.result !== 'INCONCLUSIVE' &&
            outcome.visual
          ) {
            await mkdir(resolve(config.outputDir, 'cache'), {
              recursive: true,
            });
            await writeFile(cachePath, JSON.stringify(outcome));
          }
        }
        report.aiCalls = outcome.calls;
        report.intent = outcome.intent;
        report.visual = outcome.visual;
        report.result = outcome.intent.result;
        report.explanation = outcome.intent.explanation;
        report.evidenceIds = [
          ...new Set([...report.evidenceIds, ...outcome.intent.evidenceIds]),
        ];
        // A model cannot override a definitive missing/disabled/offscreen-action fact.
        if (deterministic.signals.some((s) => s.definitive)) {
          report.result = 'REVIEW';
          report.explanation = `${deterministic.signals
            .filter((s) => s.definitive)
            .map((s) => s.explanation)
            .join(' ')} ${report.explanation}`;
        }
        if (outcome.visual)
          await writeFile(
            join(artifactDir, 'visual-result.json'),
            JSON.stringify(outcome.visual, null, 2),
          );
        await writeFile(
          join(artifactDir, 'intent-result.json'),
          JSON.stringify(outcome.intent, null, 2),
        );
        if (options.debug)
          await writeFile(
            join(artifactDir, 'model-input.json'),
            JSON.stringify(
              {
                visualStage: {
                  instructions: VISUAL_PROMPT,
                  input: modelEvidence(input),
                },
                intentStage: {
                  instructions: INTENT_PROMPT,
                  input: { ...modelEvidence(input), visual: outcome.visual },
                },
                screenshot: 'screenshot.png',
                imageHash,
                model: provider.model,
                promptVersion: PROMPT_VERSION,
              },
              null,
              2,
            ),
          );
        log('intent_evaluation', {
          model: provider.model,
          promptVersion: PROMPT_VERSION,
          result: report.result,
          calls: report.aiCalls,
          cacheHit: report.cacheHit,
        });
      }
    }
    if (
      !deterministic.incomplete &&
      deterministic.signals.some((s) => s.definitive) &&
      report.result !== 'REVIEW'
    ) {
      report.result = 'REVIEW';
      report.explanation = `Deterministic action conflict: ${deterministic.signals
        .filter((s) => s.definitive)
        .map((s) => s.explanation)
        .join(' ')} ${report.explanation}`;
    }
  } catch (error) {
    report.result = 'ERROR';
    report.errorKind =
      error instanceof IntentGuardError
        ? error.kind
        : stage === 'evidence'
          ? 'EVIDENCE_ERROR'
          : stage === 'model'
            ? 'MODEL_ERROR'
            : 'EXECUTION_ERROR';
    // Browser/API exception strings can include URLs or page content. Persist only classified errors.
    report.explanation = `${report.errorKind}: ${error instanceof IntentGuardError ? error.message : `Failure during ${stage}. Check browser installation, selectors, configuration and page availability.`}`;
  } finally {
    await context?.close();
    if (!options.browser) await browser?.close();
  }
  report.latencyMs = Math.round(performance.now() - start);
  log('complete', { result: report.result, latencyMs: report.latencyMs });
  await writeFile(
    join(artifactDir, 'events.jsonl'),
    events.map((e) => JSON.stringify(e)).join('\n') + '\n',
  );
  await writeReport(report, evidence);
  return report;
}
