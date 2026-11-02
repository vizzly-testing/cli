import { testStaticServer } from '../../../tests/helpers/static-server-contract.js';
import { startStaticServer, stopStaticServer } from '../src/server.js';

testStaticServer('storybook static server', {
  startStaticServer,
  stopStaticServer,
});
