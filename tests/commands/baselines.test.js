import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  baselinesCommand,
  createBaselineList,
  createBaselineNameMatcher,
  formatBytes,
  getFilename,
  getViewport,
  validateBaselinesOptions,
} from '../../src/commands/baselines.js';

function createMockOutput() {
  let calls = [];
  return {
    calls,
    configure: opts => calls.push({ method: 'configure', args: [opts] }),
    data: obj => calls.push({ method: 'data', args: [obj] }),
    header: command => calls.push({ method: 'header', args: [command] }),
    keyValue: values => calls.push({ method: 'keyValue', args: [values] }),
    labelValue: (label, value) =>
      calls.push({ method: 'labelValue', args: [label, value] }),
    print: message => calls.push({ method: 'print', args: [message] }),
    blank: () => calls.push({ method: 'blank', args: [] }),
    hint: message => calls.push({ method: 'hint', args: [message] }),
    warn: message => calls.push({ method: 'warn', args: [message] }),
    error: (message, error) =>
      calls.push({ method: 'error', args: [message, error] }),
    cleanup: () => calls.push({ method: 'cleanup', args: [] }),
    getColors: () => ({
      dim: value => value,
      brand: {
        success: value => value,
        warning: value => value,
      },
    }),
  };
}

function createWorkspace() {
  let root = mkdtempSync(join(tmpdir(), 'vizzly-baselines-'));
  let vizzlyDir = join(root, '.vizzly');
  let baselinesDir = join(vizzlyDir, 'baselines');
  mkdirSync(baselinesDir, { recursive: true });

  return {
    root,
    baselinesDir,
    dispose: () => rmSync(root, { recursive: true, force: true }),
  };
}

function writeBaselineFixture(workspace) {
  writeFileSync(join(workspace.baselinesDir, 'button-home.png'), 'png');
  writeFileSync(join(workspace.baselinesDir, 'dialog-[special].png'), 'png');

  writeFileSync(
    join(workspace.baselinesDir, 'metadata.json'),
    JSON.stringify({
      buildId: 'build-1',
      buildName: 'Local Build',
      branch: 'feature/baselines',
      threshold: 1.5,
      createdAt: '2026-05-18T00:00:00.000Z',
      screenshots: [
        {
          name: 'Button Home',
          signature: 'sig-button',
          filename: 'button-home.png',
          sha256: 'abc1234567890abcdef',
          viewport: { width: 1280, height: 720 },
          browser: 'firefox',
          createdAt: '2026-05-18T00:00:01.000Z',
        },
        {
          name: 'Dialog [Special]',
          signature: 'sig-dialog',
          filename: 'dialog-[special].png',
          properties: { viewport_width: 390, viewport_height: 844 },
        },
      ],
    })
  );
}

