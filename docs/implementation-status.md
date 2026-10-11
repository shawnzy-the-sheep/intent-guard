# Engineering plan implementation status

The source plan defines a v0.1 CLI release and a longer roadmap. This repository delivers the three-category first slice and selected reliability scaffolding.

| Plan capability                                                | Status                                                         |
| -------------------------------------------------------------- | -------------------------------------------------------------- |
| pnpm/TypeScript monorepo, nine packages                        | Implemented                                                    |
| React/Vite good/bad canonical task demo                        | Implemented, four variants, identical data/actions             |
| YAML UX Contract v1, Zod validation                            | Implemented with reference and duplicate checks                |
| Chromium evidence, geometry/styles, selected semantic elements | Implemented                                                    |
| Compact feature normalisation/salience                         | Implemented, provisional weights                               |
| Hierarchy, ownership, primary-action rules                     | Implemented                                                    |
| axe-core summary                                               | Implemented, separately reported                               |
| Accessibility role/label/heading projection                    | Implemented; full native tree deferred                         |
| OpenAI structured visual + intent adapter                      | Implemented; protocol tested with stubbed transport            |
| Live AI calibration                                            | Pending credentials and independent validation                 |
| Mock provider, retries/timeouts/INCONCLUSIVE                   | Implemented                                                    |
| init/test/filter/debug/deterministic-only CLI                  | Implemented                                                    |
| Annotated evidence, Markdown/JSON/console, stage logs          | Implemented                                                    |
| Browser traces                                                 | Deliberately deferred: raw traces can retain secrets           |
| Evidence/model/prompt/screenshot cache                         | Implemented                                                    |
| Multiple viewport configuration                                | Implemented                                                    |
| UXBench 20 pairs, metrics runner                               | Implemented synthetic fixtures; human labels pending           |
| GitHub Actions, artifact upload, job summary                   | Implemented workflow; remote CI run pending repository hosting |
| Diff-aware contract mapping                                    | Later (v0.2)                                                   |
| Interaction cost / cross-state baselines                       | Later (v0.5)                                                   |
| Role fixtures / authenticated scenarios                        | Later roadmap                                                  |
| Anthropic/Gemini/local adapters                                | Provider interface ready; adapters later                       |
| GitHub App, SaaS, auth, billing, dashboard                     | Explicitly excluded from v0.1                                  |

See README for reproducible commands and `docs/evaluation/README.md` for the limits of synthetic mock metrics. The PDF's illustrative precision figures and schedules are planning examples, not existing benchmark evidence.
