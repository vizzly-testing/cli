import assert from 'node:assert';
import { describe, it } from 'node:test';
import {
  getPackageInfo,
  getPackageName,
  getPackageVersion,
} from '../../src/utils/package-info.js';

describe('utils/package-info', () => {
  describe('getPackageInfo', () => {
    it('returns package.json data', () => {
      let info = getPackageInfo();

      assert.ok(info);
      assert.strictEqual(typeof info.name, 'string');
      assert.strictEqual(typeof info.version, 'string');
    });

    it('caches package.json (returns same reference)', () => {
      let info1 = getPackageInfo();
      let info2 = getPackageInfo();

      assert.strictEqual(info1, info2);
    });

    it('contains expected fields', () => {
      let info = getPackageInfo();

      assert.ok(info.name);
      assert.ok(info.version);
      assert.ok(info.description || info.name); // May or may not have description
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
