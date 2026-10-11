import { z } from 'zod';
export const VisualEvaluationSchema = z
  .object({
    ranking: z.array(
      z
        .object({
          evidenceId: z.string(),
          prominence: z.number().min(0).max(1),
        })
        .strict(),
    ),
    observations: z.array(
      z
        .object({
          explanation: z.string().min(1).max(1000),
          evidenceIds: z.array(z.string()).min(1),
        })
        .strict(),
    ),
    confidence: z.number().min(0).max(1),
  })
  .strict();
export const IntentEvaluationSchema = z
  .object({
    result: z.enum(['PASS', 'REVIEW', 'INCONCLUSIVE']),
    severity: z.enum(['LOW', 'MEDIUM', 'HIGH']).nullable(),
    confidence: z.number().min(0).max(1),
    contractId: z.string(),
    explanation: z.string().min(1).max(2000),
    evidenceIds: z.array(z.string()),
    uncertainty: z.string().nullable(),
  })
  .strict()
  .superRefine((r, ctx) => {
    if (r.result === 'REVIEW' && (!r.evidenceIds.length || r.severity === null))
      ctx.addIssue({
        code: 'custom',
        message: 'REVIEW requires severity and evidence IDs',
      });
    if (r.result !== 'REVIEW' && r.severity !== null)
      ctx.addIssue({
        code: 'custom',
        message: 'Severity belongs only to REVIEW results',
      });
  });
export type VisualEvaluation = z.infer<typeof VisualEvaluationSchema>;
export type IntentEvaluation = z.infer<typeof IntentEvaluationSchema>;
