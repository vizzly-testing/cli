import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createDoctorDiagnostics,
  doctorCommand,
  getApiUrlCheck,
  getNodeVersionCheck,
  getThresholdCheck,
  validateDoctorOptions,
} from '../../src/commands/doctor.js';

function createMockOutput() {
  let calls = [];
  return {
    calls,
    configure: opts => calls.push({ method: 'configure', args: [opts] }),
    data: value => calls.push({ method: 'data', args: [value] }),
    error: (message, error) =>
      calls.push({ method: 'error', args: [message, error] }),
    header: (command, mode) =>
      calls.push({ method: 'header', args: [command, mode] }),
    printErr: message => calls.push({ method: 'printErr', args: [message] }),
    startSpinner: message =>
      calls.push({ method: 'startSpinner', args: [message] }),
    stopSpinner: () => calls.push({ method: 'stopSpinner', args: [] }),
    warn: message => calls.push({ method: 'warn', args: [message] }),
    cleanup: () => calls.push({ method: 'cleanup', args: [] }),
    getColors: () => ({
      brand: {
        success: value => value,
        danger: value => value,
        error: value => value,
        info: value => value,
        textTertiary: value => value,
        textMuted: value => value,
      },
      cyan: value => value,
      dim: value => value,
      gray: value => value,
      green: value => value,
      info: value => value,
      success: value => value,
      underline: value => value,
      white: value => value,
      yellow: value => value,
    }),
  };
}

let validConfig = {
  apiUrl: 'https://api.example.test',
  apiKey: 'token-123',
  comparison: { threshold: 2 },
  server: { port: 47888 },
};

