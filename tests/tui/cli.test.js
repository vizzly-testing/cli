import { before, describe, test } from 'node:test';
import { DependencyError, Terminal } from 'tui-driver';

let isAvailable = false;
let skipReason = null;

// Check if x11 driver is available before running tests
before(async () => {
  let term = null;
  try {
    term = await Terminal.launch({ driver: 'x11', cols: 100, rows: 40 });
    isAvailable = true;
  } catch (err) {
    if (err instanceof DependencyError) {
      skipReason = `Missing dependencies: ${err.missing?.join(', ') || err.message}`;
    } else {
      skipReason = err.message;
    }
  } finally {
    if (term) await term.close();
  }
});

describe('vizzly CLI visual tests', () => {
  test('vizzly --help', async t => {
    if (!isAvailable) return t.skip(skipReason);

    let term = await Terminal.launch({ driver: 'x11', cols: 100, rows: 40 });

    try {
      await term.type('node bin/vizzly.js --help');
      await term.press('Enter');
      await term.waitForStable({ timeout: 10000 });
      await term.screenshot({ name: 'vizzly-help' });
    } finally {
      await term.close();
    }
  });

  test('vizzly doctor', async t => {
    if (!isAvailable) return t.skip(skipReason);

    let term = await Terminal.launch({ driver: 'x11', cols: 100, rows: 40 });

    try {
      await term.type('node bin/vizzly.js doctor');
      await term.press('Enter');
      // doctor runs system checks which can take longer
      await term.waitForStable({ timeout: 15000 });
      await term.screenshot({ name: 'vizzly-doctor' });
    } finally {
      await term.close();
    }
  });

  test('vizzly tdd --help', async t => {
    if (!isAvailable) return t.skip(skipReason);

    let term = await Terminal.launch({ driver: 'x11', cols: 100, rows: 40 });

    try {
      await term.type('node bin/vizzly.js tdd --help');
      await term.press('Enter');
      await term.waitForStable({ timeout: 10000 });
      await term.screenshot({ name: 'vizzly-tdd-help' });
    } finally {
      await term.close();
    }
  });

  test('vizzly run --help', async t => {
    if (!isAvailable) return t.skip(skipReason);

    let term = await Terminal.launch({ driver: 'x11', cols: 100, rows: 40 });

    try {
      await term.type('node bin/vizzly.js run --help');
      await term.press('Enter');
      await term.waitForStable({ timeout: 10000 });
      await term.screenshot({ name: 'vizzly-run-help' });
    } finally {
      await term.close();
    }
  });

  test('vizzly with invalid command', async t => {
    if (!isAvailable) return t.skip(skipReason);

    let term = await Terminal.launch({ driver: 'x11', cols: 100, rows: 40 });

    try {
      await term.type('node bin/vizzly.js notacommand');
      await term.press('Enter');
      await term.waitForStable({ timeout: 10000 });
      await term.screenshot({ name: 'vizzly-invalid-command' });
    } finally {
      await term.close();
    }
  });
});
