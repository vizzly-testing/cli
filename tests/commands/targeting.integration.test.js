import assert from 'node:assert';
import { once } from 'node:events';
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createCLIRunner, parseJSONOutput } from '../helpers/cli-runner.js';

let __filename = fileURLToPath(import.meta.url);
let __dirname = dirname(__filename);
let FIXTURE_SCREENSHOT = join(
  __dirname,
  '../reporter/fixtures/images/screenshots/homepage-desktop.png'
);

let cleanupTasks = [];

afterEach(async () => {
  for (let task of cleanupTasks.reverse()) {
    await task();
  }
  cleanupTasks = [];
});

function createJsonResponse(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

async function readRequestBody(req) {
  let chunks = [];

  for await (let chunk of req) {
    chunks.push(Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

function createSdkStubServer() {
  let state = {
    buildRequests: [],
    shaRequests: [],
    uploadRequests: [],
    statusRequests: [],
    finalizeRequests: [],
    nextBuildId: 1,
    lastBuildId: null,
  };

  let server = createServer(async (req, res) => {
    let baseUrl = `http://${req.headers.host}`;
    let url = new URL(req.url, baseUrl);
    let bodyBuffer = await readRequestBody(req);
    let bodyText = bodyBuffer.toString('utf8');

    if (req.method === 'POST' && url.pathname === '/api/sdk/builds') {
      let body = JSON.parse(bodyText || '{}');
      let buildId = `build-${state.nextBuildId++}`;
      state.lastBuildId = buildId;
      state.buildRequests.push({
        headers: req.headers,
        body,
        buildId,
      });

      createJsonResponse(res, 201, {
        id: buildId,
        status: 'processing',
        projectSlug: 'web-app',
        organizationSlug: 'acme',
        url: `${baseUrl}/acme/web-app/builds/${buildId}`,
      });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/sdk/check-shas') {
      state.shaRequests.push({
        headers: req.headers,
        body: JSON.parse(bodyText || '{}'),
      });

      createJsonResponse(res, 200, {
        existing: [],
        missing: [],
        screenshots: [],
      });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/sdk/upload') {
      state.uploadRequests.push({
        headers: req.headers,
        bodyText: bodyBuffer.toString('latin1'),
      });

      createJsonResponse(res, 201, {
        build: {
          id: state.lastBuildId,
          url: `${baseUrl}/acme/web-app/builds/${state.lastBuildId}`,
        },
        count: 1,
      });
      return;
    }

    if (
      req.method === 'PUT' &&
      /^\/api\/sdk\/builds\/[^/]+\/status$/.test(url.pathname)
    ) {
      let buildId = url.pathname.split('/')[4];
      state.statusRequests.push({
        headers: req.headers,
        body: JSON.parse(bodyText || '{}'),
        buildId,
      });

      createJsonResponse(res, 200, {
        message: 'Build status updated successfully',
        build: {
          id: buildId,
          status: 'completed',
        },
      });
      return;
    }

    if (
      req.method === 'POST' &&
      /^\/api\/sdk\/parallel\/[^/]+\/finalize$/.test(url.pathname)
    ) {
      let parallelId = url.pathname.split('/')[4];
      state.finalizeRequests.push({
        headers: req.headers,
        body: bodyText ? JSON.parse(bodyText) : null,
        parallelId,
      });

      createJsonResponse(res, 200, {
        message: 'Parallel build finalized successfully',
        build: {
          id: 'build-finalize-1',
          status: 'completed',
          parallel_id: parallelId,
        },
      });
      return;
    }

    createJsonResponse(res, 404, {
      error: `Unhandled route: ${req.method} ${url.pathname}`,
    });
  });

  return {
    state,
    async start() {
      server.listen(0, '127.0.0.1');
      await once(server, 'listening');
      let address = server.address();
      return `http://127.0.0.1:${address.port}`;
    },
    async close() {
      await new Promise((resolve, reject) => {
        server.close(error => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    },
  };
}

async function createTempCliWorkspace() {
  let rootDir = await mkdtemp(join(tmpdir(), 'vizzly-cli-targeting-'));
  let homeDir = join(rootDir, 'home');
  let projectDir = join(rootDir, 'project');
  let screenshotsDir = join(projectDir, 'screenshots');

  await mkdir(homeDir, { recursive: true });
  await mkdir(projectDir, { recursive: true });
  await mkdir(screenshotsDir, { recursive: true });
  await copyFile(
    FIXTURE_SCREENSHOT,
    join(screenshotsDir, 'homepage-desktop.png')
  );

  cleanupTasks.push(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  return { rootDir, homeDir, projectDir, screenshotsDir };
}

async function writeLoggedInUserAuth(homeDir, apiUrl) {
  let expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

  await writeFile(
    join(homeDir, 'config.json'),
    JSON.stringify(
      {
        authByApiUrl: {
          [apiUrl]: {
            accessToken: 'user-access-token',
            refreshToken: 'refresh-token',
            expiresAt,
            user: {
              id: 'user-1',
              email: 'user@example.com',
            },
          },
        },
      },
      null,
      2
    )
  );
}

async function writeRepoTargetConfig(projectDir, apiUrl) {
  await writeFile(
    join(projectDir, 'vizzly.config.js'),
    `export default {
  apiUrl: '${apiUrl}',
  target: {
    organizationSlug: 'acme',
    projectSlug: 'web-app'
  },
  upload: {
    batchSize: 1
  }
};
`
  );
}

function getDataMessage(output) {
  let messages = parseJSONOutput(output);
  return messages.find(message => message.status === 'data')?.data || null;
}

describe('commands/targeting integration', () => {
  it('uses repo target config and local user auth for upload', async () => {
    let server = createSdkStubServer();
    cleanupTasks.push(() => server.close());

    let apiUrl = await server.start();
    let { homeDir, projectDir, screenshotsDir } =
      await createTempCliWorkspace();
    await writeLoggedInUserAuth(homeDir, apiUrl);
    await writeRepoTargetConfig(projectDir, apiUrl);

    let cli = createCLIRunner(projectDir, {
      VIZZLY_HOME: homeDir,
      VIZZLY_API_URL: apiUrl,
      VIZZLY_SERVER_URL: apiUrl,
    });

    let result = await cli.runSuccess(['upload', screenshotsDir, '--json']);
    let data = getDataMessage(result.stdout);

    assert.ok(data);
    assert.strictEqual(data.buildId, 'build-1');
    assert.strictEqual(data.url, `${apiUrl}/acme/web-app/builds/build-1`);

    assert.strictEqual(server.state.buildRequests.length, 1);
    assert.strictEqual(
      server.state.buildRequests[0].headers.authorization,
      'Bearer user-access-token'
    );
    assert.deepStrictEqual(server.state.buildRequests[0].body.target, {
      organizationSlug: 'acme',
      projectSlug: 'web-app',
    });

    assert.strictEqual(server.state.shaRequests.length, 1);
    assert.strictEqual(server.state.shaRequests[0].body.buildId, 'build-1');

    assert.strictEqual(server.state.uploadRequests.length, 1);
    assert.ok(
      server.state.uploadRequests[0].bodyText.includes('name="build_id"')
    );
    assert.ok(server.state.uploadRequests[0].bodyText.includes('build-1'));

    assert.strictEqual(server.state.statusRequests.length, 1);
    assert.strictEqual(server.state.statusRequests[0].body.status, 'completed');
  });

  it('keeps CI-style project token upload working without repo target config', async () => {
    let server = createSdkStubServer();
    cleanupTasks.push(() => server.close());

    let apiUrl = await server.start();
    let { homeDir, projectDir, screenshotsDir } =
      await createTempCliWorkspace();

    let cli = createCLIRunner(projectDir, {
      VIZZLY_HOME: homeDir,
      VIZZLY_API_URL: apiUrl,
      VIZZLY_SERVER_URL: apiUrl,
      VIZZLY_TOKEN: 'vzt_project_token',
    });

    let result = await cli.runSuccess(['upload', screenshotsDir, '--json']);
    let data = getDataMessage(result.stdout);

    assert.ok(data);
    assert.strictEqual(data.buildId, 'build-1');

    assert.strictEqual(server.state.buildRequests.length, 1);
    assert.strictEqual(
      server.state.buildRequests[0].headers.authorization,
      'Bearer vzt_project_token'
    );
    assert.strictEqual(server.state.buildRequests[0].body.target, undefined);
  });

  it('sends repo target config on user-auth parallel finalize', async () => {
    let server = createSdkStubServer();
    cleanupTasks.push(() => server.close());

    let apiUrl = await server.start();
    let { homeDir, projectDir } = await createTempCliWorkspace();
    await writeLoggedInUserAuth(homeDir, apiUrl);
    await writeRepoTargetConfig(projectDir, apiUrl);

    let cli = createCLIRunner(projectDir, {
      VIZZLY_HOME: homeDir,
      VIZZLY_API_URL: apiUrl,
      VIZZLY_SERVER_URL: apiUrl,
    });

    let result = await cli.runSuccess(['finalize', 'parallel-123', '--json']);
    let data = getDataMessage(result.stdout);

    assert.ok(data);
    assert.strictEqual(data.build.parallel_id, 'parallel-123');

    assert.strictEqual(server.state.finalizeRequests.length, 1);
    assert.strictEqual(
      server.state.finalizeRequests[0].headers.authorization,
      'Bearer user-access-token'
    );
    assert.deepStrictEqual(server.state.finalizeRequests[0].body, {
      target: {
        organizationSlug: 'acme',
        projectSlug: 'web-app',
      },
    });
  });
});
