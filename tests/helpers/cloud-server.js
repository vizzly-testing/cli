import { once } from 'node:events';
import { createServer } from 'node:http';
import { createApiClient } from '../../src/domains/auth/cloud-client.js';

/** Serve an external cloud API fixture while using the real client transport. */
export async function createCloudServer(t, handler) {
  let requests = [];
  let fixtureError;
  let server = createServer(async (request, response) => {
    let chunks = [];
    for await (let chunk of request) chunks.push(chunk);
    let bytes = Buffer.concat(chunks);
    let received = {
      method: request.method,
      url: request.url,
      headers: request.headers,
      bytes,
      body:
        bytes.length &&
        request.headers['content-type']?.includes('application/json')
          ? JSON.parse(bytes.toString())
          : null,
    };
    requests.push(received);
    try {
      let { status = 200, body = {} } = await handler(received, requests);
      response.writeHead(status, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(body));
    } catch (error) {
      fixtureError ||= error;
      response.writeHead(500, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: error.message }));
    }
  });
  let ready = once(server, 'listening');
  server.listen(0, '127.0.0.1');
  await ready;
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    if (fixtureError) throw fixtureError;
  });
  let client = createApiClient({
    baseUrl: `http://127.0.0.1:${server.address().port}`,
    token: 'vzt_test',
    command: 'test',
  });
  return { client, requests };
}
