import path from 'node:path';
import { readOptionalFile } from '../utils/config-discovery.js';
import { quoteArgument } from './core.js';

export async function chooseIntegration(project, prompts) {
  let choice = await prompts.select(
    'How will you capture screenshots?',
    [
      ['1', 'Add a Playwright example to my app'],
      ['2', 'Create config only'],
    ],
    '2'
  );
  let plan = {
    changes: [],
    requirements: [],
    command: null,
    install: [],
  };
  if (choice === '2') return plan;

  let directory = await prompts.ask('Playwright test directory', 'tests');
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
