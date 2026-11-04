import { once } from 'node:events';
import { createServer } from 'node:http';
import { fixtureAuthorization } from '../../helpers/auth-session.js';

// Only the remote service is simulated. Local auth, storage, and HTTP routes are real.
export async function startCloudApi() {
  let requests = [];
  let starts = 0;
  let checks = 0;
  let pending = new Set();
  let api = {
    requests,
    initiate: async count => ({
      body: {
        device_code: `device-${count}`,
        user_code: `CODE-${count}`,
        verification_uri: 'https://auth.test/cli/authorize',
        expires_in: 600,
        interval: 5,
      },
    }),
    poll: async () => ({ body: { status: 'pending' } }),
    projects: [],
    builds: [],
    get starts() {
      return starts;
    },
    get checks() {
      return checks;
    },
    releasePending() {
      for (let release of pending) release();
      pending.clear();
    },
    defer() {
      let release;
      let requested;
      let waiting = new Promise(resolve => {
        release = resolve;
      });
      let started = new Promise(resolve => {
        requested = resolve;
      });
      pending.add(release);
      return { waiting, started, requested, release };
    },
  };
  let server = createServer(async (req, res) => {
    let path = new URL(req.url, 'http://cloud').pathname;
    let body = '';
    for await (let chunk of req) body += chunk;
    requests.push({
      path,
      method: req.method,
      body: body ? JSON.parse(body) : null,
    });
    let response;
    try {
      if (path === '/api/auth/cli/device/initiate')
        response = await api.initiate(++starts);
      else if (path === '/api/auth/cli/device/poll')
        response = await api.poll(++checks);
      else if (path === '/api/auth/cli/whoami')
        response = {
          body: {
            user: { username: 'test-user', email: 'test@example.test' },
            organizations: [{ slug: 'test-org', name: 'Test organization' }],
          },
        };
      else if (path === '/api/sdk/projects') {
        let url = new URL(req.url, 'http://cloud');
        let limit = Number(url.searchParams.get('limit'));
        let offset = Number(url.searchParams.get('offset'));
        let projects = api.projects.slice(offset, offset + limit);
        response = {
          body: {
            projects,
            meta: {
              total: api.projects.length,
              limit,
              offset,
              hasMore: offset + projects.length < api.projects.length,
            },
          },
        };
      } else if (path === '/api/sdk/builds') {
        let url = new URL(req.url, 'http://cloud');
        let limit = Number(url.searchParams.get('limit'));
        let offset = Number(url.searchParams.get('offset'));
        let builds = api.builds.slice(offset, offset + limit);
        response = {
          body: {
            builds,
            meta: {
              total: api.builds.length,
              limit,
              offset,
              hasMore: offset + builds.length < api.builds.length,
            },
          },
        };
      } else if (/^\/api\/sdk\/builds\/[^/]+\/tdd-baselines$/.test(path))
        response = {
          body: { build: {}, screenshots: [], signatureProperties: [] },
        };
      else
        response = {
          status: 404,
          body: { error: `Unexpected cloud request: ${path}` },
        };
      res.writeHead(response.status || 200, {
        'Content-Type': 'application/json',
        ...response.headers,
      });
      res.end(JSON.stringify(response.body));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return Object.assign(api, {
    url: `http://127.0.0.1:${server.address().port}`,
    stop: async () => {
      api.releasePending();
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    },
  });
}

export let authorizedResponse = {
  body: {
    tokens: {
      accessToken: 'reporter-access',
      refreshToken: 'reporter-refresh',
      expiresIn: 3600,
    },
    user: { username: 'test-user' },
    authorization: fixtureAuthorization,
  },
};
