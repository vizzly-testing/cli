import assert from 'node:assert/strict';
import { it } from 'node:test';
import { parseLinkTarget } from './project.validations.js';

it('accepts a known UUID without requiring an organization', () => {
  assert.deepEqual(parseLinkTarget('AAAAAAAA-1234-4567-8910-123456789ABC'), {
    projectId: 'aaaaaaaa-1234-4567-8910-123456789abc',
  });
});

it('accepts qualified project names or matching flags', () => {
  let expected = { organizationSlug: 'team', projectSlug: 'web' };
  assert.deepEqual(parseLinkTarget('Team/Web'), expected);
  assert.deepEqual(parseLinkTarget('web', { org: 'team' }), expected);
  assert.deepEqual(
    parseLinkTarget(null, { org: 'team', project: 'web' }),
    expected
  );
  assert.deepEqual(
    parseLinkTarget('Team/Web', { org: 'team', project: 'web' }),
    expected
  );
});

it('keeps an organization filter available for the interactive picker', () => {
  assert.equal(parseLinkTarget(undefined, { org: 'team' }), null);
});

it('rejects incomplete, malformed, and conflicting selectors', () => {
  let inputs = [
    ['web', {}],
    ['team/web/extra', {}],
    ['team/', {}],
    ['team/my web', {}],
    ['team/web', { org: 'other' }],
    ['team/web', { project: 'other' }],
    ['web', { org: 'team', project: 'other' }],
    ['aaaaaaaa-1234-4567-8910-123456789abc', { org: 'team' }],
  ];
  for (let [selector, options] of inputs) {
    assert.throws(() => parseLinkTarget(selector, options), {
      code: 'PROJECT_INPUT_REQUIRED',
    });
  }
});
