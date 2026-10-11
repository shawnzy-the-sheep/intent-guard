import type {
  PageEvidence,
  ElementEvidence,
} from '../../packages/evidence/src/types.js';
export function element(
  id: string,
  overrides: Partial<ElementEvidence> = {},
): ElementEvidence {
  return {
    id,
    tag: 'section',
    text: id,
    role: null,
    ariaLabel: null,
    rect: { x: 0, y: 100, width: 600, height: 300 },
    style: {
      fontSize: '16px',
      fontWeight: '400',
      color: 'rgb(0,0,0)',
      backgroundColor: 'rgb(255,255,255)',
      position: 'static',
      zIndex: 'auto',
      opacity: '1',
    },
    visible: true,
    inViewport: true,
    interactive: false,
    disabled: false,
    occluded: false,
    entityIds: [],
    parentId: null,
    ...overrides,
  };
}
export function page(elements: ElementEvidence[]): PageEvidence {
  return {
    url: 'http://localhost/demo',
    screenshotPath: '/tmp/test.png',
    viewport: { width: 1280, height: 800 },
    elements,
    entities: [
      { id: 'current_task', priority: 'primary', elementIds: ['task'] },
      { id: 'parent_job', priority: 'contextual', elementIds: ['job'] },
    ],
    actions: [
      { id: 'continue_task', priority: 'primary', elementIds: ['continue'] },
    ],
    truncated: false,
    accessibility: { violations: [], passes: 0 },
    accessibilityTree: '',
  };
}
