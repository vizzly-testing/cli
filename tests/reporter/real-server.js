// Run the production server in the fixture directory, with isolated local state.
import { createTddHandler } from '../../src/server/handlers/tdd-handler.js';
import { createHttpServer } from '../../src/server/http-server.js';

let handler = createTddHandler({}, process.cwd());
let server = createHttpServer(Number(process.env.REPORTER_TEST_PORT), handler, {
  workingDir: process.cwd(),
});
let shutdown;
let stop = () => {
  shutdown ??= server.stop().then(() => {
    handler.cleanup();
    if (process.connected) process.disconnect();
  });
  return shutdown;
};

process.on('message', message => {
  if (message === 'stop') void stop();
});
process.once('disconnect', stop);
process.once('SIGTERM', stop);
process.once('SIGINT', stop);
await server.start();
process.send({ ready: true, port: server.getServer().address().port });
