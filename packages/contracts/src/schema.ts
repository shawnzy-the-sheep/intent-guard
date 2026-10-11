import { z } from 'zod';
const id = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/);
export const PrioritySchema = z.enum(['primary', 'secondary', 'contextual']);
export const EntitySchema = z
  .object({
    priority: PrioritySchema,
    selectors: z.array(z.string().min(1).max(500)).min(1).max(10),
  })
  .strict();
export const IntentSchema = z.discriminatedUnion('type', [
  z
    .object({
      id,
      type: z.literal('hierarchy'),
      subject: id,
      relativeTo: id,
      expectation: z.enum(['dominant', 'subordinate']),
    })
    .strict(),
  z
    .object({
      id,
      type: z.literal('semantic_ownership'),
      subject: id,
      expectation: z.literal('contextual'),
    })
    .strict(),
  z
    .object({
      id,
      type: z.literal('action_discoverability'),
      subject: id,
      expectation: z.enum(['immediate', 'discoverable']),
    })
    .strict(),
]);
export const UXContractSchema = z
  .object({
    version: z.literal(1),
    id,
    page: z
      .object({
        route: z
          .string()
          .startsWith('/')
          .refine((s) => !s.startsWith('//'), 'Route must be a relative path'),
      })
      .strict(),
    user: z.object({ role: z.string().min(1) }).strict(),
    goal: z.object({ primary: z.string().min(1) }).strict(),
    entities: z.record(id, EntitySchema),
    actions: z.record(id, EntitySchema),
    intents: z.array(IntentSchema).min(1),
  })
  .strict()
  .superRefine((c, ctx) => {
    const ids = new Set<string>();
    for (const key of Object.keys(c.actions)) {
      if (key in c.entities)
        ctx.addIssue({
          code: 'custom',
          path: ['actions', key],
          message: 'Entity and action IDs must be distinct',
        });
    }
    c.intents.forEach((intent, index) => {
      const registry =
        intent.type === 'action_discoverability' ? c.actions : c.entities;
      if (!(intent.subject in registry))
        ctx.addIssue({
          code: 'custom',
          path: ['intents', index, 'subject'],
          message: `Unknown subject ${intent.subject}`,
        });
      if (
        intent.type === 'hierarchy' &&
        (!(intent.relativeTo in c.entities) ||
          intent.relativeTo === intent.subject)
      )
        ctx.addIssue({
          code: 'custom',
          path: ['intents', index, 'relativeTo'],
          message: 'Must reference a different declared entity',
        });
      if (ids.has(intent.id))
        ctx.addIssue({
          code: 'custom',
          path: ['intents', index, 'id'],
          message: 'Duplicate intent ID',
        });
      ids.add(intent.id);
    });
  });
export type UXContract = z.infer<typeof UXContractSchema>;
export type UXIntent = z.infer<typeof IntentSchema>;
