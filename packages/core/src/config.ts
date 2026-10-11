import { resolve } from 'node:path';
import { createJiti } from 'jiti';
import { z } from 'zod';
import { UxGuardPipelineError } from '@ux-guard-pipeline/shared';
export const ConfigSchema = z
  .object({
    baseURL: z
      .url()
      .refine(
        (s) => ['http:', 'https:'].includes(new URL(s).protocol),
        'Only HTTP(S) base URLs are allowed',
      ),
    contracts: z.array(z.string().min(1)).min(1).default(['intent/*.yaml']),
    outputDir: z.string().default('.ux-guard-pipeline'),
    viewports: z
      .array(
        z
          .object({
            width: z.number().int().min(320).max(3840),
            height: z.number().int().min(240).max(2160),
          })
          .strict(),
      )
      .min(1)
      .max(10)
      .default([{ width: 1280, height: 800 }]),
    redact: z.array(z.string()).default([]),
    provider: z.enum(['openai', 'mock', 'none']).default('none'),
    model: z.string().min(1).optional(),
    timeoutMs: z.number().int().min(100).max(120000).default(30000),
    readySelector: z.string().optional(),
    hierarchyRatio: z.number().min(1).max(3).default(1.15),
    cache: z.boolean().default(true),
  })
  .strict();
export type UxGuardPipelineConfig = z.infer<typeof ConfigSchema>;
export type ConfigInput = z.input<typeof ConfigSchema>;
export function defineConfig(config: ConfigInput): ConfigInput {
  return config;
}
export async function loadConfig(
  path = 'ux-guard-pipeline.config.ts',
): Promise<UxGuardPipelineConfig> {
  try {
    const jiti = createJiti(import.meta.url);
    const module = await jiti.import(resolve(path), { default: true });
    return ConfigSchema.parse(module);
  } catch (error) {
    throw new UxGuardPipelineError(
      'CONTRACT_ERROR',
      `Cannot load ${path}: ${error instanceof Error ? error.message : 'Invalid configuration'}`,
    );
  }
}
