import { chromium } from 'playwright';
// A system Chrome channel is useful in environments where browser downloads are unavailable.
// Every browser still runs in a new isolated Playwright context, never a personal profile.
export function launchBrowser() {
  const channel = process.env.UX_GUARD_PIPELINE_BROWSER_CHANNEL;
  if (channel && !['chrome', 'msedge', 'chromium'].includes(channel))
    throw new Error(
      'UX_GUARD_PIPELINE_BROWSER_CHANNEL must be chrome, msedge or chromium',
    );
  return chromium.launch({ headless: true, ...(channel ? { channel } : {}) });
}
