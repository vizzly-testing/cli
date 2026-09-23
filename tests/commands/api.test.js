import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { after, before, test } from 'node:test';
import {
  appendApiQuery,
  buildApiRequest,
  normalizeApiEndpoint,
  parseApiHeaders,
  validateApiOptions,
} from '../../src/commands/api.js';

let directory, server, origin;
let requests = [];
before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'vizzly-api-command-'));
  server = createServer(async (req, res) => {
    let chunks = [];
    for await (let chunk of req) chunks.push(chunk);
    let body = Buffer.concat(chunks).toString();
    requests.push({
      method: req.method,
      url: req.url,
      headers: req.headers,
      body,
    });
    if (req.url === '/api/broken-image') {
      res.writeHead(200, {
        'Content-Type': 'image/png',
        'Content-Length': '100',
        Connection: 'close',
      });
      res.end('partial');
    } else if (req.url === '/api/auth/cli/refresh') {
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          accessToken: 'refreshed-user',
          refreshToken: 'new-refresh',
          expiresIn: 900,
        })
      );
    } else if (
      req.url === '/api/refreshable' &&
      req.headers.authorization !== 'Bearer refreshed-user'
    ) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'expired' }));
    } else if (req.url === '/api/problem') {
      res.writeHead(422, { 'Content-Type': 'application/problem+json' });
      res.end(
        JSON.stringify({
          message: 'Invalid decision',
          code: 'INVALID_DECISION',
        })
      );
    } else if (req.url === '/api/image') {
      res.setHeader('Content-Type', 'image/png');
      res.end(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    } else if (req.url === '/api/redirect') {
      res.writeHead(302, { Location: `${origin}/api/secret` });
      res.end();
    } else if (req.url === '/api/unauthorized') {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'denied' }));
    } else if (req.method === 'DELETE') {
      res.writeHead(204);
      res.end();
    } else {
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          items: ['one'],
          received: body ? JSON.parse(body) : null,
        })
      );
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  origin = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await new Promise((resolve, reject) =>
    server.close(error => (error ? reject(error) : resolve()))
  );
  await rm(directory, { recursive: true, force: true });
});
async function cli(args, input = '', environment = {}) {
  let child = spawn(
    process.execPath,
    [resolve('src/cli.js'), ...args, '--json'],
    {
      cwd: directory,
      env: {
        ...process.env,
        VIZZLY_HOME: join(directory, 'home'),
        VIZZLY_TOKEN: 'vzt_test',
        VIZZLY_API_URL: origin,
        NO_COLOR: '1',
        ...environment,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    }
  );
  let stdout = '',
    stderr = '';
  child.stdout.on('data', chunk => {
    stdout += chunk;
  });
  child.stderr.on('data', chunk => {
    stderr += chunk;
  });
  child.stdin.end(input);
  let [code] = await once(child, 'close');
  return {
    code,
    stdout,
    stderr,
    json: stdout.trim() ? JSON.parse(stdout) : null,
  };
}
test('generic request helpers retain parameter values and reject external origins', () => {
  assert.equal(normalizeApiEndpoint('sdk/builds'), '/api/sdk/builds');
  assert.equal(
    appendApiQuery('/api/builds', ['name=a=b']),
    '/api/builds?name=a%3Db'
  );
  assert.deepEqual(parseApiHeaders('X-Trace: a:b'), { 'X-Trace': 'a:b' });
  assert.equal(
    buildApiRequest({
      endpoint: '/api/review',
      options: { method: 'POST', data: '{}' },
    }).requestOptions.body,
    '{}'
  );
  assert.equal(validateApiOptions('/api/test', { method: 'PATCH' }).length, 0);
  assert.equal(validateApiOptions('/api/test', { data: '{}' }).length, 1);
  assert.equal(validateApiOptions('https://elsewhere.test/api').length, 1);
});
test('actual CLI discovers schemas and preserves the JSON payload envelope', async () => {
  let result = await cli(['api', 'schema']);
  assert.equal(result.code, 0, result.stderr + result.stdout);
  assert.equal(requests.at(-1).url, '/api/sdk/schema');
  assert.deepEqual(result.json.data.response.items, ['one']);
  result = await cli(['api', 'schema', 'sdk.listBuilds']);
  assert.equal(result.code, 0, result.stderr + result.stdout);
  assert.equal(requests.at(-1).url, '/api/sdk/schema/sdk.listBuilds');
  result = await cli([
    'api',
    'schema',
    'sdk.listBuilds',
    '-q',
    'view=response',
  ]);
  assert.equal(result.code, 0, result.stderr + result.stdout);
  assert.equal(
    requests.at(-1).url,
    '/api/sdk/schema/sdk.listBuilds?view=response'
  );
});
test('CLI sends decisions using file or stdin JSON and arbitrary documented headers', async () => {
  let file = join(directory, 'decision.json');
  await writeFile(file, '{"decision":"approved"}');
  let result = await cli([
    'api',
    '/api/review',
    '-X',
    'POST',
    '-d',
    `@${file}`,
    '-H',
    'X-Organization: team',
  ]);
  assert.equal(result.code, 0, result.stderr + result.stdout);
  assert.equal(requests.at(-1).headers['x-organization'], 'team');
  assert.equal(requests.at(-1).headers.authorization, 'Bearer vzt_test');
  assert.deepEqual(result.json.data.response.received, {
    decision: 'approved',
  });
  result = await cli(
    ['api', '/api/review', '-X', 'POST', '-d', '@-'],
    '{"decision":"rejected"}'
  );
  assert.equal(result.code, 0, result.stderr + result.stdout);
  assert.equal(result.json.data.response.received.decision, 'rejected');
});
test('image output writes real bytes without overwriting an existing file', async () => {
  let path = join(directory, 'image.png');
  let result = await cli(['api', '/api/image', '--output', path]);
  assert.equal(result.code, 0, result.stderr + result.stdout);
  assert.equal(result.json.data.response.file, path);
  assert.deepEqual(
    await readFile(path),
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  );
  result = await cli(['api', '/api/image', '--output', path]);
  assert.equal(result.code, 1);
  assert.equal((await readFile(path)).length, 8);
});
test('empty responses succeed; malformed bodies and HTTP errors fail without replay', async () => {
  let result = await cli(['api', '/api/review', '-X', 'DELETE']);
  assert.equal(result.code, 0, result.stderr + result.stdout);
  assert.equal(result.json.data.response, null);
  let before = requests.length;
  result = await cli(['api', '/api/review', '-X', 'POST', '-d', '{invalid']);
  assert.equal(result.code, 1);
  assert.equal(requests.length, before);
  result = await cli(['api', '/api/unauthorized', '-X', 'POST', '-d', '{}']);
  assert.equal(result.code, 1);
  assert.equal(requests.length, before + 1);
});
test('CLI refuses redirects and full-schema console dumps', async () => {
  let before = requests.length;
  let result = await cli(['api', '/api/redirect']);
  assert.equal(result.code, 1);
  assert.equal(requests.length, before + 1);
  result = await cli(['api', 'schema', '--full']);
  assert.equal(result.code, 1);
  assert.equal(requests.length, before + 1);
});

test('schema discovery works before login but ordinary data reads require credentials', async () => {
  let result = await cli(['api', 'schema'], '', {
    VIZZLY_TOKEN: '',
    VIZZLY_HOME: join(directory, 'anonymous'),
  });
  assert.equal(result.code, 0, result.stderr + result.stdout);
  assert.equal(requests.at(-1).headers.authorization, undefined);
  let before = requests.length;
  result = await cli(['api', '/api/review'], '', {
    VIZZLY_TOKEN: '',
    VIZZLY_HOME: join(directory, 'anonymous'),
  });
  assert.equal(result.code, 1);
  assert.equal(requests.length, before);
});

async function credentialHome(name) {
  let home = join(directory, name);
  await mkdir(home);
  await writeFile(
    join(home, 'config.json'),
    JSON.stringify({
      auth: { accessToken: 'logged-in-user', refreshToken: 'saved-refresh' },
      projectLink: {
        active: 'fixture',
        links: {
          fixture: { apiUrl: origin, token: 'vzt_linked', storage: 'file' },
        },
      },
    })
  );
  return { VIZZLY_HOME: home, VIZZLY_TOKEN: '' };
}
test('CLI prefers login over linked upload credentials and honors explicit tokens', async () => {
  let environment = await credentialHome('credentials');
  for (let [args, env, expected] of [
    [[], {}, 'logged-in-user'],
    [[], { VIZZLY_TOKEN: 'vzt_environment' }, 'vzt_environment'],
    [
      ['--token', 'vzt_explicit'],
      { VIZZLY_TOKEN: 'vzt_environment' },
      'vzt_explicit',
    ],
  ]) {
    let result = await cli(['api', '/api/review', ...args], '', {
      ...environment,
      ...env,
    });
    assert.equal(result.code, 0, result.stderr + result.stdout);
    assert.equal(requests.at(-1).headers.authorization, `Bearer ${expected}`);
  }
});
test('CLI refreshes a read once but never replays generic writes', async () => {
  let environment = await credentialHome('refresh');
  let before = requests.length;
  let result = await cli(['api', '/api/refreshable'], '', environment);
  assert.equal(result.code, 0, result.stderr + result.stdout);
  assert.deepEqual(
    requests.slice(before).map(({ method, url }) => [method, url]),
    [
      ['GET', '/api/refreshable'],
      ['POST', '/api/auth/cli/refresh'],
      ['GET', '/api/refreshable'],
    ]
  );
  let saved = JSON.parse(
    await readFile(join(environment.VIZZLY_HOME, 'config.json'), 'utf8')
  );
  assert.equal(saved.auth.accessToken, 'refreshed-user');
  for (let method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    before = requests.length;
    result = await cli(
      ['api', '/api/unauthorized', '-X', method],
      '',
      environment
    );
    assert.equal(result.code, 1);
    assert.equal(requests.length, before + 1);
  }
});
test('failed image downloads remove partial files and binary output requires a file', async () => {
  let path = join(directory, 'partial.png');
  let result = await cli(['api', '/api/broken-image', '--output', path]);
  assert.equal(result.code, 1);
  await assert.rejects(readFile(path), { code: 'ENOENT' });
  result = await cli(['api', '/api/image']);
  assert.equal(result.code, 1);
  assert.match(result.json.data.error.message, /--output/);
});
test('HEAD, structured errors, and explicit raw schema paths keep their HTTP behavior', async () => {
  let result = await cli(['api', '/api/review', '-X', 'HEAD']);
  assert.equal(result.code, 0, result.stderr + result.stdout);
  assert.equal(result.json.data.response, null);
  result = await cli(['api', '/api/problem']);
  assert.equal(result.code, 1);
  assert.match(result.json.data.error.message, /Invalid decision/);
  result = await cli(['api', '/api/schema']);
  assert.equal(result.code, 0, result.stderr + result.stdout);
  assert.equal(requests.at(-1).url, '/api/schema');
});
