import assert from 'node:assert';
import { describe, it } from 'node:test';
import {
  getPackageInfo,
  getPackageName,
  getPackageVersion,
} from './package-info.js';

describe('utils/package-info', () => {
  describe('getPackageInfo', () => {
    it('returns package.json data', () => {
      let info = getPackageInfo();

      assert.ok(info);
      assert.strictEqual(typeof info.name, 'string');
      assert.strictEqual(typeof info.version, 'string');
    });
  });

  describe('getPackageVersion', () => {
    it('returns version string', () => {
      let version = getPackageVersion();

      assert.strictEqual(typeof version, 'string');
      assert.match(version, /^\d+\.\d+\.\d+/); // Semver format
    });
  });

  describe('getPackageName', () => {
    it('returns package name', () => {
      let name = getPackageName();

      assert.strictEqual(typeof name, 'string');
      assert.strictEqual(name, '@vizzly-testing/cli');
    });
  });
});
