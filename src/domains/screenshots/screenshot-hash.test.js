import assert from 'node:assert';
import { describe, it } from 'node:test';
import {
  computeSha256,
  findScreenshotBySha,
  partitionByShaExistence,
  shaExists,
} from './screenshot-hash.js';

describe('computeSha256', () => {
  it('computes deterministic hash for buffer', () => {
    let buffer = Buffer.from('hello world');
    let result = computeSha256(buffer);

    // Known SHA256 of "hello world"
    assert.strictEqual(
      result,
      'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9'
    );
  });

  it('returns different hash for different content', () => {
    let hash1 = computeSha256(Buffer.from('hello'));
    let hash2 = computeSha256(Buffer.from('world'));

    assert.notStrictEqual(hash1, hash2);
  });

  it('returns 64 character hex string', () => {
    let result = computeSha256(Buffer.from('test'));

    assert.match(result, /^[a-f0-9]{64}$/);
  });
});

describe('partitionByShaExistence', () => {
  it('partitions screenshots by existing SHAs', () => {
    let screenshots = [
      { sha256: 'aaa', name: 'one' },
      { sha256: 'bbb', name: 'two' },
      { sha256: 'ccc', name: 'three' },
    ];
    let existingShas = ['aaa', 'ccc'];

    let result = partitionByShaExistence(screenshots, existingShas);

    assert.strictEqual(result.existing.length, 2);
    assert.strictEqual(result.toUpload.length, 1);
    assert.strictEqual(result.toUpload[0].name, 'two');
  });

  it('works with Set input', () => {
    let screenshots = [{ sha256: 'aaa', name: 'one' }];
    let existingShas = new Set(['aaa']);

    let result = partitionByShaExistence(screenshots, existingShas);

    assert.strictEqual(result.existing.length, 1);
    assert.strictEqual(result.toUpload.length, 0);
  });

  it('handles empty existing set', () => {
    let screenshots = [{ sha256: 'aaa', name: 'one' }];

    let result = partitionByShaExistence(screenshots, []);

    assert.strictEqual(result.existing.length, 0);
    assert.strictEqual(result.toUpload.length, 1);
  });
});

describe('shaExists', () => {
  it('returns true when SHA is in existing array', () => {
    let checkResult = { existing: ['abc', 'def'] };

    assert.strictEqual(shaExists(checkResult, 'abc'), true);
  });

  it('returns false when SHA is not in existing array', () => {
    let checkResult = { existing: ['abc', 'def'] };

    assert.strictEqual(shaExists(checkResult, 'xyz'), false);
  });

  it('returns false for null checkResult', () => {
    assert.strictEqual(shaExists(null, 'abc'), false);
  });

  it('returns false for missing existing array', () => {
    assert.strictEqual(shaExists({}, 'abc'), false);
  });
});

describe('findScreenshotBySha', () => {
  it('finds screenshot by SHA', () => {
    let checkResult = {
      screenshots: [
        { sha256: 'abc', name: 'one' },
        { sha256: 'def', name: 'two' },
      ],
    };

    let result = findScreenshotBySha(checkResult, 'def');

    assert.deepStrictEqual(result, { sha256: 'def', name: 'two' });
  });

  it('returns null when SHA not found', () => {
    let checkResult = { screenshots: [{ sha256: 'abc', name: 'one' }] };

    assert.strictEqual(findScreenshotBySha(checkResult, 'xyz'), null);
  });

  it('returns null for null checkResult', () => {
    assert.strictEqual(findScreenshotBySha(null, 'abc'), null);
  });

  it('returns null for missing screenshots array', () => {
    assert.strictEqual(findScreenshotBySha({}, 'abc'), null);
  });
});
