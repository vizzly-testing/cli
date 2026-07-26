import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { runCLI } from '../helpers/cli-runner.js';

let PRODUCTION_API_URL = 'https://app.vizzly.dev';
let LOCAL_API_URL = 'http://localhost:3000';
let PRODUCTION_TOKEN = 'vzt_production_secret';
let LOCAL_TOKEN = 'vzt_local_secret';

function createWorkspace() {
  let cwd = mkdtempSync(join(tmpdir(), 'vizzly-cli-environment-'));
  let vizzlyHome = join(cwd, '.vizzly-home');
  mkdirSync(vizzlyHome, { recursive: true });
  return {
    cwd,
    vizzlyHome,
    configPath: join(vizzlyHome, 'config.json'),
  };
}

function createEnvironmentState() {
  let productionAccount = `${PRODUCTION_API_URL}|vizzly/frontend`;
  let localAccount = `${LOCAL_API_URL}|dogfood/app`;

  return {
    credentials: {
      [PRODUCTION_API_URL]: {
        projectLink: {
          active: productionAccount,
          links: {
            [productionAccount]: {
              apiUrl: PRODUCTION_API_URL,
              organizationSlug: 'vizzly',
              projectSlug: 'frontend',
              storage: 'file',
              token: PRODUCTION_TOKEN,
              tokenPrefix: 'vzt_prod',
            },
          },
        },
      },
      [LOCAL_API_URL]: {
        projectLink: {
          active: localAccount,
          links: {
            [localAccount]: {
              apiUrl: LOCAL_API_URL,
              organizationSlug: 'dogfood',
              projectSlug: 'app',
              storage: 'file',
              token: LOCAL_TOKEN,
              tokenPrefix: 'vzt_local',
            },
          },
        },
      },
    },
  };
}

function writeEnvironmentState(workspace) {
  writeFileSync(
    workspace.configPath,
    JSON.stringify(createEnvironmentState(), null, 2)
  );
}

function createEnv(workspace, overrides = {}) {
  return {
    VIZZLY_API_URL: undefined,
    VIZZLY_DISABLE_KEYCHAIN: 'true',
    VIZZLY_HOME: workspace.vizzlyHome,
    ...overrides,
  };
}

function parseData(stdout) {
  return JSON.parse(stdout).data;
}

