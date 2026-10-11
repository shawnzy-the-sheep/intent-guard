# Public website validation

Ten cases run against five public websites: Wikipedia, GOV.UK, Python.org, GitHub, and Firefox. Each page has an unmodified baseline and a controlled regression applied in an isolated browser. The changes affect only the local browser DOM. No buttons are clicked, forms submitted, downloads started, or accounts used.

The contracts and expected outcomes are in [cases.json](cases.json). Expectations were written before execution. These are checks against specific user goals, not ratings of the websites' overall design.

## Run

```sh
pnpm build
pnpm validate:websites
# Or use installed Chrome:
UX_GUARD_PIPELINE_BROWSER_CHANNEL=chrome pnpm validate:websites
```

The command runs the existing `runContract` pipeline, including screenshots, geometry, selector bindings, axe, normalization, rules, and reports. It uses `deterministicOnly: true`, provider `none`, cache disabled, and a 1280 × 800 viewport. A browser wrapper waits for the load event (up to 10 seconds) and another 1.5 seconds before applying controls. It records missing stylesheet objects, load timeouts, selector counts, collection truncation, and mutation application.

Hierarchy REVIEW means a heuristic suspicion with semantic judgment skipped. No live model or mock provider is invoked. Action contracts use `discoverable` because search need not outrank every other visible action.

The runner writes ten YAML contracts and [results.json](results.json). Full screenshots, evidence JSON, deterministic findings, stage logs, and Markdown reports go into `.ux-guard-pipeline/public-websites/runs/`; the result rows contain repository-relative artifact paths. Those large artifacts are ignored by Git. Rerun the command to regenerate them on another checkout. Baseline and regression contracts share a source URL; the runner applies the listed mutation, so invoking a regression YAML alone does **not** reproduce its control.

The process exits with code 1 for unexpected outcomes, selector counts other than one, or an unapplied regression. Public pages can change, fail to load assets, or alter their selectors. This is an explicit network validation command, separate from the offline unit tests and CI.

## Recorded run

Captured on 11 October 2026, about 10:09 PM Malaysia time, using installed headless Chrome.

| Case                       | Expected | Actual       | Change                                                    |
| -------------------------- | -------- | ------------ | --------------------------------------------------------- |
| Wikipedia search baseline  | PASS     | PASS         | None                                                      |
| Wikipedia search control   | REVIEW   | REVIEW       | Hide submit button                                        |
| GOV.UK search baseline     | PASS     | PASS         | None; initial cookie banner retained                      |
| GOV.UK search control      | REVIEW   | REVIEW       | Move submit button below the viewport                     |
| Python.org search baseline | PASS     | PASS         | None                                                      |
| Python.org search control  | REVIEW   | REVIEW       | Disable the GO button                                     |
| GitHub repository baseline | PASS     | INCONCLUSIVE | None                                                      |
| GitHub repository control  | REVIEW   | INCONCLUSIVE | Promote the About heading into a fixed banner             |
| Firefox heading baseline   | PASS     | PASS         | None                                                      |
| Firefox heading control    | REVIEW   | REVIEW       | Promote the introductory eyebrow text into a fixed banner |

Eight of ten cases matched the authored expectation. Four controls were detected and four baselines passed. Two cases were inconclusive; there were no execution errors. There were no false-positive suspicions or misses among the eight cases with decisions. Those counts are too small and selective to establish general accuracy.

Both GitHub captures reached the collector's 400-element cap and reported truncated evidence. Fourteen of 45 stylesheet links also lacked a stylesheet object after loading. These runs cannot establish whether the hierarchy check works on that page. Increasing the cap alone would need an evaluation of model input size and evidence quality; this validation does not change the collector's safety behavior.

[initial-results.json](initial-results.json) preserves the diagnostic first pass. It had overly broad contextual selectors: six GitHub headings and thirteen Firefox paragraphs. Its GitHub baseline screenshot was partially unstyled and returned a hierarchy suspicion, while the control was inconclusive. The final contracts narrow each context to one element. First-pass results should not be treated as valid accuracy measurements.

## What this establishes

The pipeline collects evidence from public pages and catches hidden, offscreen, and disabled actions, plus a controlled visual hierarchy reversal. Reports identify the relevant elements and retain the supporting captures. Large pages and unreliable external assets remain practical limitations.

This set does not validate semantic ownership, live-model judgment, mobile layouts, authenticated screens, or interactions after navigation. Ownership is covered by the existing synthetic benchmark, not by these public-page cases. The authored labels have not had independent human review. A PASS only means the selected contract found no suspicion.

## Sources

- [Wikipedia landing page](https://www.wikipedia.org/)
- [GOV.UK homepage](https://www.gov.uk/)
- [Python.org homepage](https://www.python.org/)
- [VS Code repository on GitHub](https://github.com/microsoft/vscode)
- [Firefox homepage](https://www.firefox.com/en-US/)

These pages were researched and captured directly. Controlled regressions are test changes, not defects observed on the source websites.
