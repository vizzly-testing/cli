import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import {
  cp,
  mkdtemp,
  readdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { getDimensionsSync } from '@vizzly-testing/honeydiff';
import { createApiClient } from '../../../src/domains/auth/cloud-client.js';
import { CONFIG_DEFAULTS } from '../../../src/domains/config/config-defaults.js';
import { createApiHandler } from '../../../src/domains/screenshots/cloud-handler.js';
import { createTddHandler } from '../../../src/domains/tdd/screenshot-handler.js';
import { createHttpServer } from '../../../src/server/http-server.js';

let run = promisify(execFile);
let packageDir = resolve(import.meta.dirname, '..');
let vitestCli = join(packageDir, 'node_modules/vitest/vitest.mjs');

for (let scenario of ['disabled', 'tdd', 'tdd-run', 'cloud']) {
  test(`browser matcher works in ${scenario} mode`, async t => {
    let workingDir = await mkdtemp(join(tmpdir(), 'vizzly-vitest-browser-'));
    t.after(() => rm(workingDir, { recursive: true, force: true }));
    await writeFile(join(workingDir, 'package.json'), '{"type":"module"}');
    await cp(join(packageDir, 'src'), join(workingDir, 'src'), {
      recursive: true,
    });
    await cp(
      join(packageDir, 'tests/browser'),
      join(workingDir, 'tests/browser'),
      {
        recursive: true,
      }
    );
    await symlink(
      join(packageDir, 'node_modules'),
      join(workingDir, 'node_modules')
    );

    let uploads = [];
    let handler;
    let server;
    let serverUrl = '';
    let buildId = '';
    if (scenario === 'cloud') {
      buildId = 'browser-build';
    } else if (scenario === 'tdd-run') {
      buildId = 'local-build';
    }

    if (scenario === 'cloud') {
      // Only the external cloud API is replaced; captures use the real local server.
      let cloud = createServer(async (req, res) => {
        let chunks = [];
        for await (let chunk of req) chunks.push(chunk);
        uploads.push({
          path: req.url,
          body: JSON.parse(Buffer.concat(chunks)),
        });
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ upload_required: true }));
      });
      await new Promise(resolve => cloud.listen(0, '127.0.0.1', resolve));
      t.after(() => new Promise(resolve => cloud.close(resolve)));
      let client = createApiClient({
        baseUrl: `http://127.0.0.1:${cloud.address().port}`,
        token: 'vzt_browser_test',
      });
      handler = createApiHandler(client);
    } else if (scenario.startsWith('tdd')) {
      handler = createTddHandler(CONFIG_DEFAULTS, workingDir);
      await handler.initialize();
    }

    if (handler) {
      server = createHttpServer(0, handler, { workingDir });
      await server.start();
      t.after(() => server.stop());
      serverUrl = `http://127.0.0.1:${server.getServer().address().port}`;
    }

    let env = {
      ...process.env,
      VIZZLY_HOME: join(workingDir, 'home'),
      VIZZLY_SERVER_URL: serverUrl,
      VIZZLY_BUILD_ID: buildId,
      VIZZLY_FAIL_ON_DIFF: 'true',
      TEST_SCENARIO: scenario,
    };
    delete env.VIZZLY_TOKEN;
    try {
      await run(
        process.execPath,
        [vitestCli, 'run', '--config', 'tests/browser/fixture.config.js'],
        {
          cwd: workingDir,
          env,
        }
      );
    } catch (error) {
      throw new Error(`${error.stdout}\n${error.stderr}`, { cause: error });
    }

    if (scenario === 'disabled') {
      let files = await readdir(join(workingDir, 'tests/browser'));
      assert.ok(!files.includes('__screenshots__'));
    } else if (scenario.startsWith('tdd')) {
      let report = JSON.parse(
        await readFile(join(workingDir, '.vizzly/report-data.json'), 'utf8')
      );
      assert.equal(report.comparisons.length, 3);
      let diff = report.comparisons.find(item => item.name === 'changing-page');
      assert.equal(diff.status, 'failed');
      assert.ok(diff.diffPercentage > 0);
    } else {
      let stats = await handler.flush();
      assert.equal(stats.uploaded, 2);
      assert.equal(stats.failed, 0);
      assert.ok(
        uploads.every(
          upload => upload.path === '/api/sdk/builds/browser-build/screenshots'
        )
      );
      let captures = uploads.filter(upload => upload.body.image_data);
      assert.equal(captures.length, 2);
      let page = captures.find(upload => upload.body.name === 'page').body;
      assert.equal(page.properties.theme, 'light');
      assert.equal(page.threshold, 5);
      assert.equal(page.minClusterSize, 10);
      assert.equal(page.captureMode, 'full_page');
      let button = captures.find(upload => upload.body.name === 'button').body;
      assert.equal(button.captureMode, 'element');
      assert.deepEqual(
        getDimensionsSync(Buffer.from(button.image_data, 'base64')),
        {
          width: 200,
          height: 100,
        }
      );
    }
  });
}
