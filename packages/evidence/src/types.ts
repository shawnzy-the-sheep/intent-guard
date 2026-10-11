export interface Rect { x: number; y: number; width: number; height: number }
export interface ElementEvidence {
  id: string;
  tag: string;
  text: string;
  role: string | null;
  ariaLabel: string | null;
  rect: Rect;
  style: { fontSize: string; fontWeight: string; color: string; backgroundColor: string; position: string; zIndex: string; opacity: string };
  visible: boolean;
  inViewport: boolean;
  interactive: boolean;
  disabled: boolean;
  occluded: boolean;
  entityIds: string[];
  parentId: string | null;
  features?: Features;
}
export interface Features {
  viewportCoverage: number;
  containerWidthRatio: number;
  distanceFromTopPx: number;
  fontSizePx: number;
  fontWeight: number;
  contrastStrength: number;
  sticky: boolean;
  salience: number;
}
export interface Binding { id: string; priority: 'primary' | 'secondary' | 'contextual'; elementIds: string[] }
export interface PageEvidence {
  url: string;
  screenshotPath: string;
  viewport: { width: number; height: number };
  elements: ElementEvidence[];
  entities: Binding[];
  actions: Binding[];
  truncated: boolean;
  accessibility: { violations: { id: string; impact: string | null; count: number; description: string }[]; passes: number };
  accessibilityTree: string;
}
export interface Signal {
  intentId: string;
  type: 'hierarchy' | 'semantic_ownership' | 'action_discoverability' | 'visibility';
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  explanation: string;
  evidenceIds: string[];
  facts: Record<string, number | string | boolean>;
  definitive: boolean;
}
export interface DeterministicEvidence {
  requiresAI: boolean;
  incomplete: boolean;
  signals: Signal[];
  actionRanking: { id: string; label: string; salience: number }[];
}
