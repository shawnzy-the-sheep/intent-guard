# ux-guard-pipeline

A CLI for checking UI hierarchy, status ownership, and primary actions with Playwright and an optional AI review step.

The included demo is a task details page. One layout puts the current task first. Another gives the parent job's status a large banner above it. The data and buttons are the same, but the page draws attention to a different object.

A YAML contract describes which entity and action should take priority. The pipeline captures the page, measures relevant elements, and checks those expectations. If the rules find a possible issue, an AI provider can review the screenshot and collected evidence. Reports include element IDs and annotated screenshots so you can inspect the finding.

## Setup

Requires Node.js 24+ and pnpm 11.25.0.

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm build
pnpm demo:start
```

Open [the demo](http://127.0.0.1:5173/demo/good). It has four layouts: good, hierarchy regression, ownership ambiguity, and action regression.

Run these commands in another terminal:

```sh
pnpm ux-guard-pipeline test task-details
pnpm ux-guard-pipeline test task-details --route /demo/hierarchy --provider mock
pnpm ux-guard-pipeline test task-details --route /demo/ownership --provider mock
pnpm ux-guard-pipeline test task-details --route /demo/action --deterministic-only
```

The good layout returns PASS. The other layouts return REVIEW with these options. The mock provider uses the rule results to exercise the pipeline; it does not make an independent AI judgment.

If Chromium cannot be downloaded, use an installed Chrome browser:

```sh
UX_GUARD_PIPELINE_BROWSER_CHANNEL=chrome pnpm ux-guard-pipeline test task-details
```

## Check your own application

Edit `ux-guard-pipeline.config.ts` to set your application's URL and contract paths. Update `intent/task-details.yaml` with selectors for your page.

Each contract declares entities, actions, and expectations. For example:

```yaml
entities:
  current_task:
    priority: primary
    selectors: ["[data-entity='task']"]
  parent_job:
    priority: contextual
    selectors: ["[data-entity='parent-job']"]
intents:
  - id: task-primary-focus
    type: hierarchy
    subject: current_task
    relativeTo: parent_job
    expectation: dominant
```

This is part of a contract; see [the sample](intent/task-details.yaml) for the complete format. The three supported checks are:

- **Hierarchy:** compare the prominence of two declared entities.
- **Ownership:** check whether contextual status text could be associated with the primary entity.
- **Action discoverability:** check whether the declared action is visible, available, and prominent among content actions.

For a new project, the built CLI's `init` command creates a starter config and contract. It refuses to overwrite existing files.

```sh
pnpm ux-guard-pipeline test                     # all contracts and viewports
pnpm ux-guard-pipeline test task-details --json # JSON results
pnpm ux-guard-pipeline test --deterministic-only
pnpm ux-guard-pipeline test --debug --no-cache
```

## Results

| Result       | Meaning                                                                  |
| ------------ | ------------------------------------------------------------------------ |
| PASS         | The checks found no relevant issue.                                      |
| REVIEW       | The rules or model found a possible contract conflict.                   |
| INCONCLUSIVE | Missing evidence or an unavailable/uncertain model prevented a decision. |
| ERROR        | A configuration, browser, or other execution step failed.                |

Only ERROR exits with code `1`. REVIEW and INCONCLUSIVE do not fail CI. Accessibility results come from axe-core and are reported separately.

Reports are saved under `.ux-guard-pipeline/runs/`. Each run includes screenshots, collected evidence, rule results, Markdown and JSON reports, and stage logs. Model results are saved when a provider runs. `--debug` also saves the model inputs after redaction.

## OpenAI review

The default provider is `none`. Use `--provider openai` to enable live evaluation:

```sh
export OPENAI_API_KEY='your-key'
export UX_GUARD_PIPELINE_MODEL='your-supported-multimodal-model'
pnpm ux-guard-pipeline test task-details --route /demo/hierarchy --provider openai
```

The model must support images and structured outputs. The adapter uses the [Responses API](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses) with `store: false`. It checks returned schemas, contract IDs, and evidence references. Failed or invalid responses get one retry, then return INCONCLUSIVE. Low-confidence responses also return INCONCLUSIVE.

The test suite uses mocked responses. Live-model accuracy has not been measured.

## Private data

The collector masks `[data-sensitive]`, password and hidden inputs, and `.customer-email` before capture. Add selectors for other private content through the config's `redact` option. Common email addresses and credential patterns are also scrubbed.

Cookies, storage, input values, request headers, and the full DOM are not collected for the model. Images, canvas content, and application-specific private data need explicit masks. Check the saved screenshots and debug inputs before using a live provider with private pages.

## Tests and benchmark

```sh
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm bench
```

The browser tests cover collection, redaction, reports, caching, CLI results, and the demo's buttons. Use `UX_GUARD_PIPELINE_BROWSER_CHANNEL=chrome` for these commands if you use installed Chrome instead of bundled Chromium.

UXBench contains 20 synthetic good/bad pairs. `pnpm bench` runs all 40 states with the mock provider and saves metrics to `.ux-guard-pipeline/benchmark/summary.json`. Set `UX_GUARD_PIPELINE_BENCH_PROVIDER=openai` to evaluate them with a live model. The expected labels were written with the fixtures; they have not had independent human review. Mock benchmark results check pipeline behavior, not AI accuracy.

## Current scope

Version 0.1 includes the three checks, CLI, demo, reports, caching, multiple viewport support, and a GitHub Actions workflow. Diff-based execution, interaction-cost checks, comparisons across UI states, authenticated role fixtures, and a GitHub App are still pending.

More detail: [architecture](docs/architecture/pipeline.md), [contract format](docs/contracts/v1.md), [implementation status](docs/implementation-status.md), [evaluation notes](docs/evaluation/README.md), and [local verification](docs/verification.md).
