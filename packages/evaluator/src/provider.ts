import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import type { UXContract } from '@intentguard/contracts';
import type { PageEvidence, DeterministicEvidence } from '@intentguard/evidence';
import { VisualEvaluationSchema, IntentEvaluationSchema, type VisualEvaluation, type IntentEvaluation } from './schema.js';
import { VISUAL_PROMPT, INTENT_PROMPT } from './prompts.js';
export const PROMPT_VERSION = 'visual-v1/intent-v1';
export interface EvaluationInput { contract: UXContract; evidence: PageEvidence; deterministic: DeterministicEvidence }
export interface ModelProvider {
  readonly name: string; readonly model: string;
  evaluateVisualHierarchy(input: EvaluationInput): Promise<unknown>;
  evaluateIntent(input: EvaluationInput & { visual: VisualEvaluation }): Promise<unknown>;
}
export class MockProvider implements ModelProvider {
  readonly name = 'mock'; readonly model = 'offline-heuristic-v1';
  async evaluateVisualHierarchy(input: EvaluationInput): Promise<VisualEvaluation> {
    return { ranking: input.evidence.elements.filter(e=>e.visible).map(e=>({ evidenceId: e.id, prominence: e.features?.salience || 0 })).sort((a,b)=>b.prominence-a.prominence), observations: input.deterministic.signals.map(s=>({ explanation: s.explanation, evidenceIds:s.evidenceIds })), confidence: .8 };
  }
  async evaluateIntent(input: EvaluationInput & { visual: VisualEvaluation }): Promise<IntentEvaluation> {
    const signals = input.deterministic.signals;
    return { result: signals.length ? 'REVIEW' : 'PASS', severity: signals.length ? 'MEDIUM' : null, contractId: input.contract.id, confidence: .8, explanation: signals.length ? `Offline mock: ${signals.map(s=>s.explanation).join(' ')}` : 'Offline mock found no suspicion.', evidenceIds: [...new Set(signals.flatMap(s=>s.evidenceIds))], uncertainty:'Mock output is a pipeline fixture, not independent AI or human validation.' };
  }
}

// Only this deliberately limited projection is supplied to providers.
export function modelEvidence(input: EvaluationInput) {
  return { contract: input.contract, deterministic: input.deterministic, evidence: { viewport: input.evidence.viewport, elements: input.evidence.elements, entities: input.evidence.entities, actions: input.evidence.actions, accessibilityTree: input.evidence.accessibilityTree } };
}
export class OpenAIProvider implements ModelProvider {
  readonly name = 'openai';
  constructor(public readonly model: string, private readonly apiKey: string, private readonly timeoutMs = 30000) {}
  private async request<T>(schema: z.ZodType<T>, name: string, instructions: string, input: unknown, screenshotPath?: string): Promise<unknown> {
    const content: Array<Record<string, unknown>> = [{ type:'input_text', text:JSON.stringify(input) }];
    if (screenshotPath) content.push({ type:'input_image', image_url:`data:image/png;base64,${(await readFile(screenshotPath)).toString('base64')}`, detail:'auto' });
    const response = await fetch('https://api.openai.com/v1/responses', {
      method:'POST', signal:AbortSignal.timeout(this.timeoutMs),
      headers:{ Authorization:`Bearer ${this.apiKey}`, 'Content-Type':'application/json' },
      body:JSON.stringify({ model:this.model, store:false, instructions, input:[{role:'user',content}], max_output_tokens:2000, text:{ format:{ type:'json_schema', name, strict:true, schema:z.toJSONSchema(schema, { unrepresentable: 'any' }) } } }),
    });
    if (!response.ok) throw new Error(`Model API returned HTTP ${response.status}`);
    const data = await response.json() as { status?: string; output?: { type:string; content?: { type:string; text?:string }[] }[] };
    if (data.status !== 'completed') throw new Error('Model output incomplete or refused');
    const output = data.output?.filter(o=>o.type==='message').flatMap(o=>o.content || []).filter(c=>c.type==='output_text').map(c=>c.text || '').join('');
    if (!output) throw new Error('Model did not return structured text');
    return JSON.parse(output);
  }
  evaluateVisualHierarchy(input: EvaluationInput) { return this.request(VisualEvaluationSchema, 'visual_hierarchy', VISUAL_PROMPT, modelEvidence(input), input.evidence.screenshotPath); }
  evaluateIntent(input: EvaluationInput & { visual: VisualEvaluation }) { return this.request(IntentEvaluationSchema, 'intent_evaluation', INTENT_PROMPT, { ...modelEvidence(input), visual:input.visual }); }
}
