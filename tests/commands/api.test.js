import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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
    if (req.url === '/api/image') {
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
