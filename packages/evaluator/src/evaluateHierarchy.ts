import {
  VisualEvaluationSchema,
  IntentEvaluationSchema,
  type IntentEvaluation,
  type VisualEvaluation,
} from './schema.js';
import type { ModelProvider, EvaluationInput } from './provider.js';
export interface EvaluationOutcome {
  visual?: VisualEvaluation;
  intent: IntentEvaluation;
  calls: number;
}
export async function evaluateWithRetry(
  provider: ModelProvider,
  input: EvaluationInput,
  timeoutMs = 30000,
): Promise<EvaluationOutcome> {
  let calls = 0;
  const ids = new Set(input.evidence.elements.map((e) => e.id));
  const visible = new Set(
    input.evidence.elements.filter((e) => e.visible).map((e) => e.id),
  );
  const cited = (references: string[]) => {
    if (references.some((id) => !ids.has(id)))
      throw new Error('Unknown evidence IDs');
  };
  const bounded = async <T>(run: () => Promise<T>): Promise<T> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        run(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error('Evaluation timed out')),
            timeoutMs,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  };
  let visual: VisualEvaluation | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      calls++;
      visual = VisualEvaluationSchema.parse(
        await bounded(() => provider.evaluateVisualHierarchy(input)),
      );
      cited([
        ...visual.ranking.map((r) => r.evidenceId),
        ...visual.observations.flatMap((o) => o.evidenceIds),
      ]);
      break;
    } catch {
      visual = undefined;
    }
  }
  if (visual)
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        calls++;
        const intent = IntentEvaluationSchema.parse(
          await bounded(() =>
            provider.evaluateIntent({ ...input, visual: visual! }),
          ),
        );
        if (intent.contractId !== input.contract.id)
          throw new Error('Contract ID mismatch');
        cited(intent.evidenceIds);
        if (
          intent.result === 'REVIEW' &&
          !intent.evidenceIds.some((id) => visible.has(id))
        )
          throw new Error('REVIEW has no visible evidence');
        if (intent.confidence < 0.65 && intent.result !== 'INCONCLUSIVE')
          return {
            visual,
            calls,
            intent: {
              ...intent,
              result: 'INCONCLUSIVE',
              severity: null,
              uncertainty: 'Confidence below 0.65 review threshold.',
            },
          };
        return { visual, intent, calls };
      } catch {
        /* retry once; never convert failure to PASS */
      }
    }
  return {
    visual,
    calls,
    intent: {
      result: 'INCONCLUSIVE',
      severity: null,
      confidence: 0,
      contractId: input.contract.id,
      explanation:
        'The evaluator timed out, failed, or returned unsupported structured evidence after one retry.',
      evidenceIds: [],
      uncertainty: 'Model unavailable or output invalid.',
    },
  };
}
