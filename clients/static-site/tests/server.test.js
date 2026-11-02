import { testStaticServer } from '../../../tests/helpers/static-server-contract.js';
import { startStaticServer, stopStaticServer } from '../src/server.js';

testStaticServer('static-site server', { startStaticServer, stopStaticServer });
