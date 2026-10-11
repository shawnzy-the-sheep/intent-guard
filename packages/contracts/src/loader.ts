import { readFile } from 'node:fs/promises';
import { parseDocument } from 'yaml';
import { IntentGuardError } from '@intentguard/shared';
import { UXContractSchema, type UXContract } from './schema.js';
export async function loadContract(path: string): Promise<UXContract> {
  try {
    const doc = parseDocument(await readFile(path, 'utf8'), { uniqueKeys: true });
    if (doc.errors.length) throw new Error(doc.errors.map(e => e.message).join('; '));
    const result = UXContractSchema.safeParse(doc.toJS({ maxAliasCount: 20 }));
    if (!result.success) throw new Error(result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('\n'));
    return result.data;
  } catch (error) {
    throw new IntentGuardError('CONTRACT_ERROR', `${path}: ${error instanceof Error ? error.message : 'Invalid contract'}`);
  }
}
