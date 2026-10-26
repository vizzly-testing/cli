import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readOptionalFile } from '../utils/config-discovery.js';
import { fileChange } from '../utils/file-changes.js';
import { packageCommand, quoteArgument } from './core.js';

export async function chooseIntegration(project, prompts) {
  let choice = await prompts.select(
    'How will you capture screenshots?',
    [
      ['1', 'Use my existing tests'],
      ['2', 'Use screenshots already saved to a folder'],
      ['3', 'Add a Playwright example to my app'],
      ['4', 'Create config only'],
    ],
    '4'
  );
  let plan = {
    integration: 'config',
    changes: [],
    settings: {},
    requirements: [],
    command: null,
    install: [],
  };
  if (choice === '4') return plan;
  if (choice === '1') {
    let command = await prompts.ask(
      'Screenshot-producing test command',
      project.suggested || ''
    );
    if (!command) {
      plan.requirements.push(
        'Add Vizzly screenshot capture to your tests, then run them with vizzly tdd run.'
      );
      return plan;
    }
    return { ...plan, integration: 'existing', command };
  }
  if (choice === '2') {
    let directory = path.resolve(
      project.cwd,
      await prompts.ask('Screenshots folder', './screenshots')
    );
    let files = await readdir(directory, { withFileTypes: true });
    if (
      !files.some(
        entry => entry.isFile() && /\.(png|jpe?g|webp)$/i.test(entry.name)
      )
    ) {
      throw new Error(
        `No PNG, JPEG or WebP screenshots found in ${directory}.`
      );
    }
    let ingestion = fileURLToPath(new URL('./ingest.js', import.meta.url));
    return {
      ...plan,
      integration: 'images',
      settings: {
        upload: {
          screenshotsDir: path.relative(project.cwd, directory) || '.',
        },
      },
      command: [process.execPath, ingestion, directory]
        .map(value => quoteArgument(value))
        .join(' '),
    };
  }

  plan.integration = 'playwright';
  let directory = await prompts.ask('Existing Playwright test directory');
  let url = await prompts.ask(
    'App page URL to capture (your app must be running)'
  );
  let target;
  try {
    target = new URL(url);
  } catch {
    /* handled as a missing project target */
  }
  if (!directory || !['http:', 'https:'].includes(target?.protocol)) {
    plan.requirements.push(
      'Choose a real app URL and the testDir from your Playwright configuration, then add an awaited vizzlyScreenshot call to that test.'
    );
    return plan;
  }
  let filename = path.resolve(project.cwd, directory, 'vizzly.spec.js');
  let relative = path.relative(project.cwd, filename);
  if (relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('Choose a Playwright test directory inside this project.');
  }
  if ((await readOptionalFile(filename)) !== null) {
    plan.requirements.push(
      `Keep ${filename}; add Vizzly capture to that existing test or choose another test filename manually.`
    );
    return plan;
  }
  let example = `import { expect, test } from '@playwright/test';
import { vizzlyScreenshot } from '@vizzly-testing/cli/client';

test('app page looks correct', async ({ page }) => {
  await page.goto(${JSON.stringify(url)});
  await expect(page.locator('body')).toBeVisible();
  let receipt = await vizzlyScreenshot('app-page', await page.screenshot());
  expect(receipt, 'Vizzly screenshot capture must succeed').toBeTruthy();
});
`;
  plan.changes.push({ path: filename, before: null, after: example });
  if (!project.playwright) plan.install.push('@playwright/test');
  if (!project.cliInstalled) plan.install.push('@vizzly-testing/cli');
  if (!project.manager) {
    plan.requirements.push(
      'Install @playwright/test and @vizzly-testing/cli with your package manager, then run this example through vizzly tdd run.'
    );
  } else {
    let executable =
      project.manager === 'npm' ? 'npx' : `${project.manager} exec`;
    if (project.manager === 'yarn') executable = 'yarn exec';
    if (project.manager === 'bun') executable = 'bunx';
    plan.command = `${executable} playwright test ${quoteArgument(path.relative(project.cwd, filename))}`;
  }
  return plan;
}

export async function planVisualScript(project, command, prompts) {
  if (!project.pkg || !project.manager) return [];
  let entry = Object.entries(project.pkg.scripts || {}).find(
    ([name]) => packageCommand(project.manager, name) === command
  );
  if (
    !entry ||
    !project.cliInstalled ||
    !(await prompts.confirm('Add a separate visual-test package script?'))
  )
    return [];
  let script = await prompts.ask('Visual script name', 'test:visual');
  if (!/^[\w:.-]+$/.test(script))
    throw new Error(
      'Use a simple package script name (letters, digits, colon, dash or dot).'
    );
  // packageCommand accepts only known managers and simple script names. These
  // double quotes transport those tokens unchanged on POSIX and Windows.
  let value = `vizzly tdd run "${command}" --no-open`;
  let existing = project.pkg.scripts?.[script];
  if (existing && existing !== value)
    throw new Error(
      `Package script ${script} already exists; choose another name.`
    );
  if (existing) return [];
  let pkg = {
    ...project.pkg,
    scripts: { ...project.pkg.scripts, [script]: value },
  };
  let indent = project.packageSource.match(/\n([ \t]+)\S/)?.[1] || '  ';
  return [
    await fileChange(
      path.join(project.cwd, 'package.json'),
      `${JSON.stringify(pkg, null, indent)}\n`
    ),
  ];
}
