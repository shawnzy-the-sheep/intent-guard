import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
export async function availablePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}
export function startDemo(port = 5173) {
  return spawn(
    'node',
    [
      'node_modules/vite/bin/vite.js',
      '--host',
      '127.0.0.1',
      '--port',
      String(port),
      '--strictPort',
    ],
    { cwd: 'examples/task-management', stdio: 'pipe' },
  );
}
export async function waitForURL(url, child, timeout = 20000) {
  const start = Date.now();
  let output = '';
  child?.stderr?.on('data', (d) => (output += d));
  while (Date.now() - start < timeout) {
    if (child?.exitCode !== null && child?.exitCode !== undefined)
      throw new Error(`Server exited: ${output}`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      /* server starting */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Server unavailable: ${url}`);
}
