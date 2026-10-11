# Local verification — 11 October 2026

Verified with Node.js 24.11.0, pnpm 11.25.0 and Playwright 1.64.0. Browser tests used the installed Chrome channel in isolated headless contexts because downloading bundled Chromium timed out in this environment. The GitHub Actions workflow uses bundled Chromium; it has not yet run on a hosted repository.

| Check                                                 | Result                                                       |
| ----------------------------------------------------- | ------------------------------------------------------------ |
| Build (TypeScript packages + Vite production demo)    | Passed                                                       |
| Type checking, ESLint, Prettier, Git whitespace check | Passed                                                       |
| Unit/evaluator protocol tests                         | 12 passed                                                    |
| Browser integration tests                             | 4 passed                                                     |
| CLI init and overwrite protection                     | Passed                                                       |
| Built CLI/demo E2E                                    | Passed                                                       |
| Good demo                                             | PASS, zero model calls                                       |
| Hierarchy demo                                        | REVIEW, hierarchy signal; primary action remains visible     |
| Ownership demo                                        | REVIEW, evidence of mixed entity containment                 |
| Action demo                                           | REVIEW, demoted primary action                               |
| Demo accessibility                                    | All four variants have zero axe-core violations              |
| Functional Continue Task action                       | Passed in all four variants                                  |
| Cache reuse                                           | Repeated hierarchy evaluation has zero additional calls      |
| Provider absent / deterministic-only                  | INCONCLUSIVE / deterministic REVIEW respectively             |
| Technical execution failure exit                      | Exit 1                                                       |
| UXBench                                               | All 40 states match authored expectations with mock provider |

The synthetic mock benchmark had 20 TP, 20 TN, zero FP/FN, zero undecided states, and 0.75 mock provider calls per state. This is pipeline validation, not a measurement of live AI accuracy. No independent human labels, real model calibration, billed cost measurements or remote CI execution are claimed.

Reproduce browser tests with `INTENTGUARD_BROWSER_CHANNEL=chrome pnpm test:integration`, `INTENTGUARD_BROWSER_CHANNEL=chrome pnpm test:e2e`, and `INTENTGUARD_BROWSER_CHANNEL=chrome pnpm bench`; omit the environment variable when bundled Chromium is installed. The E2E server selects its own available local port and can run alongside the interactive demo.
