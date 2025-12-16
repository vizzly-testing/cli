import assert from 'node:assert';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import {
  badge,
  box,
  complete,
  configure,
  diffBar,
  divider,
  header,
  hint,
  keyValue,
  labelValue,
  link,
  list,
  printBox,
  printErr,
  progressBar,
  reset,
  result,
  statusDot,
  success,
} from '../../src/utils/output.js';

// Helper to strip ANSI escape codes for length calculations
// biome-ignore lint/suspicious/noControlCharactersInRegex: intentional ANSI escape sequence matching
let ANSI_REGEX = /\x1b\[[0-9;]*m/g;
let stripAnsi = str => str.replace(ANSI_REGEX, '');

describe('Output - TUI Helpers', () => {
  let consoleLogMock;
  let consoleErrorMock;

  beforeEach(() => {
    reset();
    // Configure with color disabled for predictable output
    configure({ color: false });
    consoleLogMock = mock.method(console, 'log', () => {});
    consoleErrorMock = mock.method(console, 'error', () => {});
  });

  afterEach(() => {
    consoleLogMock.mock.restore();
    consoleErrorMock.mock.restore();
    reset();
  });

  describe('header', () => {
    it('outputs branded header with command name', () => {
      header('doctor');

      // Should output to stderr (3 calls: blank, content, blank)
      assert.strictEqual(consoleErrorMock.mock.calls.length, 3);
      let output = consoleErrorMock.mock.calls[1].arguments[0];
      assert.ok(output.includes('vizzly'));
      assert.ok(output.includes('doctor'));
    });

    it('includes mode when provided', () => {
      header('doctor', 'local');

      let output = consoleErrorMock.mock.calls[1].arguments[0];
      assert.ok(output.includes('local'));
    });

    it('only shows once per command execution', () => {
      header('doctor');
      header('doctor'); // Second call should be ignored

      // Should only have 3 calls from first header
      assert.strictEqual(consoleErrorMock.mock.calls.length, 3);
    });

    it('is suppressed in json mode', () => {
      configure({ json: true });
      header('doctor');

      assert.strictEqual(consoleErrorMock.mock.calls.length, 0);
    });

    it('is suppressed in silent mode', () => {
      configure({ silent: true });
      header('doctor');

      assert.strictEqual(consoleErrorMock.mock.calls.length, 0);
    });
  });

  describe('success', () => {
    it('outputs success message with checkmark', () => {
      success('Operation completed');

      // Outputs blank line + message
      assert.ok(consoleErrorMock.mock.calls.length >= 1);
      let lastCall =
        consoleErrorMock.mock.calls[consoleErrorMock.mock.calls.length - 1];
      assert.ok(lastCall.arguments.join(' ').includes('Operation completed'));
    });

    it('outputs JSON in json mode', () => {
      configure({ json: true });
      success('Done', { extra: 'data' });

      assert.strictEqual(consoleLogMock.mock.calls.length, 1);
      let output = JSON.parse(consoleLogMock.mock.calls[0].arguments[0]);
      assert.strictEqual(output.status, 'success');
      assert.strictEqual(output.message, 'Done');
      assert.strictEqual(output.extra, 'data');
    });

    it('is suppressed in silent mode', () => {
      configure({ silent: true });
      success('Done');

      assert.strictEqual(consoleLogMock.mock.calls.length, 0);
      assert.strictEqual(consoleErrorMock.mock.calls.length, 0);
    });
  });

  describe('result', () => {
    it('outputs result with elapsed time', () => {
      result('5 screenshots captured');

      assert.ok(consoleErrorMock.mock.calls.length >= 1);
      let lastCall =
        consoleErrorMock.mock.calls[consoleErrorMock.mock.calls.length - 1];
      let output = lastCall.arguments.join(' ');
      assert.ok(output.includes('5 screenshots captured'));
      // Should include elapsed time indicator
      assert.ok(output.includes('·'));
    });

    it('outputs JSON in json mode', () => {
      configure({ json: true });
      result('Done');

      let output = JSON.parse(consoleLogMock.mock.calls[0].arguments[0]);
      assert.strictEqual(output.status, 'complete');
      assert.strictEqual(output.message, 'Done');
      assert.ok(output.elapsed);
    });
  });

  describe('diffBar', () => {
    it('returns colored bar for low percentage', () => {
      let bar = diffBar(0.5);

      assert.ok(bar.includes('█'));
      assert.ok(bar.includes('░'));
    });

    it('returns colored bar for medium percentage', () => {
      let bar = diffBar(3);

      assert.ok(bar.includes('█'));
    });

    it('returns colored bar for high percentage', () => {
      let bar = diffBar(15);

      assert.ok(bar.includes('█'));
    });

    it('respects custom width', () => {
      let bar = diffBar(50, 20);

      // Should have ~10 filled + 10 empty = ~20 total characters (without ANSI)
      assert.strictEqual(stripAnsi(bar).length, 20);
    });

    it('ensures at least 1 filled block for non-zero', () => {
      let bar = diffBar(0.001, 10);

      assert.ok(bar.includes('█'));
    });

    it('returns empty string in json mode', () => {
      configure({ json: true });
      let bar = diffBar(50);

      assert.strictEqual(bar, '');
    });

    it('returns empty string in silent mode', () => {
      configure({ silent: true });
      let bar = diffBar(50);

      assert.strictEqual(bar, '');
    });
  });

  describe('progressBar', () => {
    it('returns gradient bar', () => {
      let bar = progressBar(50, 100);

      assert.ok(bar.includes('█'));
      assert.ok(bar.includes('░'));
    });

    it('respects custom width', () => {
      let bar = progressBar(50, 100, 10);

      assert.strictEqual(stripAnsi(bar).length, 10);
    });

    it('handles 0% progress', () => {
      let bar = progressBar(0, 100, 10);

      assert.ok(stripAnsi(bar).includes('░'));
    });

    it('handles 100% progress', () => {
      let bar = progressBar(100, 100, 10);

      assert.ok(bar.includes('█'));
    });

    it('clamps to 100%', () => {
      let bar = progressBar(150, 100, 10);

      assert.strictEqual(stripAnsi(bar).length, 10);
    });

    it('accepts custom colors', () => {
      let bar = progressBar(50, 100, 10, {
        from: '#FF0000',
        to: '#00FF00',
      });

      assert.ok(bar.includes('█'));
    });

    it('returns empty string in json mode', () => {
      configure({ json: true });
      let bar = progressBar(50, 100);

      assert.strictEqual(bar, '');
    });
  });

  describe('badge', () => {
    it('creates success badge', () => {
      let b = badge('READY', 'success');

      assert.ok(b.includes('READY'));
    });

    it('creates warning badge', () => {
      let b = badge('PENDING', 'warning');

      assert.ok(b.includes('PENDING'));
    });

    it('creates error badge', () => {
      let b = badge('FAIL', 'error');

      assert.ok(b.includes('FAIL'));
    });

    it('creates info badge by default', () => {
      let b = badge('INFO');

      assert.ok(b.includes('INFO'));
    });

    it('returns plain text in json mode', () => {
      configure({ json: true });
      let b = badge('TEST', 'success');

      assert.strictEqual(b, 'TEST');
    });

    it('returns plain text in silent mode', () => {
      configure({ silent: true });
      let b = badge('TEST', 'success');

      assert.strictEqual(b, 'TEST');
    });
  });

  describe('statusDot', () => {
    it('creates success dot', () => {
      let dot = statusDot('success');

      assert.ok(dot.includes('●'));
    });

    it('creates warning dot', () => {
      let dot = statusDot('warning');

      assert.ok(dot.includes('●'));
    });

    it('creates error dot', () => {
      let dot = statusDot('error');

      assert.ok(dot.includes('●'));
    });

    it('creates info dot by default', () => {
      let dot = statusDot();

      assert.ok(dot.includes('●'));
    });

    it('returns plain dot in json mode', () => {
      configure({ json: true });
      let dot = statusDot('success');

      assert.strictEqual(dot, '●');
    });
  });

  describe('link', () => {
    it('formats URL with styling', () => {
      let l = link('Docs', 'https://docs.vizzly.dev');

      assert.ok(l.includes('https://docs.vizzly.dev'));
    });

    it('returns plain URL in json mode', () => {
      configure({ json: true });
      let l = link('Docs', 'https://docs.vizzly.dev');

      assert.strictEqual(l, 'https://docs.vizzly.dev');
    });

    it('returns empty string in silent mode', () => {
      configure({ silent: true });
      let l = link('Docs', 'https://docs.vizzly.dev');

      assert.strictEqual(l, '');
    });
  });

  describe('labelValue', () => {
    it('prints label and value', () => {
      labelValue('Status', 'Running');

      assert.strictEqual(consoleLogMock.mock.calls.length, 1);
      let output = consoleLogMock.mock.calls[0].arguments[0];
      assert.ok(output.includes('Status:'));
      assert.ok(output.includes('Running'));
    });

    it('respects custom indent', () => {
      labelValue('Key', 'Value', { indent: 4 });

      let output = consoleLogMock.mock.calls[0].arguments[0];
      assert.ok(output.startsWith('    ')); // 4 spaces
    });

    it('is suppressed in json mode', () => {
      configure({ json: true });
      labelValue('Key', 'Value');

      assert.strictEqual(consoleLogMock.mock.calls.length, 0);
    });

    it('is suppressed in silent mode', () => {
      configure({ silent: true });
      labelValue('Key', 'Value');

      assert.strictEqual(consoleLogMock.mock.calls.length, 0);
    });
  });

  describe('hint', () => {
    it('prints hint text', () => {
      hint('Try running vizzly init');

      assert.strictEqual(consoleLogMock.mock.calls.length, 1);
      let output = consoleLogMock.mock.calls[0].arguments[0];
      assert.ok(output.includes('Try running vizzly init'));
    });

    it('respects custom indent', () => {
      hint('Hint text', { indent: 4 });

      let output = consoleLogMock.mock.calls[0].arguments[0];
      assert.ok(output.startsWith('    '));
    });

    it('is suppressed in json mode', () => {
      configure({ json: true });
      hint('Hint');

      assert.strictEqual(consoleLogMock.mock.calls.length, 0);
    });
  });

  describe('list', () => {
    it('prints list items with bullets', () => {
      list(['Item 1', 'Item 2', 'Item 3']);

      assert.strictEqual(consoleLogMock.mock.calls.length, 3);
      assert.ok(consoleLogMock.mock.calls[0].arguments[0].includes('Item 1'));
      assert.ok(consoleLogMock.mock.calls[1].arguments[0].includes('Item 2'));
      assert.ok(consoleLogMock.mock.calls[2].arguments[0].includes('Item 3'));
    });

    it('uses success style', () => {
      list(['Done'], { style: 'success' });

      let output = consoleLogMock.mock.calls[0].arguments[0];
      assert.ok(output.includes('✓'));
    });

    it('uses warning style', () => {
      list(['Warning'], { style: 'warning' });

      let output = consoleLogMock.mock.calls[0].arguments[0];
      assert.ok(output.includes('!'));
    });

    it('uses error style', () => {
      list(['Error'], { style: 'error' });

      let output = consoleLogMock.mock.calls[0].arguments[0];
      assert.ok(output.includes('✗'));
    });

    it('respects custom indent', () => {
      list(['Item'], { indent: 4 });

      let output = consoleLogMock.mock.calls[0].arguments[0];
      assert.ok(output.startsWith('    '));
    });

    it('is suppressed in json mode', () => {
      configure({ json: true });
      list(['Item']);

      assert.strictEqual(consoleLogMock.mock.calls.length, 0);
    });
  });

  describe('complete', () => {
    it('prints completion message with checkmark', () => {
      complete('Task finished');

      assert.strictEqual(consoleLogMock.mock.calls.length, 1);
      let output = consoleLogMock.mock.calls[0].arguments[0];
      assert.ok(output.includes('✓'));
      assert.ok(output.includes('Task finished'));
    });

    it('includes detail when provided', () => {
      complete('Done', { detail: 'in 2.3s' });

      let output = consoleLogMock.mock.calls[0].arguments[0];
      assert.ok(output.includes('Done'));
      assert.ok(output.includes('in 2.3s'));
    });

    it('outputs JSON in json mode', () => {
      configure({ json: true });
      complete('Done', { detail: 'extra' });

      let output = JSON.parse(consoleLogMock.mock.calls[0].arguments[0]);
      assert.strictEqual(output.status, 'complete');
      assert.strictEqual(output.message, 'Done');
      assert.strictEqual(output.detail, 'extra');
    });

    it('is suppressed in silent mode', () => {
      configure({ silent: true });
      complete('Done');

      assert.strictEqual(consoleLogMock.mock.calls.length, 0);
    });
  });

  describe('keyValue', () => {
    it('prints key-value pairs', () => {
      keyValue({ Name: 'Vizzly', Version: '1.0.0' });

      assert.strictEqual(consoleLogMock.mock.calls.length, 2);
      assert.ok(consoleLogMock.mock.calls[0].arguments[0].includes('Name'));
      assert.ok(consoleLogMock.mock.calls[0].arguments[0].includes('Vizzly'));
      assert.ok(consoleLogMock.mock.calls[1].arguments[0].includes('Version'));
    });

    it('skips null and undefined values', () => {
      keyValue({ Name: 'Test', Empty: null, Missing: undefined });

      assert.strictEqual(consoleLogMock.mock.calls.length, 1);
      assert.ok(consoleLogMock.mock.calls[0].arguments[0].includes('Name'));
    });

    it('respects custom indent and keyWidth', () => {
      keyValue({ Key: 'Value' }, { indent: 4, keyWidth: 20 });

      let output = consoleLogMock.mock.calls[0].arguments[0];
      assert.ok(output.startsWith('    '));
    });

    it('is suppressed in json mode', () => {
      configure({ json: true });
      keyValue({ Key: 'Value' });

      assert.strictEqual(consoleLogMock.mock.calls.length, 0);
    });
  });

  describe('divider', () => {
    it('prints divider line', () => {
      divider();

      assert.strictEqual(consoleLogMock.mock.calls.length, 1);
      let output = consoleLogMock.mock.calls[0].arguments[0];
      assert.ok(output.includes('─'));
    });

    it('respects custom width', () => {
      divider({ width: 20 });

      let output = consoleLogMock.mock.calls[0].arguments[0];
      assert.strictEqual(stripAnsi(output).length, 20);
    });

    it('respects custom character', () => {
      divider({ char: '=' });

      let output = consoleLogMock.mock.calls[0].arguments[0];
      assert.ok(output.includes('='));
    });

    it('is suppressed in json mode', () => {
      configure({ json: true });
      divider();

      assert.strictEqual(consoleLogMock.mock.calls.length, 0);
    });
  });

  describe('box', () => {
    it('creates box with single line content', () => {
      let b = box('Hello World');

      assert.ok(b.includes('╭'));
      assert.ok(b.includes('╰'));
      assert.ok(b.includes('│'));
      assert.ok(b.includes('Hello World'));
    });

    it('creates box with multiple lines', () => {
      let b = box(['Line 1', 'Line 2']);

      assert.ok(b.includes('Line 1'));
      assert.ok(b.includes('Line 2'));
    });

    it('includes title when provided', () => {
      let b = box('Content', { title: 'Info' });

      assert.ok(b.includes('Info'));
      assert.ok(b.includes('Content'));
    });

    it('uses branded style', () => {
      let b = box('Content', { style: 'branded' });

      assert.ok(b.includes('╭'));
      assert.ok(b.includes('Content'));
    });

    it('returns empty string in json mode', () => {
      configure({ json: true });
      let b = box('Content');

      assert.strictEqual(b, '');
    });

    it('returns empty string in silent mode', () => {
      configure({ silent: true });
      let b = box('Content');

      assert.strictEqual(b, '');
    });
  });

  describe('printBox', () => {
    it('prints box to stderr', () => {
      printBox('Content');

      assert.strictEqual(consoleErrorMock.mock.calls.length, 1);
      let output = consoleErrorMock.mock.calls[0].arguments[0];
      assert.ok(output.includes('Content'));
    });

    it('is suppressed in json mode', () => {
      configure({ json: true });
      printBox('Content');

      assert.strictEqual(consoleErrorMock.mock.calls.length, 0);
    });

    it('is suppressed in silent mode', () => {
      configure({ silent: true });
      printBox('Content');

      assert.strictEqual(consoleErrorMock.mock.calls.length, 0);
    });
  });

  describe('printErr', () => {
    it('prints to stderr', () => {
      printErr('Error message');

      assert.strictEqual(consoleErrorMock.mock.calls.length, 1);
      assert.strictEqual(
        consoleErrorMock.mock.calls[0].arguments[0],
        'Error message'
      );
    });

    it('is suppressed in silent mode', () => {
      configure({ silent: true });
      printErr('Error');

      assert.strictEqual(consoleErrorMock.mock.calls.length, 0);
    });
  });
});
