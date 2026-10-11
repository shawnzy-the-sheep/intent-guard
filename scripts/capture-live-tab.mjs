import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { UXContractSchema } from '../packages/contracts/dist/schema.js';
import { projectDomEvidence } from '../packages/playwright/dist/projection.js';
import { cleanText, publicUrl } from '../packages/shared/dist/index.js';

// Call from the documented Codex browser REPL with a selected, signed-in tab.
// No cookies, browser storage, input values, DOM writes or model calls are used.
export async function captureLiveTab(tab, inputContract) {
  const contract = UXContractSchema.parse(inputContract);
  const url = new URL(await tab.url());
  if (
    !['app.clickup.com', 'app.notion.com'].includes(url.hostname) ||
    contract.page.route !== url.pathname + url.search
  ) {
    throw new Error('Select the ClickUp or Notion page named by the contract.');
  }
  const raw = await tab.playwright.evaluate(
    `(${projectDomEvidence.toString()})(${JSON.stringify(contract)})`,
  );
  const view = await tab.playwright.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
    scrollX,
    scrollY,
  }));
  const artifactDir = resolve(
    fileURLToPath(
      new URL('../.ux-guard-pipeline/authenticated/', import.meta.url),
    ),
    contract.id,
  );
  await mkdir(artifactDir, { recursive: true });
  const screenshotPath = resolve(artifactDir, 'screenshot.png');
  await writeFile(screenshotPath, await tab.screenshot({ fullPage: false }));
  const evidence = {
    ...raw,
    url: publicUrl(url.href),
    screenshotPath,
    viewport: { width: view.width, height: view.height },
    elements: raw.elements.map((e) => ({
      ...e,
      text: cleanText(e.text),
      ariaLabel: e.ariaLabel ? cleanText(e.ariaLabel) : null,
      rect: {
        ...e.rect,
        x: e.rect.x - view.scrollX,
        y: e.rect.y - view.scrollY,
      },
    })),
    accessibilityTree: '',
  };
  await writeFile(
    resolve(artifactDir, 'capture.json'),
    JSON.stringify(
      {
        contract,
        evidence,
        capturedAt: new Date().toISOString(),
        mode: 'read-only existing-browser DOM projection; viewport screenshot; axe and screenshot masking unavailable',
      },
      null,
      2,
    ),
  );
  return {
    artifactDir,
    elements: raw.elements.length,
    truncated: raw.truncated,
    bindings: raw.actions,
  };
}
