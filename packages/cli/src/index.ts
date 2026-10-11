#!/usr/bin/env node
import { Command } from 'commander';
import { glob, mkdir, writeFile, access } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { loadConfig, runContract } from '@intentguard/core';
import { loadContract, type UXContract } from '@intentguard/contracts';
import { consoleReport, type RunReport } from '@intentguard/reporter';
import { launchBrowser } from '@intentguard/playwright';
const program = new Command()
  .name('intentguard')
  .description('CI for UX intent — evidence-backed semantic regression review')
  .version('0.1.0');
program
  .command('init')
  .description(
    'Create starter configuration and UX contract without overwriting files',
  )
  .action(async () => {
    const starter = {
      'intentguard.config.ts': `export default {\n  baseURL: 'http://localhost:5173',\n  contracts: ['intent/*.yaml'],\n  provider: 'none',\n  redact: ['[data-sensitive]', '.customer-email'],\n};\n`,
      'intent/task-details.yaml': `version: 1\nid: task-details\npage:\n  route: /demo/good\nuser:\n  role: operator\ngoal:\n  primary: understand_and_act_on_current_task\nentities:\n  current_task:\n    priority: primary\n    selectors: ["[data-entity='task']"]\n  parent_job:\n    priority: contextual\n    selectors: ["[data-entity='parent-job']"]\nactions:\n  continue_task:\n    priority: primary\n    selectors: ["[data-action='continue-task']"]\nintents:\n  - id: task-primary-focus\n    type: hierarchy\n    subject: current_task\n    relativeTo: parent_job\n    expectation: dominant\n  - id: parent-job-context\n    type: semantic_ownership\n    subject: parent_job\n    expectation: contextual\n  - id: continue-action-visible\n    type: action_discoverability\n    subject: continue_task\n    expectation: immediate\n`,
    };
    // Preflight all destinations before writing any file.
    for (const path of Object.keys(starter)) {
      try {
        await access(path);
      } catch {
        continue;
      }
      throw new Error(`Refusing to overwrite ${path}`);
    }
    for (const [path, content] of Object.entries(starter)) {
      await mkdir(dirname(resolve(path)), { recursive: true });
      await writeFile(path, content, { flag: 'wx' });
    }
    console.log(
      'Created intentguard.config.ts and intent/task-details.yaml. Set baseURL and selectors for your application.',
    );
  });
program
  .command('test [contractId]')
  .description('Run UX contracts in desktop Chromium')
  .option('-c, --config <path>', 'Configuration file', 'intentguard.config.ts')
  .option('--debug', 'Save sanitised model input and structured stage events')
  .option('--deterministic-only', 'Skip AI and report deterministic suspicion')
  .option('--provider <provider>', 'Override provider: none, mock, openai')
  .option('--base-url <url>', 'Override application base URL')
  .option(
    '--route <path>',
    'Override route (requires exactly one selected contract)',
  )
  .option('--json', 'Print report array as JSON')
  .option('--no-cache', 'Disable evaluation cache')
  .action(
    async (
      contractId: string | undefined,
      options: {
        config: string;
        debug?: boolean;
        deterministicOnly?: boolean;
        provider?: string;
        baseUrl?: string;
        route?: string;
        json?: boolean;
        cache: boolean;
      },
    ) => {
      const config = await loadConfig(options.config);
      if (options.provider) {
        if (!['none', 'mock', 'openai'].includes(options.provider))
          throw new Error('Provider must be none, mock or openai');
        config.provider = options.provider as typeof config.provider;
      }
      if (options.baseUrl) {
        const url = new URL(options.baseUrl);
        if (!['http:', 'https:'].includes(url.protocol))
          throw new Error('Base URL must use HTTP(S)');
        config.baseURL = url.href;
      }
      config.cache = config.cache && options.cache;
      const paths = new Set<string>();
      for (const pattern of config.contracts)
        for await (const path of glob(pattern)) paths.add(path);
      if (!paths.size)
        throw new Error('No UX contracts matched configured paths.');
      const contracts: UXContract[] = [];
      const ids = new Set<string>();
      for (const path of [...paths].sort()) {
        const c = await loadContract(path);
        if (ids.has(c.id)) throw new Error(`Duplicate contract ID ${c.id}`);
        ids.add(c.id);
        if (!contractId || c.id === contractId) contracts.push(c);
      }
      if (!contracts.length) throw new Error(`No contract named ${contractId}`);
      if (options.route) {
        if (contracts.length !== 1)
          throw new Error('--route requires one selected contract');
        if (!options.route.startsWith('/') || options.route.startsWith('//'))
          throw new Error('Route must be a relative path');
        contracts[0]!.page.route = options.route;
      }
      const reports: RunReport[] = [];
      const browser = await launchBrowser();
      try {
        for (const contract of contracts)
          for (const viewport of config.viewports) {
            const report = await runContract(contract, config, viewport, {
              browser,
              debug: options.debug,
              deterministicOnly: options.deterministicOnly,
            });
            reports.push(report);
            if (!options.json) console.log(consoleReport(report) + '\n');
          }
      } finally {
        await browser.close();
      }
      const summaryDir = resolve(config.outputDir);
      await mkdir(summaryDir, { recursive: true });
      await writeFile(
        resolve(summaryDir, 'summary.json'),
        JSON.stringify(reports, null, 2),
      );
      const summary = [
        '# IntentGuard',
        '',
        '| Contract | Viewport | Result | Source |',
        '| --- | --- | --- | --- |',
        ...reports.map(
          (r) =>
            `| ${r.contractId} | ${r.viewport.width}×${r.viewport.height} | ${r.result} | ${r.source} |`,
        ),
        '',
        'AI REVIEW and INCONCLUSIVE results are non-blocking. See uploaded artifacts for evidence.',
        '',
      ].join('\n');
      await writeFile(resolve(summaryDir, 'summary.md'), summary);
      if (process.env.GITHUB_STEP_SUMMARY)
        await writeFile(process.env.GITHUB_STEP_SUMMARY, summary, {
          flag: 'a',
        });
      if (options.json) console.log(JSON.stringify(reports, null, 2));
      process.exitCode = reports.some((r) => r.result === 'ERROR') ? 1 : 0;
    },
  );
program.parseAsync().catch((error: unknown) => {
  console.error(
    `IntentGuard ERROR: ${error instanceof Error ? error.message : 'Unknown error'}`,
  );
  process.exitCode = 1;
});
