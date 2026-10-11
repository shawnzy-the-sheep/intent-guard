import { describe, it, expect } from 'vitest';
import { UXContractSchema } from '../../packages/contracts/src/schema.js';
import { loadContract } from '../../packages/contracts/src/loader.js';
import { cleanText, publicUrl } from '../../packages/shared/src/index.js';
describe('contracts', () => {
  it('loads the canonical YAML contract', async () => {
    const c = await loadContract('intent/task-details.yaml');
    expect(c.intents).toHaveLength(3);
  });
  it('rejects unknown references, duplicate IDs and unsupported versions', async () => {
    const c = await loadContract('intent/task-details.yaml');
    expect(UXContractSchema.safeParse({ ...c, version: 2 }).success).toBe(
      false,
    );
    expect(
      UXContractSchema.safeParse({
        ...c,
        intents: [{ ...c.intents[0], subject: 'missing' }],
      }).success,
    ).toBe(false);
    expect(
      UXContractSchema.safeParse({
        ...c,
        intents: [c.intents[0], c.intents[0]],
      }).success,
    ).toBe(false);
    expect(UXContractSchema.safeParse({ ...c, id: '../../evil' }).success).toBe(
      false,
    );
    expect(
      UXContractSchema.safeParse({ ...c, page: { route: '//attacker.test' } })
        .success,
    ).toBe(false);
    expect(
      UXContractSchema.safeParse({
        ...c,
        actions: { ...c.actions, current_task: c.entities.current_task },
      }).success,
    ).toBe(false);
  });
});
it('sanitises obvious credentials and strips URL query/fragment/userinfo', () => {
  expect(cleanText('Contact alice@example.com Bearer abc sk-secret')).toBe(
    'Contact [EMAIL] [AUTH] [TOKEN]',
  );
  expect(publicUrl('https://user:pass@example.com/path?token=abc#secret')).toBe(
    'https://example.com/path',
  );
});
