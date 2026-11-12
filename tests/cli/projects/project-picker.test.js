import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdir, readdir, readFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { getAuthStoragePath } from '../../../src/domains/auth/token-store.js';
import { saveFixtureAuth } from '../../helpers/auth-session.js';
import {
  terminalFixture as fixture,
  terminalTest as ptyTest,
  runTerminal as wizard,
} from '../../helpers/terminal-runner.js';

async function projectPickerFixture(t) {
  let cwd = await fixture(t);
  let calls = [];
  let projects = Array.from({ length: 11 }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
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
    } else {
      response.statusCode = 404;
      response.end(JSON.stringify({ error: 'Unexpected fixture request' }));
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  await mkdir(path.join(cwd, 'user-state'));
  let apiUrl = `http://127.0.0.1:${server.address().port}`;
  let home = path.join(cwd, 'user-state');
  await saveFixtureAuth(home, apiUrl, { accessToken: 'fixture-picker-user' });
  let authPath = getAuthStoragePath(apiUrl, home);
  let environment = {
    VIZZLY_API_URL: apiUrl,
    VIZZLY_NO_UPDATE_NOTIFIER: '1',
  };
  return { cwd, calls, environment, authPath };
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
      ]
    );
    let binding = JSON.parse(
      await readFile(path.join(cwd, 'vizzly.project.json'), 'utf8')
    );
    assert.deepEqual(binding, {
      version: 1,
      apiOrigin: environment.VIZZLY_API_URL,
      projectId: '00000000-0000-4000-8000-000000000011',
    });
    assert.deepEqual(await readdir(cwd), ['user-state', 'vizzly.project.json']);
  }
);

ptyTest(
  'cancelling the project picker leaves credentials and checkout untouched',
  { timeout: 30000 },
  async t => {
    for (let answer of ['q\n', '\x03', '\x04']) {
      let {
        cwd,
        calls,
        environment,
        authPath: filename,
      } = await projectPickerFixture(t);
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
