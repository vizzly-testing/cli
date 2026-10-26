// Group nearby changed rows so a paragraph reads as one change rather than
// dozens of glyph-sized regions. Separate page sections stay separate.
export function buildDiffBands(clusters = []) {
  let spans = clusters
    .flatMap((cluster, index) => {
      let bounds = cluster.boundingBox;
      if (
        !bounds ||
        ![bounds.x, bounds.y, bounds.width, bounds.height].every(
          Number.isFinite
        ) ||
        bounds.width <= 0 ||
        bounds.height <= 0
      )
        return [];
      return [
        {
          y1: bounds.y,
          y2: bounds.y + bounds.height,
          regionIndexes: [index],
          pixelCount: cluster.pixelCount || 0,
        },
      ];
    })
    .sort((a, b) => a.y1 - b.y1 || a.y2 - b.y2);

  let bands = [];
  let previousHeight = 0;
  for (let span of spans) {
    let band = bands.at(-1);
    let height = span.y2 - span.y1;
    if (band && span.y1 - band.y2 <= Math.min(height, previousHeight)) {
      band.y2 = Math.max(band.y2, span.y2);
      band.regionIndexes.push(...span.regionIndexes);
      band.pixelCount += span.pixelCount;
    } else {
      bands.push({ ...span, regionIndexes: [...span.regionIndexes] });
    }
    previousHeight = height;
  }
  return bands.map(band => ({ ...band, id: `${band.y1}-${band.y2}` }));
}

export function describeDiffBand(band) {
  let count = band.regionIndexes.length;
  let regions = `${count} ${count === 1 ? 'region' : 'regions'}`;
  let description = `Rows ${band.y1.toLocaleString()}–${band.y2.toLocaleString()} · ${regions}`;
  return band.pixelCount
    ? `${description} · ${band.pixelCount.toLocaleString()} px`
    : description;
}
