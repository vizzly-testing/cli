import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { createApiClient } from './cloud-client.js';
import { getAuthTokens, saveAuthTokens } from './token-store.js';

let originalHome;
let home;

before(async () => {
  originalHome = process.env.VIZZLY_HOME;
  home = await mkdtemp(path.join(tmpdir(), 'vizzly-cloud-client-'));
  process.env.VIZZLY_HOME = home;
});

after(async () => {
  if (originalHome === undefined) delete process.env.VIZZLY_HOME;
  else process.env.VIZZLY_HOME = originalHome;
  if (home) await rm(home, { recursive: true, force: true });
});

async function withApiServer(handler, run) {
  let server = createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  try {
    let apiUrl = `http://127.0.0.1:${server.address().port}`;
    await run(apiUrl);
  } finally {
    server.close();
    await once(server, 'close');
  }
}

async function readJson(request) {
  let chunks = [];
  for await (let chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString());
}

describe('saved-token API refresh', () => {
  it('refreshes a saved user token once and retries the request with rotated credentials', async () => {
    let requests = [];
    await saveAuthTokens({
      accessToken: 'expired-access',
      refreshToken: 'saved-refresh',
      expiresAt: '2020-01-01T00:00:00.000Z',
      user: { id: 'user-1' },
    });

    await withApiServer(
      async (request, response) => {
        let body = request.method === 'POST' ? await readJson(request) : null;
        requests.push({
          method: request.method,
          url: request.url,
          authorization: request.headers.authorization,
          body,
        });

        response.setHeader('Content-Type', 'application/json');
        if (request.url === '/api/auth/cli/refresh') {
          response.end(
            JSON.stringify({
              accessToken: 'new-access',
              refreshToken: 'new-refresh',
              expiresIn: 3600,
            })
          );
          return;
        }

        if (request.headers.authorization === 'Bearer expired-access') {
          response.writeHead(401);
          response.end(JSON.stringify({ error: 'expired' }));
          return;
        }

        response.end(JSON.stringify({ projects: [] }));
      },
      async apiUrl => {
        let client = createApiClient({
          baseUrl: apiUrl,
          token: 'expired-access',
        });
        let result = await client.request('/api/sdk/projects');

        assert.deepEqual(result, { projects: [] });
        assert.equal(client.getToken(), 'new-access');
      }
    );

    assert.deepEqual(
      requests.map(({ method, url, authorization }) => ({
        method,
        url,
        authorization,
      })),
      [
        {
          method: 'GET',
          url: '/api/sdk/projects',
          authorization: 'Bearer expired-access',
        },
        {
          method: 'POST',
          url: '/api/auth/cli/refresh',
          authorization: undefined,
        },
        {
          method: 'GET',
          url: '/api/sdk/projects',
          authorization: 'Bearer new-access',
        },
      ]
    );
    assert.deepEqual(requests[1].body, { refreshToken: 'saved-refresh' });

    let saved = await getAuthTokens();
    assert.equal(saved.accessToken, 'new-access');
    assert.equal(saved.refreshToken, 'new-refresh');
    assert.equal(saved.user.id, 'user-1');
  });

  it('does not spend a saved user refresh token on a project-token 401', async () => {
    let requests = [];
    await saveAuthTokens({
      accessToken: 'saved-user-access',
      refreshToken: 'saved-user-refresh',
      expiresAt: '2999-01-01T00:00:00.000Z',
    });

    await withApiServer(
      (request, response) => {
        requests.push({
          url: request.url,
          authorization: request.headers.authorization,
        });
        response.writeHead(401, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ error: 'unauthorized' }));
      },
      async apiUrl => {
        let client = createApiClient({
          baseUrl: apiUrl,
          token: 'vzt_project_token',
        });

        await assert.rejects(
          () => client.request('/api/sdk/builds'),
          error => {
            assert.equal(error.name, 'AuthError');
            assert.equal(error.context.status, 401);
            return true;
          }
        );
      }
    );

    assert.deepEqual(requests, [
      {
        url: '/api/sdk/builds',
        authorization: 'Bearer vzt_project_token',
      },
    ]);
    assert.equal((await getAuthTokens()).refreshToken, 'saved-user-refresh');
  });

  it('does not replace an explicit or anonymous request with the saved user session', async () => {
    let saved = {
      accessToken: 'saved-user-access',
      refreshToken: 'saved-user-refresh',
      expiresAt: '2999-01-01T00:00:00.000Z',
    };
    await saveAuthTokens(saved);

    for (let token of ['explicit-user-access', null]) {
      let requests = [];
      await withApiServer(
        (request, response) => {
          requests.push({
            url: request.url,
            authorization: request.headers.authorization,
          });
          response.writeHead(401, { 'Content-Type': 'application/json' });
          response.end(JSON.stringify({ error: 'unauthorized' }));
        },
        async apiUrl => {
          let client = createApiClient({
            baseUrl: apiUrl,
            token,
            allowNoToken: true,
          });
          await assert.rejects(() => client.request('/api/sdk/projects'), {
            code: 'AUTH_ERROR',
          });
          assert.equal(client.getToken(), token);
        }
      );
      assert.deepEqual(requests, [
        {
          url: '/api/sdk/projects',
          authorization: token ? `Bearer ${token}` : undefined,
        },
      ]);
      assert.deepEqual(await getAuthTokens(), saved);
    }
  });

  it('retries a saved session only once and honors requests that disable authentication retries', async () => {
    await saveAuthTokens({
      accessToken: 'old-access',
      refreshToken: 'old-refresh',
    });
    let requests = [];
    let refreshes = 0;
    await withApiServer(
      (request, response) => {
        requests.push({
          url: request.url,
          authorization: request.headers.authorization,
        });
        response.setHeader('Content-Type', 'application/json');
        if (request.url === '/api/auth/cli/refresh' && refreshes++ === 0) {
          response.end(
            JSON.stringify({
              accessToken: 'new-access',
              refreshToken: 'new-refresh',
              expiresIn: 3600,
            })
          );
          return;
        }
        response.writeHead(401);
        response.end(JSON.stringify({ error: 'unauthorized' }));
      },
      async apiUrl => {
        let client = createApiClient({ baseUrl: apiUrl, token: 'old-access' });
        await assert.rejects(() => client.request('/api/sdk/projects'), {
          code: 'AUTH_ERROR',
        });
        assert.deepEqual(requests, [
          { url: '/api/sdk/projects', authorization: 'Bearer old-access' },
          { url: '/api/auth/cli/refresh', authorization: undefined },
          { url: '/api/sdk/projects', authorization: 'Bearer new-access' },
        ]);
        assert.equal((await getAuthTokens()).accessToken, 'new-access');

        requests.length = 0;
        await assert.rejects(
          () =>
            client.request('/api/sdk/projects', { retryAuthentication: false }),
          { code: 'AUTH_ERROR' }
        );
        assert.deepEqual(requests, [
          { url: '/api/sdk/projects', authorization: 'Bearer new-access' },
        ]);
      }
    );
  });
});
