import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildDiffBands } from '../../../src/reporter/src/utils/diff-bands.js';

function region(y, height, pixelCount = 10) {
  return { boundingBox: { x: 10, y, width: 100, height }, pixelCount };
}

test('nearby text regions merge while separate page sections remain distinct', () => {
  let bands = buildDiffBands([
    region(500, 30),
    region(20, 10),
    region(0, 10),
    region(8, 12),
  ]);
  assert.deepEqual(
    bands.map(({ y1, y2, pixelCount, regionIndexes }) => ({
      y1,
      y2,
      pixelCount,
      regionIndexes,
    })),
    [
      { y1: 0, y2: 30, pixelCount: 30, regionIndexes: [2, 3, 1] },
      { y1: 500, y2: 530, pixelCount: 10, regionIndexes: [0] },
    ]
  );
});

test('invalid or empty region bounds do not create change markers', () => {
  assert.deepEqual(
    buildDiffBands([
      {},
      region(0, 0),
      region(Number.NaN, 10),
      { boundingBox: { x: 0, y: 0, width: -1, height: 20 } },
    ]),
    []
  );
  assert.deepEqual(buildDiffBands(), []);
});
