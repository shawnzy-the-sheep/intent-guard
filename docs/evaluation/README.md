# Evaluation methodology

UXBench's 20 pairs are deliberately synthetic. Their `expected.json` files identify authored expectations and leave independentHumanLabel null. The mock adapter converts suspicion signals into review fixtures; it does not provide independent semantic reasoning. A perfect mock score demonstrates pipeline consistency only.

Metrics retain every rendered state. Precision = TP/(TP+FP); recall = TP/all positive-labelled states (including undecided positives); false positive rate = FP/all negative-labelled states. F1 combines precision/recall. Coverage measures decided states. INCONCLUSIVE/ERROR are reported separately instead of silently discarded. Average AI calls counts both model stages and retries. Cache is disabled in the benchmark. Cost and human agreement remain null until there is trustworthy usage/pricing and independent human label data.

Before a release claims model quality, collect blinded labels from multiple reviewers, include legitimate redesigns as negative controls, reserve a held-out set, measure disagreement, run repeated live evaluations, report per-category confidence and false positives, and calibrate the heuristics without tuning to the held-out cases. Optimise precision first. The plan's >=80% early target is a target, not a measured product claim.

Prompts live in `packages/evaluator/src/prompts.ts` and include an explicit version exported as PROMPT_VERSION. Any prompt/model/feature change must rerun unit, evaluator protocol, browser, E2E and UXBench checks. Update the prompt version whenever its instructions change so cached results cannot mask behavior changes.
