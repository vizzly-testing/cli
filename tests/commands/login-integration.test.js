import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';

async function login(
  t,
  responses,
  {
    expiresIn = 600,
    interval = 0.01,
    initiateError,
    fakeTime = false,
    browserHangs = false,
  } = {}
) {
  let directory = await mkdtemp(join(tmpdir(), 'vizzly-login-'));
  let requests = [];
  let waits = [];
  let server = createServer(async (req, res) => {
    let body = '';
    for await (let chunk of req) body += chunk;
    requests.push({ path: req.url, body: body && JSON.parse(body) });
    res.setHeader('Content-Type', 'application/json');
    let response;
    if (req.url.endsWith('/initiate')) {
      response = initiateError || {
        status: 200,
        body: {
          device_code: 'same-device-code',
          user_code: 'ABCD-EFGH',
          verification_uri: 'https://example.test/authorize',
          interval,
          expires_in: expiresIn,
        },
      };
    } else {
      response = responses.length > 1 ? responses.shift() : responses[0];
    }
    if (response.hang) return;
    res.writeHead(response.status, response.headers);
    res.end(JSON.stringify(response.body));
  });
  t.after(async () => {
    if (browserHangs) {
      try {
        let pid = Number(
          await readFile(join(directory, 'browser.pid'), 'utf8')
        );
        process.kill(pid, 'SIGKILL');
      } catch (error) {
        if (!['ENOENT', 'ESRCH'].includes(error.code)) throw error;
      }
    }
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  });
  await mkdir(join(directory, 'bin'));
  if (browserHangs) {
    await writeFile(
      join(directory, 'browser.mjs'),
      `import { writeFileSync } from 'node:fs';
writeFileSync('browser.pid', String(process.pid));
process.on('SIGTERM', () => {});
process.stdin.resume();
`
    );
  }
  // Browser launching is an external boundary; never open the user's browser.
  for (let executable of ['open', 'xdg-open']) {
    await writeFile(
      join(directory, 'bin', executable),
      browserHangs
        ? '#!/bin/sh\nexec "$VIZZLY_TEST_NODE" "$VIZZLY_TEST_BROWSER"\n'
        : '#!/bin/sh\nexit 1\n',
      { mode: 0o755 }
    );
  }
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  let apiUrl = `http://127.0.0.1:${server.address().port}`;
  let entrypoint = resolve('src/cli.js');
  let args = [entrypoint, 'login', '--api-url', apiUrl, '--no-color'];
  if (fakeTime) {
    // Exercise the real command, HTTP client and token store, replacing only
    // time. The process entrypoint is covered separately with real timers.
    entrypoint = join(directory, 'timed-login.mjs');
    let commandUrl = pathToFileURL(resolve('src/commands/login.js')).href;
    await writeFile(
      entrypoint,
      `import { loginCommand } from ${JSON.stringify(commandUrl)};
let time = Date.parse('2026-05-18T12:00:00Z');
await loginCommand({ apiUrl: ${JSON.stringify(apiUrl)} }, { noColor: true }, {
  now: () => time,
  delay: async milliseconds => {
    process.send({ wait: milliseconds });
    time += milliseconds;
  },
});
process.disconnect();
`
    );
    args = [entrypoint];
  }
  let child = spawn(process.execPath, args, {
    cwd: directory,
    env: {
      ...process.env,
      VIZZLY_HOME: join(directory, 'home'),
      VIZZLY_TEST_NODE: process.execPath,
      VIZZLY_TEST_BROWSER: join(directory, 'browser.mjs'),
      PATH: `${join(directory, 'bin')}:${process.env.PATH}`,
    },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  t.after(() => {
    if (child.exitCode === null) child.kill();
  });
  child.on('message', message => waits.push(message.wait));
  let output = '';
  child.stdout.on('data', chunk => {
    output += chunk;
  });
  child.stderr.on('data', chunk => {
    output += chunk;
  });
  let [code] = await once(child, 'close');
  let config;
  try {
    config = JSON.parse(await readFile(join(directory, 'home', 'config.json')));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  let browserPid = browserHangs
    ? Number(await readFile(join(directory, 'browser.pid'), 'utf8'))
    : undefined;
  return { code, output, config, requests, waits, browserPid };
}

let pending = { status: 400, body: { code: 'AUTHORIZATION_PENDING' } };
let complete = {
  status: 200,
  body: {
    tokens: {
      accessToken: 'access',
      refreshToken: 'refresh',
      expiresIn: 900,
    },
    user: { name: 'Robert', email: 'robert@example.test' },
    organizations: [{ name: 'Vizzly', slug: 'vizzly' }],
  },
};

let options = { timeout: 10000 };

test(
  'login automatically completes and saves credentials with stdin closed',
  options,
  async t => {
    let result = await login(t, [pending, pending, complete]);
    assert.equal(result.code, 0, result.output);
    assert.equal(result.config.auth.accessToken, 'access');
    assert.equal(result.config.auth.refreshToken, 'refresh');
    assert.equal(result.config.auth.user.email, 'robert@example.test');
    assert.match(result.output, /Authenticated/);
    assert.match(result.output, /Vizzly \(@vizzly\)/);
    assert.match(result.output, /Could not open browser automatically/);
    assert.match(result.output, /Please open the URL manually/);
    assert.match(result.output, /example.test\/authorize\?code=ABCD-EFGH/);
    assert.doesNotMatch(result.output, /press Enter|Token expires/i);
    assert.equal(
      result.requests.filter(req => req.path.endsWith('/initiate')).length,
      1
    );
    assert.deepEqual(
      result.requests.slice(1).map(req => req.body.device_code),
      ['same-device-code', 'same-device-code', 'same-device-code']
    );
  }
);

test(
  'login respects the server interval and Retry-After header on the same attempt',
  options,
  async t => {
    let result = await login(
      t,
      [
        pending,
        {
          status: 429,
          headers: { 'Retry-After': '12' },
          body: { retryAfter: 1 },
        },
        complete,
      ],
      { interval: 5, fakeTime: true }
    );
    assert.equal(result.code, 0, result.output);
    assert.deepEqual(result.waits, [5000, 5000, 12000]);
    assert.match(result.output, /Rate limited. Next check in 12s/);
    assert.equal(result.config.auth.accessToken, 'access');
    assert.equal(
      result.requests.filter(req => req.path.endsWith('/initiate')).length,
      1
    );
  }
);

for (let [serverCode, message] of [
  ['ACCESS_DENIED', /Authorization denied/],
  ['EXPIRED_TOKEN', /Device code expired/],
  ['INVALID_DEVICE_CODE', /Device code is invalid/],
]) {
  test(
    `login stops without saving credentials for ${serverCode}`,
    options,
    async t => {
      let result = await login(t, [
        { status: 401, body: { code: serverCode } },
      ]);
      assert.equal(result.code, 1);
      assert.match(result.output, message);
      assert.equal(result.config?.auth, undefined);
      assert.equal(result.requests.length, 2);
    }
  );
}

for (let [expiresIn, seconds, message] of [
  [600, 120, /timed out after 2 minutes/],
  [12, 12, /Device code expired/],
]) {
  test(
    `login stops after ${seconds}s when authorization stays pending`,
    options,
    async t => {
      let result = await login(t, [pending], {
        expiresIn,
        interval: 5,
        fakeTime: true,
      });
      assert.equal(result.code, 1);
      assert.match(result.output, message);
      assert.equal(result.config?.auth, undefined);
      assert.equal(
        result.waits.reduce((total, wait) => total + wait, 0),
        seconds * 1000
      );
      assert.equal(
        result.requests.filter(req => req.path.endsWith('/initiate')).length,
        1
      );
    }
  );
}

test('login stops a stalled poll when the code expires', options, async t => {
  let result = await login(t, [{ hang: true }], { expiresIn: 2 });
  assert.equal(result.code, 1);
  assert.match(result.output, /Device code expired/);
  assert.equal(result.config?.auth, undefined);
  assert.equal(result.requests.length, 2);
});

test(
  'login reports initiation rate limits with a recovery hint',
  options,
  async t => {
    let result = await login(t, [], {
      initiateError: { status: 429, body: { message: 'Slow down' } },
    });
    assert.equal(result.code, 1);
    assert.match(result.output, /Too many login attempts/);
    assert.match(
      result.output,
      /Please wait a few minutes before trying again/
    );
    assert.equal(result.requests.length, 1);
    assert.equal(result.config?.auth, undefined);
  }
);

test(
  'a cooldown longer than the remaining login lifetime cannot extend the deadline',
  options,
  async t => {
    let result = await login(
      t,
      [{ status: 429, headers: { 'Retry-After': '300' }, body: {} }],
      { interval: 5, fakeTime: true }
    );
    assert.equal(result.code, 1);
    assert.match(result.output, /timed out after 2 minutes/);
    assert.deepEqual(result.waits, [5000, 115000]);
    assert.equal(result.requests.length, 2);
    assert.equal(result.config?.auth, undefined);
  }
);

test(
  'an unexpected server response does not save a session',
  options,
  async t => {
    let result = await login(t, [{ status: 200, body: { status: 'unknown' } }]);
    assert.equal(result.code, 1);
    assert.match(result.output, /Unexpected response/);
    assert.equal(result.config?.auth, undefined);
    assert.equal(result.requests.length, 2);
  }
);

test(
  'login reports authentication rejection with account recovery hints',
  options,
  async t => {
    let result = await login(t, [], {
      initiateError: {
        status: 401,
        body: { message: 'Authentication required' },
      },
    });
    assert.equal(result.code, 1);
    assert.match(result.output, /Authentication failed/);
    assert.match(result.output, /Please try logging in again/);
    assert.match(result.output, /sign up at https:\/\/vizzly.dev/);
    assert.equal(result.config?.auth, undefined);
  }
);

test('a stuck browser launcher cannot prevent login polling or leave the launcher running', {
  timeout: 15000,
  skip: process.platform === 'win32',
}, async t => {
  let result = await login(t, [pending, complete], { browserHangs: true });
  assert.equal(result.code, 0, result.output);
  assert.match(result.output, /Could not open browser automatically/);
  assert.match(result.output, /Please open the URL manually/);
  assert.match(result.output, /Authenticated/);
  assert.equal(result.config.auth.accessToken, 'access');
  assert.equal(result.requests.length, 3);
  assert.throws(() => process.kill(result.browserPid, 0), { code: 'ESRCH' });
});
