// Run the production server in the fixture directory, with isolated local state.
import { createTddHandler } from '../../../src/server/handlers/tdd-handler.js';
import { createHttpServer } from '../../../src/server/http-server.js';

import { createAuthService } from '../../../src/services/auth-service.js';
import { createConfigService } from '../../../src/services/config-service.js';
import { createProjectService } from '../../../src/services/project-service.js';
import { saveAuthTokens } from '../../../src/utils/global-config.js';

let apiUrl = process.env.REPORTER_TEST_API_URL;
if (process.env.REPORTER_TEST_SIGNED_IN === 'true') {
  await saveAuthTokens({
    accessToken: 'reporter-access',
    refreshToken: 'reporter-refresh',
    expiresAt: '2100-01-01T00:00:00Z',
    user: { username: 'test-user' },
  });
}
let handler = createTddHandler({ apiUrl }, process.cwd());
let server = createHttpServer(0, handler, {
  workingDir: process.cwd(),
  authService: createAuthService({ apiUrl }),
  configService: createConfigService({ workingDir: process.cwd() }),
  projectService: createProjectService({ apiUrl }),
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
