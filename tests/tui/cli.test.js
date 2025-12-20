/**
 * TUI Visual Tests
 *
 * These tests capture screenshots of CLI output for visual regression testing.
 * They require the X11 driver which is only available in Linux environments.
 *
 * - Skipped locally on macOS (no X11)
 * - Run in CI on Linux with X11 available
 */
import { after, before, describe, test } from 'node:test';
import { DependencyError, Terminal } from 'tui-driver';
import { vizzlyScreenshot } from '../../src/client/index.js';

// Terminal dimensions
let COLS = 100;
let ROWS = 70; // Large enough for biggest output (help is ~55 lines)

// Capture heights for each command
let HELP_ROWS = 150;
let DOCTOR_ROWS = 24;
let TDD_HELP_ROWS = 24;
let RUN_HELP_ROWS = 30;
let ERROR_ROWS = 24;

let term = null;
let skipReason = null;

describe('vizzly CLI visual tests', () => {
  before(async () => {
    try {
      term = await Terminal.launch({ driver: 'x11', cols: COLS, rows: ROWS });
    } catch (err) {
      if (err instanceof DependencyError) {
        skipReason = `Missing dependencies: ${err.missing?.join(', ') || err.message}`;
      } else {
        skipReason = err.message;
      }
    }
  });

  after(async () => {
    if (term) await term.close();
  });

  test('vizzly --help', async t => {
    if (!term) return t.skip(skipReason);

    await term.resize(COLS, HELP_ROWS);
    await term.type('node bin/vizzly.js --help');
    await term.press('Enter');
    await term.waitForStable({ timeout: 10000 });

    let screenshot = await term.screenshot();
    await vizzlyScreenshot('vizzly-help', screenshot);
  });

  test('vizzly doctor', async t => {
    if (!term) return t.skip(skipReason);

    await term.resize(COLS, DOCTOR_ROWS);
    await term.type('node bin/vizzly.js doctor');
    await term.press('Enter');
    await term.waitForStable({ timeout: 15000 });

    let screenshot = await term.screenshot();
    await vizzlyScreenshot('vizzly-doctor', screenshot);
  });

  test('vizzly tdd --help', async t => {
    if (!term) return t.skip(skipReason);

    await term.resize(COLS, TDD_HELP_ROWS);
    await term.type('node bin/vizzly.js tdd --help');
    await term.press('Enter');
    await term.waitForStable({ timeout: 10000 });

    let screenshot = await term.screenshot();
    await vizzlyScreenshot('vizzly-tdd-help', screenshot);
  });

  test('vizzly run --help', async t => {
    if (!term) return t.skip(skipReason);

    await term.resize(COLS, RUN_HELP_ROWS);
    await term.type('node bin/vizzly.js run --help');
    await term.press('Enter');
    await term.waitForStable({ timeout: 10000 });

    let screenshot = await term.screenshot();
    await vizzlyScreenshot('vizzly-run-help', screenshot);
  });

  test('vizzly with invalid command', async t => {
    if (!term) return t.skip(skipReason);

    await term.resize(COLS, ERROR_ROWS);
    await term.type('node bin/vizzly.js notacommand');
    await term.press('Enter');
    await term.waitForStable({ timeout: 10000 });

    let screenshot = await term.screenshot();
    await vizzlyScreenshot('vizzly-invalid-command', screenshot);
  });
});
