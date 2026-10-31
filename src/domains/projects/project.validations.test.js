import assert from 'node:assert/strict';
import { it } from 'node:test';
import {
  parseProjectSelector,
  validateProjectLinkOptions,
} from './project.validations.js';

it('parses selectors and rejects missing organization/project', () => {
  assert.deepEqual(parseProjectSelector('team/app'), {
    organizationSlug: 'team',
    projectSlug: 'app',
  });
  assert.deepEqual(parseProjectSelector('app', { org: 'team' }), {
    organizationSlug: 'team',
    projectSlug: 'app',
  });
  assert.deepEqual(validateProjectLinkOptions('team/app'), []);
  assert.deepEqual(validateProjectLinkOptions(null, { org: 'team' }), [
    'Project is required. Use <org>/<project> or --project <slug>.',
  ]);
});
