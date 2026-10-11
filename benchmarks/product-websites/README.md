# Apple, ClickUp and Notion validation

The public suite contains ten cases across Apple's home and Mac pages, ClickUp's homepage, and Notion's homepage. There are five unmodified baselines and five controlled regressions. All ten matched their authored expectations after two collector fixes. Six additional checks captured signed-in ClickUp and Notion pages from the user's existing browser; those are a separate, narrower evaluation.

Recorded on 11 October 2026, about 10:42 PM Malaysia time. No live model or mock provider was invoked. Labels were written before evaluation and have not had independent human review.

## Public pages

```sh
pnpm build
UX_GUARD_PIPELINE_BROWSER_CHANNEL=chrome pnpm validate:products
```

Use `pnpm validate:products` without the environment variable if bundled Chromium is installed. This command uses the full existing pipeline: browser navigation, masking, screenshot, DOM evidence, axe, normalization, deterministic rules, and reports. It uses a 1280 × 800 viewport and disables caching. Each regression changes only the isolated browser's DOM; it does not submit a form, buy a product, or create an account.

| Page and contract                            | Baseline | Control | Control change                          |
| -------------------------------------------- | -------- | ------- | --------------------------------------- |
| Apple homepage: featured product Learn more  | PASS     | REVIEW  | Hide the selected link                  |
| Apple homepage: product heading over tagline | PASS     | REVIEW  | Enlarge the tagline into a fixed banner |
| Apple Mac page: navigation search            | PASS     | REVIEW  | Move search below the viewport          |
| ClickUp homepage: Get started                | PASS     | REVIEW  | Disable the button                      |
| Notion homepage: Get Notion free             | PASS     | REVIEW  | Hide the selected link                  |

[cases.json](cases.json) declares the goals, selectors, controls, and expectations. [results.json](results.json) contains actual outcomes, timestamps, evidence IDs, selector counts, and repository-relative artifact paths. All final selectors resolved to exactly one element. Full screenshots and reports are under `.ux-guard-pipeline/product-websites/runs/`, ignored by Git; rerun to regenerate them. A regression YAML by itself navigates to the original page; the suite runner applies its control.

The Apple contract names the product visible at capture time. Product names, homepage variants, selectors, and network availability can change, so this suite is a network validation command rather than an offline CI test.

## What the tests found

Hidden navigation links could consume the collector's 400-element limit. The collector now excludes invisible elements that are not explicitly named in a contract. It retains hidden contract subjects, allowing a hidden primary action to produce REVIEW. Pages with more than 400 eligible elements still return INCONCLUSIVE.

Apple's transparent, empty, aria-hidden card link intercepted the hit test above painted text. The collector treated the heading and enlarged tagline as obscured, assigning both zero salience and missing the hierarchy control. It now distinguishes this transparent decorative link from an obstruction to non-interactive text. Hit-test obstructions still apply to interactive actions; opaque overlays still obscure text. Browser regression tests cover both fixes.

[pre-fix-hierarchy-result.json](pre-fix-hierarchy-result.json) records the missed control. [initial-results.json](initial-results.json) preserves the earlier diagnostic run with selectors that failed to bind and evidence truncation. Those initial selectors were corrected against the observed DOM before the final run.

## Signed-in pages

The user supplied a ClickUp list and a Notion knowledge dashboard, then requested other pages from those apps. The checks navigated within that workspace to these views and restored both original tabs afterward:

| App     | Page                       | Contract                         | Result | Collected elements |
| ------- | -------------------------- | -------------------------------- | ------ | ------------------ |
| ClickUp | List                       | Task-search control is available | PASS   | 214                |
| ClickUp | Board                      | Task-search control is available | PASS   | 168                |
| ClickUp | Calendar                   | Task-search control is available | PASS   | 114                |
| Notion  | Knowledge dashboard        | Workspace search is available    | PASS   | 270                |
| Notion  | Books database             | Workspace search is available    | PASS   | 163                |
| Notion  | Learning Progress database | Workspace search is available    | PASS   | 161                |

These used the existing signed-in Chrome tabs at their actual 2056 × 1060 viewport. Authentication cookies, storage, and input values were not exported. Workspace data was not edited. Captures, contracts, screenshots, and detailed reports remain under `.ux-guard-pipeline/authenticated/<case-id>/`, excluded from Git. Only [this summary](authenticated-results.json), without private URLs or workspace content, is committed.

The browser extension exposes read-only DOM evaluation and viewport screenshots. It cannot run the complete Playwright collector's masking or axe scan. These six results therefore validate the shared DOM projection, salience normalization, rules, and reporter on authenticated screens. They are not full Playwright runs or independent semantic assessments. Private screenshots are not masked and stay local; no model receives them.

For another capture, select a tab through the documented Codex browser REPL, define a contract for its observed controls, and import `scripts/capture-live-tab.mjs`. Call `captureLiveTab(tab, contract)` from that REPL. It uses the same read-only projection as the Playwright collector. Evaluate the resulting local capture with:

```sh
node scripts/evaluate-live-capture.mjs .ux-guard-pipeline/authenticated/<case-id>
```

PASS means the specific search control was visible, interactive, unobscured, and enabled in the captured viewport. It does not verify search results, editing flows, status ownership, or the app's overall UX. The positive-only signed-in checks do not measure false-negative rates. Live-model accuracy, mobile behavior, and semantic ownership remain unvalidated by this set.

## Sources

- [Apple homepage](https://www.apple.com/) and [Mac category](https://www.apple.com/mac/)
- [ClickUp homepage](https://clickup.com/)
- [Notion homepage](https://www.notion.com/)

Private source pages are recorded only in local captures. Controlled changes are test fixtures, not observed defects in Apple, ClickUp, or Notion.
