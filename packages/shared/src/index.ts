export type Result = 'PASS' | 'REVIEW' | 'INCONCLUSIVE' | 'ERROR';
export type Severity = 'LOW' | 'MEDIUM' | 'HIGH';
export type ErrorKind =
  'CONTRACT_ERROR' | 'EXECUTION_ERROR' | 'EVIDENCE_ERROR' | 'MODEL_ERROR';

export class IntentGuardError extends Error {
  constructor(
    public readonly kind: ErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'IntentGuardError';
  }
}

export function safeId(value: string): string {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/.test(value)) {
    throw new IntentGuardError(
      'CONTRACT_ERROR',
      'IDs must be 1-100 letters, digits, underscores or hyphens.',
    );
  }
  return value;
}

export function cleanText(value: string): string {
  return value
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[EMAIL]')
    .replace(/\bBearer\s+\S+/gi, '[AUTH]')
    .replace(/\b(?:sk-|ghp_|github_pat_)[a-zA-Z0-9_-]+/g, '[TOKEN]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);
}

export function publicUrl(value: string): string {
  const url = new URL(value);
  return `${url.origin}${url.pathname}`;
}
