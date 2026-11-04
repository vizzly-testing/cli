// Run the production server in the fixture directory, with isolated local state.

import { createHttpServer } from '../../../src/adapters/http/http-server.js';
import { createAuthService } from '../../../src/domains/auth/auth.service.js';
import { createConfigService } from '../../../src/domains/config/config.service.js';
import { createProjectService } from '../../../src/domains/projects/project.service.js';
import { createTddHandler } from '../../../src/domains/tdd/screenshot-handler.js';
import { saveFixtureAuth } from '../../helpers/auth-session.js';

let apiUrl = process.env.REPORTER_TEST_API_URL;
if (process.env.REPORTER_TEST_SIGNED_IN === 'true') {
  await saveFixtureAuth(process.env.VIZZLY_HOME, apiUrl, {
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
