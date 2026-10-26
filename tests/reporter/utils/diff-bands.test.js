import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { buildDiffBands } from '../../../src/reporter/src/utils/diff-bands.js';

function region(x, y, width, height, { deltaE = 8 } = {}) {
  return {
    boundingBox: { x, y, width, height },
    appearance: deltaE === null ? null : { mean: deltaE },
  };
}

function rows(bands) {
  return bands.map(band => [band.kind, band.y1, band.y2]);
}

describe('diff gutter bands', () => {
  test('keeps one changed text line together and separate page sections apart', () => {
    let bands = buildDiffBands({
      clusters: [
        // Three glyph clusters on one heading line
        region(100, 300, 40, 24),
        region(150, 302, 30, 22),
        region(190, 300, 60, 24),
        // A second line of the same paragraph, one line-gap below
        region(100, 336, 200, 24),
        // A pricing card far down the page
        region(600, 1100, 80, 30),
      ],
    });

    assert.deepStrictEqual(rows(bands), [
      ['changed', 300, 360],
      ['changed', 1100, 1130],
    ]);
    assert.deepStrictEqual(bands[0].regionIndexes, [0, 2, 1, 3]);
    assert.deepStrictEqual([bands[0].x1, bands[0].x2], [100, 300]);
  });

  test('keeps the pieces of one shifted section together', () => {
    // A row of cards that moved down: a tall band, then a shorter one just
    // below it that starts with a glyph-sized region, then the card bottoms.
    let bands = buildDiffBands({
      clusters: [
        region(0, 356, 900, 147),
        region(400, 521, 6, 8),
        region(0, 523, 900, 44),
        region(0, 575, 900, 254),
      ],
    });

    assert.deepStrictEqual(rows(bands), [['changed', 356, 829]]);
  });

  test('keeps the strongest color change in each band', () => {
    let [band] = buildDiffBands({
      clusters: [
        region(0, 10, 10, 10, { deltaE: 3 }),
        region(20, 12, 10, 10, { deltaE: 14 }),
      ],
    });

    assert.strictEqual(band.deltaE, 14);
  });

  test('treats regions inside an inserted block as part of the insertion', () => {
    let bands = buildDiffBands({
      clusters: [
        region(40, 60, 200, 20),
        region(0, 820, 1280, 96, { deltaE: null }),
      ],
      heightChange: {
        direction: 'added',
        rowCount: 96,
        startRow: 820,
        alignmentApplied: true,
      },
    });

    assert.deepStrictEqual(rows(bands), [
      ['changed', 60, 80],
      ['added', 820, 916],
    ]);
    assert.strictEqual(bands[1].rowCount, 96);
  });

  test('marks removed rows as a seam in the current screenshot', () => {
    let bands = buildDiffBands({
      clusters: [],
      heightChange: {
        direction: 'removed',
        rowCount: 120,
        startRow: 400,
        alignmentApplied: true,
      },
    });

    assert.deepStrictEqual(rows(bands), [['removed', 400, 400]]);
    assert.strictEqual(bands[0].rowCount, 120);
  });

  test('ignores regions without usable bounds', () => {
    let bands = buildDiffBands({
      clusters: [
        null,
        { spatial: {} },
        region(0, 5, 10, 0),
        region(0, 50, 10, 10),
      ],
    });

    assert.deepStrictEqual(rows(bands), [['changed', 50, 60]]);
  });
});
