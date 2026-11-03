import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {
  terminalFixture as fixture,
  terminalTest as ptyTest,
  runTerminal as wizard,
} from '../../helpers/terminal-runner.js';

async function projectPickerFixture(t) {
  let cwd = await fixture(t);
  let calls = [];
  let projects = Array.from({ length: 11 }, (_, index) => ({
    id: `project-${index}`,
    name: `App ${index}`,
    slug: 'web',
    organizationSlug: index === 10 ? 'studio' : `team-${index}`,
  }));
  let server = http.createServer(async (request, response) => {
    for await (let _chunk of request) {
      /* consume the external request */
    }
    calls.push({ method: request.method, url: request.url });
    let url = new URL(request.url, 'http://fixture');
    response.setHeader('Content-Type', 'application/json');
    if (url.pathname === '/api/sdk/projects') {
      let offset = Number(url.searchParams.get('offset'));
      response.end(
        JSON.stringify({
          projects: projects.slice(offset, offset + 10),
          meta: { total: 11, limit: 10, offset, hasMore: offset === 0 },
        })
      );
    } else if (url.pathname === '/api/cli/web/link-token') {
      assert.equal(request.headers['x-organization'], 'studio');
      response.end(
        JSON.stringify({
          organization: { slug: 'studio' },
          project: { slug: 'web' },
          token: {
            id: 'token-1',
            token: 'vzt_picker_secret',
            token_prefix: 'vzt_fixture',
          },
        })
      );
    } else {
      response.statusCode = 404;
      response.end(JSON.stringify({ error: 'Unexpected fixture request' }));
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  await mkdir(path.join(cwd, 'user-state'));
  await writeFile(
    path.join(cwd, 'user-state', 'config.json'),
    JSON.stringify({
      auth: {
        accessToken: 'fixture-picker-user',
        expiresAt: '2999-01-01T00:00:00Z',
      },
    })
  );
  let environment = {
    VIZZLY_API_URL: `http://127.0.0.1:${server.address().port}`,
    VIZZLY_NO_UPDATE_NOTIFIER: '1',
  };
  return { cwd, calls, environment };
}

ptyTest(
  'project link reaches another page and binds the qualified selection in a real terminal',
  { timeout: 30000 },
  async t => {
    let { cwd, calls, environment } = await projectPickerFixture(t);
    let result = await wizard(
      t,
      cwd,
      [
        ['Choose project number or action', 'n\n'],
        ['Choose project number or action', '1\n'],
      ],
      environment,
      ['project', 'link']
    );
    assert.equal(result.code, 0, result.output);
    assert.match(result.output, /Linked studio\/web/);
    assert.doesNotMatch(result.output, /vzt_picker_secret/);
    assert.deepEqual(
      calls.map(call => call.url),
      [
        '/api/sdk/projects?limit=10&offset=0',
        '/api/sdk/projects?limit=10&offset=10',
        '/api/cli/web/link-token',
      ]
    );
    let { default: config } = await import(path.join(cwd, 'vizzly.config.js'));
    assert.deepEqual(config.project, {
      organizationSlug: 'studio',
      projectSlug: 'web',
    });
  }
);

ptyTest(
  'cancelling the project picker leaves credentials and checkout untouched',
  { timeout: 30000 },
  async t => {
    for (let answer of ['q\n', '\x03', '\x04']) {
      let { cwd, calls, environment } = await projectPickerFixture(t);
      let filename = path.join(cwd, 'user-state', 'config.json');
      let before = await readFile(filename, 'utf8');
      let result = await wizard(
        t,
        cwd,
        [['Choose project number or action', answer]],
        environment,
        ['project', 'link']
      );
      assert.match(result.output, /cancelled/);
      assert.deepEqual(await readdir(cwd), ['user-state']);
      assert.equal(await readFile(filename, 'utf8'), before);
      assert.ok(calls.every(call => call.method === 'GET'));
    }
  }
);
