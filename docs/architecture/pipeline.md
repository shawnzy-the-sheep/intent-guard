# Evidence pipeline

CLI → trusted configuration → validated contract registry → isolated Playwright context → navigation/readiness → privacy mask → screenshot and selected evidence → normalisation → deterministic rules → optional visual evaluator → optional intent judge → evidence-backed reports.

## Package boundaries

| Package    | Responsibility                                                      |
| ---------- | ------------------------------------------------------------------- |
| shared     | result/error types, text/URL sanitisation                           |
| contracts  | strict Zod v1 schema, YAML loading, reference validation            |
| playwright | browser lifecycle adapter, masked collection, axe summary           |
| evidence   | browser evidence types, compact features and salience               |
| rules      | hierarchy, ownership grouping/proximity, content action ranking     |
| evaluator  | provider interface, OpenAI/mock adapters, validated bounded retries |
| core       | configuration and scenario orchestration, cache, stage logs         |
| reporter   | console/Markdown/JSON, annotated screenshots                        |
| cli        | argument parsing, registry iteration, CI summary and exit policy    |

Every contract/viewport gets a new context. The CLI shares one browser process but never context state. Selectors union their matches; evidence IDs represent captured DOM nodes and are unique within a run. Selected semantic elements and all contract matches are collected, capped at 400 elements. Missing/masked contract targets or truncation produce INCONCLUSIVE. Hidden targets that are actually captured are distinguishable from missing targets.

The salience engine uses the plan's provisional weights: area .25, top position .20, typography .20, contrast .15, width .10, persistent positioning .10. Area saturates at 25% of viewport coverage. Transparent backgrounds resolve through ancestor styles. Contrast is an approximate luminance feature, not an accessibility verdict. Hidden or occluded elements have zero salience. The hierarchy suspicion ratio defaults to 1.15 and is configurable.

Actions rank within the main content landmark when available; global navigation remains in evidence but does not compete with the task action. An immediate primary action outside the top two raises suspicion. Offscreen, disabled, hidden or obscured actions produce deterministic review facts. Semantic ownership considers entity containment, status nodes, label distance and proximity to primary headings. These are heuristics; non-suspicious output is a scoped deterministic PASS rather than proof of perfect UX.

Only suspicious ambiguous evidence invokes a provider. Each stage has a timeout and at most two attempts. Invalid citations, wrong contract IDs and low-confidence judgments cannot PASS. Screenshot, compact input, model and prompt identity define the cache key. Artifact paths, timestamps and run IDs are excluded from model inputs and cache identity.

The current accessibility representation is a selected role/label/heading projection plus axe-core summary, rather than a full browser accessibility tree. This preserves the compact privacy boundary. Auth fixtures, SPA interaction scenarios and traces require a separate future design.
