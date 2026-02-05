import assert from 'node:assert';
import { describe, it } from 'node:test';
import {
  configCommand,
  validateConfigOptions,
} from '../../src/commands/config-cmd.js';

/**
 * Create mock output object that tracks calls
 */
function createMockOutput() {
  let calls = [];
  return {
    calls,
    configure: opts => calls.push({ method: 'configure', args: [opts] }),
    error: (msg, err) => calls.push({ method: 'error', args: [msg, err] }),
    header: (cmd, mode) => calls.push({ method: 'header', args: [cmd, mode] }),
    print: msg => calls.push({ method: 'print', args: [msg] }),
    blank: () => calls.push({ method: 'blank', args: [] }),
    hint: msg => calls.push({ method: 'hint', args: [msg] }),
    labelValue: (label, value) =>
      calls.push({ method: 'labelValue', args: [label, value] }),
    cleanup: () => calls.push({ method: 'cleanup', args: [] }),
    data: obj => calls.push({ method: 'data', args: [obj] }),
  };
}

describe('commands/config', () => {
  describe('validateConfigOptions', () => {
    it('returns no errors', () => {
      let errors = validateConfigOptions({});
      assert.deepStrictEqual(errors, []);
    });
  });

  describe('configCommand', () => {
    it('outputs full config as JSON', async () => {
      let output = createMockOutput();

      await configCommand(
        null,
        {},
        { json: true },
        {
          loadConfig: async () => ({
            server: { port: 47392, timeout: 30000 },
            comparison: { threshold: 2.0 },
            tdd: { openReport: false },
          }),
          getProjectMapping: async () => null,
          output,
          exit: () => {},
        }
      );

      let dataCall = output.calls.find(c => c.method === 'data');
      assert.ok(dataCall);
      assert.strictEqual(dataCall.args[0].config.server.port, 47392);
      assert.strictEqual(dataCall.args[0].config.comparison.threshold, 2.0);
    });

    it('outputs specific key as JSON', async () => {
      let output = createMockOutput();

      await configCommand(
        'comparison.threshold',
        {},
        { json: true },
        {
          loadConfig: async () => ({
            server: { port: 47392 },
            comparison: { threshold: 2.5 },
          }),
          getProjectMapping: async () => null,
          output,
          exit: () => {},
        }
      );

      let dataCall = output.calls.find(c => c.method === 'data');
      assert.ok(dataCall);
      assert.strictEqual(dataCall.args[0].key, 'comparison.threshold');
      assert.strictEqual(dataCall.args[0].value, 2.5);
    });

    it('returns error for unknown key', async () => {
      let output = createMockOutput();
      let exitCode = null;

      await configCommand(
        'unknown.key',
        {},
        { json: true },
        {
          loadConfig: async () => ({
            server: { port: 47392 },
          }),
          getProjectMapping: async () => null,
          output,
          exit: code => {
            exitCode = code;
          },
        }
      );

      assert.strictEqual(exitCode, 1);
      assert.ok(output.calls.some(c => c.method === 'error'));
    });

    it('includes project mapping if available', async () => {
      let output = createMockOutput();

      await configCommand(
        null,
        {},
        { json: true },
        {
          loadConfig: async () => ({
            server: { port: 47392 },
          }),
          getProjectMapping: async () => ({
            projectName: 'My Project',
            projectSlug: 'my-project',
            organizationSlug: 'my-org',
          }),
          output,
          exit: () => {},
        }
      );

      let dataCall = output.calls.find(c => c.method === 'data');
      assert.ok(dataCall);
      assert.deepStrictEqual(dataCall.args[0].project, {
        name: 'My Project',
        slug: 'my-project',
        organization: 'my-org',
      });
    });

    it('includes config file path', async () => {
      let output = createMockOutput();

      await configCommand(
        null,
        {},
        { json: true },
        {
          loadConfig: async () => ({
            _configPath: '/path/to/vizzly.config.js',
            server: { port: 47392 },
          }),
          getProjectMapping: async () => null,
          output,
          exit: () => {},
        }
      );

      let dataCall = output.calls.find(c => c.method === 'data');
      assert.ok(dataCall);
      assert.strictEqual(
        dataCall.args[0].configFile,
        '/path/to/vizzly.config.js'
      );
    });

    it('masks API token in output', async () => {
      let output = createMockOutput();

      await configCommand(
        null,
        {},
        { json: true },
        {
          loadConfig: async () => ({
            apiKey: 'vzt_supersecrettoken12345',
            apiUrl: 'https://api.vizzly.dev',
            server: { port: 47392 },
          }),
          getProjectMapping: async () => null,
          output,
          exit: () => {},
        }
      );

      let dataCall = output.calls.find(c => c.method === 'data');
      assert.ok(dataCall);
      assert.strictEqual(dataCall.args[0].config.api.tokenConfigured, true);
      assert.strictEqual(
        dataCall.args[0].config.api.tokenPrefix,
        'vzt_supe...'
      );
      // Ensure full token is not exposed
      assert.ok(
        !JSON.stringify(dataCall.args[0]).includes('supersecrettoken12345')
      );
    });
  });
});