describe('commands/baselines', () => {
  describe('validateBaselinesOptions', () => {
    it('returns no errors', () => {
      assert.deepStrictEqual(validateBaselinesOptions({}), []);
    });
  });

  describe('baseline helpers', () => {
    it('extracts filenames and viewport data from metadata variants', () => {
      assert.strictEqual(
        getFilename({ path: '/tmp/homepage.png' }),
        'homepage.png'
      );
      assert.deepStrictEqual(
        getViewport({
          properties: { viewport_width: 390, viewport_height: 844 },
        }),
        { width: 390, height: 844 }
      );
    });

    it('matches wildcard names without treating other characters as regex', () => {
      let wildcardMatcher = createBaselineNameMatcher('Button*');
      let bracketMatcher = createBaselineNameMatcher('[Special]');

      assert.equal(wildcardMatcher('Button Home'), true);
      assert.equal(wildcardMatcher('Dialog Home'), false);
      assert.equal(bracketMatcher('Dialog [Special]'), true);
    });

    it('builds JSON baseline entries with file details', () => {
      let baselines = createBaselineList({
        baselinesDir: '/tmp/baselines',
        baselineFiles: [
          {
            filename: 'home.png',
            path: '/tmp/baselines/home.png',
            size: 128,
          },
        ],
        screenshots: [
          { name: 'Home', signature: 'sig-home', filename: 'home.png' },
        ],
      });

      assert.deepStrictEqual(baselines, [
        {
          name: 'Home',
          signature: 'sig-home',
          filename: 'home.png',
          path: '/tmp/baselines/home.png',
          sha256: undefined,
          viewport: null,
          browser: null,
          createdAt: undefined,
          fileSize: 128,
        },
      ]);
    });

    it('keeps metadata-only screenshots without filenames readable', () => {
      let baselines = createBaselineList({
        baselinesDir: '/tmp/baselines',
        baselineFiles: [],
        screenshots: [{ name: 'Metadata Only', signature: 'sig-metadata' }],
      });

      assert.strictEqual(baselines[0].filename, null);
      assert.strictEqual(baselines[0].path, null);
    });

    it('formats file sizes for users', () => {
      assert.strictEqual(formatBytes(512), '512 B');
      assert.strictEqual(formatBytes(1536), '1.5 KB');
      assert.strictEqual(formatBytes(2 * 1024 * 1024), '2.0 MB');
    });
  });

  describe('baselinesCommand', () => {
    it('returns empty JSON when no local baselines exist', async () => {
      let workspace = mkdtempSync(join(tmpdir(), 'vizzly-baselines-empty-'));
      let output = createMockOutput();

      try {
        await baselinesCommand(
          {},
          { json: true },
          {
            cwd: () => workspace,
            output,
          }
        );
      } finally {
        rmSync(workspace, { recursive: true, force: true });
      }

      let dataCall = output.calls.find(call => call.method === 'data');
      assert.deepStrictEqual(dataCall.args[0], {
        baselines: [],
        count: 0,
        error: 'No .vizzly directory found',
      });
    });

    it('lists local baselines as JSON with metadata and file sizes', async () => {
      let workspace = createWorkspace();
      let output = createMockOutput();
      writeBaselineFixture(workspace);

      try {
        await baselinesCommand(
          {},
          { json: true },
          {
            cwd: () => workspace.root,
            output,
          }
        );
      } finally {
        workspace.dispose();
      }

      let dataCall = output.calls.find(call => call.method === 'data');
      assert.strictEqual(dataCall.args[0].count, 2);
      assert.strictEqual(dataCall.args[0].metadata.buildName, 'Local Build');
      assert.strictEqual(dataCall.args[0].baselines[0].name, 'Button Home');
      assert.strictEqual(dataCall.args[0].baselines[0].fileSize, 3);
    });

    it('filters baselines by literal wildcard pattern', async () => {
      let workspace = createWorkspace();
      let output = createMockOutput();
      writeBaselineFixture(workspace);

      try {
        await baselinesCommand(
          { name: '[Special]' },
          { json: true },
          {
            cwd: () => workspace.root,
            output,
          }
        );
      } finally {
        workspace.dispose();
      }

      let dataCall = output.calls.find(call => call.method === 'data');
      assert.strictEqual(dataCall.args[0].count, 1);
      assert.strictEqual(
        dataCall.args[0].baselines[0].name,
        'Dialog [Special]'
      );
    });

    it('prints exact-match threshold metadata without falling back to default', async () => {
      let workspace = createWorkspace();
      let output = createMockOutput();
      writeBaselineFixture(workspace);
      writeFileSync(
        join(workspace.baselinesDir, 'metadata.json'),
        JSON.stringify({
          buildId: 'build-1',
          buildName: 'Local Build',
          branch: 'local',
          threshold: 0,
          screenshots: [],
        })
      );

      try {
        await baselinesCommand(
          {},
          {},
          {
            cwd: () => workspace.root,
            output,
          }
        );
      } finally {
        workspace.dispose();
      }

      let thresholdCall = output.calls.find(
        call => call.method === 'labelValue' && call.args[0] === 'Threshold'
      );
      assert.deepStrictEqual(thresholdCall.args, ['Threshold', '0 CIEDE2000']);
    });

    it('returns detailed baseline info by name', async () => {
      let workspace = createWorkspace();
      let output = createMockOutput();
      writeBaselineFixture(workspace);

      try {
        await baselinesCommand(
          { info: 'Button Home' },
          { json: true },
          {
            cwd: () => workspace.root,
            output,
          }
        );
      } finally {
        workspace.dispose();
      }

      let dataCall = output.calls.find(call => call.method === 'data');
      assert.strictEqual(dataCall.args[0].name, 'Button Home');
      assert.deepStrictEqual(dataCall.args[0].viewport, {
        width: 1280,
        height: 720,
      });
      assert.strictEqual(dataCall.args[0].fileSize, 3);
    });

    it('exits with status 1 when requested baseline info is missing', async () => {
      let workspace = createWorkspace();
      let output = createMockOutput();
      let exitCode = null;
      writeBaselineFixture(workspace);

      try {
        await baselinesCommand(
          { info: 'Missing' },
          {},
          {
            cwd: () => workspace.root,
            output,
            exit: code => {
              exitCode = code;
            },
          }
        );
      } finally {
        workspace.dispose();
      }

      assert.strictEqual(exitCode, 1);
      assert.ok(output.calls.some(call => call.method === 'error'));
      assert.ok(output.calls.some(call => call.method === 'cleanup'));
    });
  });
});
