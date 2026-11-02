import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';

export function testStaticServer(
  name,
  { startStaticServer, stopStaticServer }
) {
  describe(name, () => {
    let workspace;
    let serverInfo;
    let binary = Buffer.from([0, 1, 2, 3, 254, 255]);

    beforeEach(async () => {
      workspace = await mkdtemp(join(tmpdir(), 'vizzly-static-server-'));
      let root = join(workspace, 'site');
      await mkdir(join(root, 'assets'), { recursive: true });
      await mkdir(join(root, 'docs'));
      await Promise.all([
        writeFile(join(root, 'index.html'), '<h1>Home</h1>'),
        writeFile(join(root, 'iframe.html'), '<h1>Story</h1>'),
        writeFile(join(root, 'index.json'), '{"entries":{}}'),
        writeFile(join(root, 'docs', 'index.html'), '<h1>Docs</h1>'),
        writeFile(join(root, 'about.html'), '<h1>About</h1>'),
        writeFile(join(root, 'assets', 'app.js'), 'window.loaded = true;'),
        writeFile(join(root, 'assets', 'space name.bin'), binary),
        writeFile(join(root, '.env'), 'PRIVATE_TOKEN=secret'),
        writeFile(join(workspace, 'private.txt'), 'outside-root-secret'),
      ]);
      serverInfo = await startStaticServer(root);
    });

    afterEach(async () => {
      await stopStaticServer(serverInfo);
      await rm(workspace, { recursive: true, force: true });
    });

    it('serves index pages, Storybook routes and assets without stripping extensions', async () => {
      for (let [path, content] of [
        ['/', '<h1>Home</h1>'],
        ['/index.html', '<h1>Home</h1>'],
        ['/iframe.html?id=button--primary&viewMode=story', '<h1>Story</h1>'],
        ['/docs/', '<h1>Docs</h1>'],
        ['/index.json', '{"entries":{}}'],
      ]) {
        let response = await fetch(`${serverInfo.url}${path}`, {
          redirect: 'manual',
        });
        assert.equal(response.status, 200, path);
        assert.equal(await response.text(), content, path);
      }

      let script = await fetch(`${serverInfo.url}/assets/app.js`);
      assert.equal(script.status, 200);
      assert.match(script.headers.get('content-type'), /javascript/);
      assert.equal(await script.text(), 'window.loaded = true;');

      let image = await fetch(`${serverInfo.url}/assets/space%20name.bin`);
      assert.equal(image.status, 200);
      assert.deepEqual(Buffer.from(await image.arrayBuffer()), binary);
    });

    it('supports HEAD, conditional requests and byte ranges', async () => {
      let url = `${serverInfo.url}/assets/space%20name.bin`;
      let head = await fetch(url, { method: 'HEAD' });
      assert.equal(head.status, 200);
      assert.equal(head.headers.get('content-length'), String(binary.length));
      assert.equal(await head.text(), '');
      let etag = head.headers.get('etag');
      assert.ok(etag);

      let cached = await fetch(url, {
        cache: 'no-cache',
        headers: { 'if-none-match': etag },
      });
      assert.equal(cached.status, 304);
      assert.equal(await cached.text(), '');

      let range = await fetch(url, { headers: { range: 'bytes=1-3' } });
      assert.equal(range.status, 206);
      assert.equal(range.headers.get('content-range'), 'bytes 1-3/6');
      assert.deepEqual(
        Buffer.from(await range.arrayBuffer()),
        binary.subarray(1, 4)
      );

      let invalid = await fetch(url, { headers: { range: 'bytes=100-200' } });
      assert.equal(invalid.status, 416);
      assert.equal(invalid.headers.get('content-range'), 'bytes */6');
    });

    it('rejects missing files, hidden files, traversal and unsupported methods', async () => {
      for (let path of ['/missing.js', '/about', '/.env']) {
        let response = await fetch(`${serverInfo.url}${path}`);
        assert.equal(response.status, 404, path);
        assert.doesNotMatch(await response.text(), /PRIVATE_TOKEN/);
      }

      let traversal = await fetch(`${serverInfo.url}/%2e%2e%2fprivate.txt`);
      assert.ok([403, 404].includes(traversal.status));
      assert.doesNotMatch(await traversal.text(), /outside-root-secret/);

      let malformed = await fetch(`${serverInfo.url}/%E0%A4%A`);
      assert.equal(malformed.status, 400);

      let post = await fetch(`${serverInfo.url}/index.html`, {
        method: 'POST',
      });
      assert.equal(post.status, 405);
      assert.equal(post.headers.get('allow'), 'GET, HEAD');
    });

    it('stops accepting requests after shutdown', async () => {
      let url = `${serverInfo.url}/index.html`;
      assert.equal((await fetch(url)).status, 200);
      await stopStaticServer(serverInfo);
      serverInfo = null;
      await assert.rejects(fetch(url));
    });
  });
}
