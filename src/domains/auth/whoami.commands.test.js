import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getTokenExpiryStatus } from './whoami.commands.js';

describe('whoami access-token expiry', () => {
  describe('getTokenExpiryStatus', () => {
    it('explains automatic renewal for expired access tokens', () => {
      let result = getTokenExpiryStatus(
        '2026-05-18T11:59:00.000Z',
        new Date('2026-05-18T12:00:00.000Z')
      );

      assert.deepStrictEqual(result, {
        level: 'warn',
        message: 'Token has expired',
        refreshHint: 'Access tokens renew automatically when needed.',
      });
    });

    it('formats hour-level expiry', () => {
      let result = getTokenExpiryStatus(
        '2026-05-18T14:00:00.000Z',
        new Date('2026-05-18T12:00:00.000Z')
      );

      assert.deepStrictEqual(result, {
        level: 'hint',
        message: 'Token expires in 2 hours',
      });
    });

    it('explains automatic renewal near access-token expiry', () => {
      let result = getTokenExpiryStatus(
        '2026-05-18T12:00:30.000Z',
        new Date('2026-05-18T12:00:00.000Z')
      );

      assert.deepStrictEqual(result, {
        level: 'warn',
        message: 'Token expires in less than a minute',
        refreshHint: 'Access tokens renew automatically when needed.',
      });
    });
  });
});
