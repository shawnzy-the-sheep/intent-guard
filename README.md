# IntentGuard

**CI for UX intent.** Your interface can work correctly and still communicate the wrong hierarchy, ownership, or next action.

IntentGuard turns explicit UX Contracts into evidence-backed review signals. Playwright captures selected elements and masked screenshots; deterministic rules filter suspicious states; an optional structured model evaluator interprets ambiguous evidence. AI findings remain non-blocking.

## Run the demo

Requires Node.js 24+ and pnpm 11.25.0.

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm build
pnpm demo:start
```

In another terminal:

```sh
pnpm intentguard test task-details
# PASS; no AI calls
pnpm intentguard test task-details --route /demo/hierarchy --provider mock --debug
# REVIEW; explicitly labelled offline mock
pnpm intentguard test task-details --route /demo/ownership --provider mock
pnpm intentguard test task-details --route /demo/action --deterministic-only
```

Open [the good demo](http://127.0.0.1:5173/demo/good), [hierarchy regression](http://127.0.0.1:5173/demo/hierarchy), [ownership ambiguity](http://127.0.0.1:5173/demo/ownership), or [action regression](http://127.0.0.1:5173/demo/action). The task data and functional actions are identical across these four pages.

If browser downloads are unavailable and Chrome is already installed, prefix commands with `INTENTGUARD_BROWSER_CHANNEL=chrome`. This starts an isolated headless context; it does not access a personal browser profile.

## Evaluate your application

Run `pnpm intentguard init` in a new directory to create a starter config and contract. The command refuses to overwrite files. In this workspace, edit `intentguard.config.ts` and `intent/task-details.yaml` directly. Contracts use YAML and reference entities/actions by selectors:

```yaml
intents:
  - id: task-primary-focus
    type: hierarchy
    subject: current_task
    relativeTo: parent_job
    expectation: dominant
```

Declare meaning, rather than exact colors or pixels. Supported v1 intents are `hierarchy` (`dominant` / `subordinate`), `semantic_ownership` (`contextual`), and `action_discoverability` (`immediate` / `discoverable`). Contract subjects and hierarchy references must exist; IDs must be unique. The schema rejects unknown fields and versions.

Configuration supports contract globs, base URL, output directory, multiple viewport sizes, a ready selector, redaction selectors, provider/model, timeouts, hierarchy threshold, and caching. A run waits for `readySelector` when configured; use it to identify an application state that is ready for inspection. Routes must remain on the configured origin. Configuration files are trusted executable local code.

```sh
pnpm intentguard test                      # all configured contracts/viewports
pnpm intentguard test task-details --json  # machine-readable result array
pnpm intentguard test --deterministic-only # no provider calls
pnpm intentguard test --debug --no-cache   # sanitised model inputs, fresh evaluation
```

Exit code `1` indicates technical/configuration failure. PASS, REVIEW and INCONCLUSIVE exit `0`; semantic findings do not block CI. Accessibility violations are reported separately and are not silently converted into semantic findings.

## Live model evaluation

The default provider is `none`. Suspicious semantic evidence returns INCONCLUSIVE until you explicitly choose deterministic-only mode, a mock, or a live provider. The offline mock echoes heuristic signals to test the pipeline; it is not an independent UX judge.

```sh
export OPENAI_API_KEY='your-key'
export INTENTGUARD_MODEL='your-supported-multimodal-model'
pnpm intentguard test task-details --route /demo/hierarchy --provider openai --debug
```

The OpenAI adapter uses the [Responses API and structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses), with `store: false`, a screenshot plus selected evidence for the visual stage, and contract/evidence/visual result for the intent judge. A model must support images and structured outputs. Outputs are validated against Zod schemas, the contract ID, and captured evidence IDs. Each stage retries once; malformed output, timeout, refusals or low confidence produce INCONCLUSIVE. Definitive action availability facts cannot be overridden by a model PASS.

No live model requests were required for the local test suite. Live-model precision and independent human agreement must be measured before trusting semantic review in production.

## Artifacts and privacy

Each run writes `.intentguard/runs/<run-id>-<contract>-<viewport>/`:

- `screenshot.png`, `annotated.png`: masked screenshot and evidence boxes.
- `page-evidence.json`, `deterministic.json`: selected DOM geometry, styles, containment, action ranks, axe summary.
- `visual-result.json`, `intent-result.json`: when an evaluator runs.
- `model-input.json`: sanitised input projection in debug mode, without credentials or image base64.
- `report.json`, `report.md`, `events.jsonl`: result, human-readable evidence, structured stage logs.

The CLI also writes `summary.json` and `summary.md`, and appends a GitHub Actions job summary when available. Evaluations cache by contract, normalised evidence, screenshot hash, provider/model, and prompt version. Invalid or inconclusive output is never cached as a PASS.

Always add selectors for application-specific private content. `[data-sensitive]`, password/hidden inputs and `.customer-email` are masked before capture; matching descendants are excluded from evidence. Obvious email addresses and credential-like text are scrubbed. Cookies, storage, input values, headers and full DOM are never collected for the evaluator. Automatic scrubbing cannot identify every kind of private content, images or canvas content: use explicit redaction selectors and audit debug artifacts before enabling a live provider. Browser traces are deliberately omitted because Playwright network/snapshot traces can preserve credentials; `events.jsonl` supplies safe stage diagnostics.

## Verification

```sh
pnpm build
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm bench
```

Integration tests exercise real browser extraction and redaction. E2E runs the React demo through the built CLI, checks all four expected outcomes, cache reuse, artifacts, technical error exits and identical Continue Task behavior. Normal CI never calls a live model.

UXBench contains 20 paired synthetic cases across hierarchy, ambiguity and action discoverability (40 rendered states). `pnpm bench` defaults to mock and writes `.intentguard/benchmark/summary.json`; choose `INTENTGUARD_BENCH_PROVIDER=openai` and credentials to run an actual model benchmark. Results include precision, recall, F1, false positive rate, coverage, AI calls and latency. Undecided cases remain visible. Cost and human agreement stay null until measured; synthetic mock scores do not establish real-world AI accuracy.

## Implementation boundary

This implements the project plan's v0.1 CLI scope, with caching, viewport support, synthetic UXBench and GitHub Actions as reliability scaffolding. See [implementation status](docs/implementation-status.md), [architecture](docs/architecture/pipeline.md), [contract reference](docs/contracts/v1.md), [decisions](docs/decisions/README.md), and [evaluation methodology](docs/evaluation/README.md).

The [local verification record](docs/verification.md) documents the executed checks and remaining validation limits.

Later roadmap items remain explicit future work: Git diff mapping, interaction-cost baselines, cross-state comparison, role-specific fixtures, independent human labels, GitHub App, SaaS/auth/billing, persistent analytics, and additional model adapters. The plan explicitly excludes SaaS infrastructure from the first implementation slice.