describe('commands/environment CLI', () => {
  it('defaults to production without persisting a selection', async () => {
    let workspace = createWorkspace();
    let result = await runCLI(['--no-color', '--json', 'environment', 'show'], {
      cwd: workspace.cwd,
      env: createEnv(workspace),
    });

    assert.strictEqual(result.code, 0);
    assert.deepStrictEqual(parseData(result.stdout), {
      environment: {
        name: 'production',
        apiUrl: PRODUCTION_API_URL,
        origin: PRODUCTION_API_URL,
        source: 'default',
      },
      credential: {
        kind: 'none',
        tokenPrefix: null,
      },
      userAuthAvailable: false,
      linkedProject: null,
    });
    let persisted = JSON.parse(readFileSync(workspace.configPath, 'utf8'));
    assert.strictEqual(persisted.environment, undefined);
  });

  it('switches API and project credentials together in one VIZZLY_HOME', async () => {
    let workspace = createWorkspace();
    writeEnvironmentState(workspace);
    let env = createEnv(workspace);

    let production = await runCLI(
      ['--no-color', '--json', 'environment', 'show'],
      { cwd: workspace.cwd, env }
    );
    let local = await runCLI(
      ['--no-color', '--json', 'environment', 'use', 'local'],
      { cwd: workspace.cwd, env }
    );
    let localHuman = await runCLI(['--no-color', 'environment', 'show'], {
      cwd: workspace.cwd,
      env,
    });
    let productionAgain = await runCLI(
      ['--no-color', '--json', 'environment', 'use', 'production'],
      { cwd: workspace.cwd, env }
    );

    let productionStatus = parseData(production.stdout);
    let localStatus = parseData(local.stdout);
    let productionAgainStatus = parseData(productionAgain.stdout);
    assert.strictEqual(productionStatus.environment.name, 'production');
    assert.strictEqual(productionStatus.credential.tokenPrefix, 'vzt_prod');
    assert.deepStrictEqual(productionStatus.linkedProject, {
      organization: 'vizzly',
      project: 'frontend',
      storage: 'file',
    });
    assert.strictEqual(localStatus.changed, true);
    assert.strictEqual(localStatus.environment.name, 'local');
    assert.strictEqual(localStatus.environment.apiUrl, LOCAL_API_URL);
    assert.strictEqual(localStatus.credential.tokenPrefix, 'vzt_local');
    assert.deepStrictEqual(localStatus.linkedProject, {
      organization: 'dogfood',
      project: 'app',
      storage: 'file',
    });
    assert.match(localHuman.stdout, /Token prefix\s+vzt_local/);
    assert.match(localHuman.stdout, /dogfood\/app/);
    assert.strictEqual(productionAgainStatus.environment.name, 'production');
    assert.strictEqual(
      productionAgainStatus.credential.tokenPrefix,
      'vzt_prod'
    );

    let persisted = JSON.parse(readFileSync(workspace.configPath, 'utf8'));
    assert.strictEqual(persisted.environment.active, 'production');
    assert.deepStrictEqual(
      persisted.credentials,
      createEnvironmentState().credentials
    );

    let output = [
      production.stdout,
      local.stdout,
      localHuman.stdout,
      productionAgain.stdout,
    ].join('\n');
    assert.ok(!output.includes(PRODUCTION_TOKEN));
    assert.ok(!output.includes(LOCAL_TOKEN));
  });

  it('reports the same safe credential facts from environment, config, and doctor', async () => {
    let workspace = createWorkspace();
    let state = {
      ...createEnvironmentState(),
      environment: { active: 'local' },
    };
    writeFileSync(workspace.configPath, JSON.stringify(state, null, 2));
    let env = createEnv(workspace);

    let environment = parseData(
      (
        await runCLI(['--no-color', '--json', 'environment', 'show'], {
          cwd: workspace.cwd,
          env,
        })
      ).stdout
    );
    let config = parseData(
      (
        await runCLI(['--no-color', '--json', 'config'], {
          cwd: workspace.cwd,
          env,
        })
      ).stdout
    ).config;
    let doctor = parseData(
      (
        await runCLI(['--no-color', '--json', 'doctor'], {
          cwd: workspace.cwd,
          env,
        })
      ).stdout
    ).diagnostics.configuration;

    assert.deepStrictEqual(environment.credential, {
      kind: 'linked-project',
      tokenPrefix: 'vzt_local',
    });
    assert.deepStrictEqual(config.credential, environment.credential);
    assert.strictEqual(config.api.tokenPrefix, 'vzt_local');
    assert.strictEqual(config.environment.name, 'local');
    assert.strictEqual(doctor.environment, 'local');
    assert.strictEqual(doctor.origin, LOCAL_API_URL);
    assert.strictEqual(doctor.credentialKind, 'linked-project');
    assert.strictEqual(doctor.tokenPrefix, 'vzt_local');
  });

  it('does not persist a selection hidden by VIZZLY_API_URL', async () => {
    let workspace = createWorkspace();
    let result = await runCLI(['--no-color', 'environment', 'use', 'local'], {
      cwd: workspace.cwd,
      env: createEnv(workspace, {
        VIZZLY_API_URL: 'https://preview.example.test',
      }),
    });

    assert.strictEqual(result.code, 1);
    assert.match(result.stderr, /Clear VIZZLY_API_URL/);
    if (existsSync(workspace.configPath)) {
      let persisted = JSON.parse(readFileSync(workspace.configPath, 'utf8'));
      assert.strictEqual(persisted.environment, undefined);
    }
  });
});