describe('commands/doctor', () => {
  describe('validateDoctorOptions', () => {
    it('returns no errors', () => {
      assert.deepStrictEqual(validateDoctorOptions({}), []);
    });
  });

  describe('diagnostic helpers', () => {
    it('creates the default diagnostics shape', () => {
      assert.deepStrictEqual(createDoctorDiagnostics(), {
        environment: {
          nodeVersion: null,
          nodeVersionValid: null,
        },
        configuration: {
          apiUrl: null,
          apiUrlValid: null,
          threshold: null,
          thresholdValid: null,
          port: null,
        },
        connectivity: {
          checked: false,
          ok: null,
          error: null,
        },
      });
    });

    it('requires Node 22 or newer', () => {
      let unsupported = getNodeVersionCheck('v21.9.0');
      let supported = getNodeVersionCheck('v22.0.0');
      let supportedWithoutPrefix = getNodeVersionCheck('22.1.0');

      assert.strictEqual(unsupported.check.ok, false);
      assert.match(unsupported.check.value, />= 22/);
      assert.strictEqual(supported.check.ok, true);
      assert.strictEqual(supportedWithoutPrefix.check.ok, true);
    });

    it('reports malformed Node versions as unsupported', () => {
      let result = getNodeVersionCheck('v22abc');

      assert.strictEqual(result.check.ok, false);
      assert.strictEqual(result.diagnostic.nodeVersionValid, false);
      assert.match(result.check.value, /unrecognized/);
    });

    it('accepts only HTTP API URLs', () => {
      assert.strictEqual(getApiUrlCheck('https://api.test').apiUrlValid, true);
      assert.strictEqual(getApiUrlCheck('http://api.test').apiUrlValid, true);
      assert.strictEqual(
        getApiUrlCheck('file:///tmp/vizzly').apiUrlValid,
        false
      );
      assert.strictEqual(getApiUrlCheck('not a url').apiUrlValid, false);
    });

    it('accepts non-negative CIEDE2000 thresholds', () => {
      assert.deepStrictEqual(getThresholdCheck(2), {
        threshold: 2,
        thresholdValid: true,
        check: {
          name: 'Threshold',
          value: '2 (CIEDE2000)',
          ok: true,
        },
      });
      assert.strictEqual(getThresholdCheck(-1).thresholdValid, false);
      assert.strictEqual(getThresholdCheck('nope').thresholdValid, false);
    });
  });

  describe('doctorCommand', () => {
    it('reports local diagnostics as JSON without API connectivity', async () => {
      let output = createMockOutput();

      await doctorCommand(
        {},
        { json: true },
        {
          getApiToken: () => null,
          loadConfig: async () => validConfig,
          nodeVersion: 'v22.2.0',
          output,
        }
      );

      let dataCall = output.calls.find(call => call.method === 'data');
      assert.strictEqual(dataCall.args[0].passed, true);
      assert.strictEqual(
        dataCall.args[0].diagnostics.environment.nodeVersionValid,
        true
      );
      assert.strictEqual(
        dataCall.args[0].diagnostics.connectivity.checked,
        false
      );
      assert.ok(output.calls.some(call => call.method === 'cleanup'));
    });

    it('checks API connectivity when requested', async () => {
      let output = createMockOutput();
      let capturedClientOptions = null;
      let capturedBuildOptions = null;

      await doctorCommand(
        { api: true },
        { json: true },
        {
          createApiClient: options => {
            capturedClientOptions = options;
            return { kind: 'client' };
          },
          getApiToken: () => null,
          getBuilds: async (_client, options) => {
            capturedBuildOptions = options;
            return { builds: [] };
          },
          loadConfig: async () => validConfig,
          nodeVersion: 'v22.2.0',
          output,
        }
      );

      assert.deepStrictEqual(capturedClientOptions, {
        baseUrl: 'https://api.example.test',
        token: 'token-123',
        command: 'doctor',
      });
      assert.deepStrictEqual(capturedBuildOptions, { limit: 1 });

      let dataCall = output.calls.find(call => call.method === 'data');
      assert.strictEqual(
        dataCall.args[0].diagnostics.connectivity.checked,
        true
      );
      assert.strictEqual(dataCall.args[0].diagnostics.connectivity.ok, true);
    });

    it('fails when API connectivity is requested without a token', async () => {
      let output = createMockOutput();
      let exitCode = null;

      await doctorCommand(
        { api: true },
        { json: true },
        {
          getApiToken: () => null,
          loadConfig: async () => ({ ...validConfig, apiKey: null }),
          nodeVersion: 'v22.2.0',
          output,
          exit: code => {
            exitCode = code;
          },
        }
      );

      assert.strictEqual(exitCode, 1);
      let dataCall = output.calls.find(call => call.method === 'data');
      assert.strictEqual(dataCall.args[0].passed, false);
      assert.strictEqual(
        dataCall.args[0].diagnostics.connectivity.error,
        'Missing API token (VIZZLY_TOKEN)'
      );
    });

    it('prints human-readable diagnostics and context', async () => {
      let output = createMockOutput();

      await doctorCommand(
        {},
        {},
        {
          getApiToken: () => null,
          getContext: () => [
            { type: 'success', label: 'Logged in', value: 'rob@example.com' },
          ],
          loadConfig: async () => validConfig,
          nodeVersion: 'v22.2.0',
          output,
        }
      );

      assert.ok(
        output.calls.some(
          call => call.method === 'header' && call.args[1] === 'local'
        )
      );
      assert.ok(
        output.calls.some(
          call => call.method === 'printErr' && call.args[0].includes('Node.js')
        )
      );
      assert.ok(
        output.calls.some(
          call =>
            call.method === 'printErr' &&
            call.args[0].includes('rob@example.com')
        )
      );
    });

    it('exits with status 1 when local diagnostics fail', async () => {
      let output = createMockOutput();
      let exitCode = null;

      await doctorCommand(
        {},
        { json: true },
        {
          getApiToken: () => null,
          loadConfig: async () => ({
            ...validConfig,
            apiUrl: 'file:///tmp/vizzly',
            comparison: { threshold: -1 },
          }),
          nodeVersion: 'v21.9.0',
          output,
          exit: code => {
            exitCode = code;
          },
        }
      );

      assert.strictEqual(exitCode, 1);
      let dataCall = output.calls.find(call => call.method === 'data');
      assert.strictEqual(dataCall.args[0].passed, false);
      assert.strictEqual(
        dataCall.args[0].diagnostics.environment.nodeVersionValid,
        false
      );
      assert.strictEqual(
        dataCall.args[0].diagnostics.configuration.apiUrlValid,
        false
      );
      assert.strictEqual(
        dataCall.args[0].diagnostics.configuration.thresholdValid,
        false
      );
    });
  });
});
