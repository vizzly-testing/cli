// Code-diff colors: added rows are green, and changed or removed rows are red.
// These stay fixed rather than following a project's diff overlay color, so
// the gutter reads the same in every project.
let BAND_COLORS = {
  changed: 'var(--bd-danger)',
  added: 'var(--bd-success)',
  removed: 'var(--bd-danger)',
};

let KIND_LABELS = {
  changed: 'Changed',
  added: 'Added',
  removed: 'Removed',
};

// Gutter sizes are in screen pixels. DiffGutter cancels the image wrapper's
// CSS zoom with a counter-zoom layer, so these stay the same size on screen
// at every zoom level.
let GUTTER_WIDTH = 6;
let GUTTER_GAP = 7;
let MIN_BAND_HEIGHT = 4;
let LABEL_GAP = 6;
let LABEL_HEIGHT = 26;

// Below this Delta E a change is hard to see without the diff overlay.
let SUBTLE_DELTA_E = 5;

function formatCount(count, noun) {
  return `${count.toLocaleString()} ${noun}${count === 1 ? '' : 's'}`;
}

function formatRows(band) {
  if (band.y1 === band.y2) return `Row ${band.y1.toLocaleString()}`;
  return `Rows ${band.y1.toLocaleString()}–${band.y2.toLocaleString()}`;
}

function bandDetail(band) {
  if (band.kind !== 'changed') return formatCount(band.rowCount, 'row');

  let detail = formatCount(band.regionIndexes.length, 'region');
  if (band.deltaE !== null && band.deltaE < SUBTLE_DELTA_E)
    return `${detail} · subtle`;
  return detail;
}

function describeBand(band) {
  return `${KIND_LABELS[band.kind]} · ${formatRows(band)} · ${bandDetail(band)}`;
}

/**
 * Faint color shifts read quieter than strong ones. Structural changes
 * (pixels that only exist in one image) have no Delta E and stay solid.
 */
function bandOpacity(band) {
  if (band.kind !== 'changed' || band.deltaE === null) return 1;
  return Math.min(1, Math.max(0.55, 0.55 + band.deltaE / 20));
}

function bandPosition(band, imageHeight, minHeight) {
  let top = (band.y1 / imageHeight) * 100;
  let height = ((band.y2 - band.y1) / imageHeight) * 100;
  return {
    top:
      band.kind === 'removed'
        ? `calc(${top}% - ${minHeight / 2}px)`
        : `${top}%`,
    height: `max(${height}%, ${minHeight}px)`,
  };
}

function BandLabel({ band, index, total, style }) {
  return (
    <div
      className="absolute z-10 flex items-center gap-2 whitespace-nowrap rounded-[7px] border border-[var(--bd-border)] bg-[var(--bd-bg)] px-2.5 text-xs shadow-lg"
      data-testid="diff-gutter-label"
      role="status"
      style={{ height: LABEL_HEIGHT, ...style }}
    >
      <span
        aria-hidden="true"
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ background: BAND_COLORS[band.kind] }}
      />
      <span className="font-medium text-[var(--bd-text-primary)]">
        {KIND_LABELS[band.kind]}
      </span>
      <span className="font-mono tabular-nums text-[var(--bd-text-secondary)]">
        {formatRows(band)}
      </span>
      <span className="text-[var(--bd-text-muted)]">{bandDetail(band)}</span>
      <span className="font-mono tabular-nums text-[var(--bd-text-muted)]">
        {index + 1}/{total}
      </span>
    </div>
  );
}

function ActiveBand({ band, imageWidth, imageHeight }) {
  let color = BAND_COLORS[band.kind];
  return (
    <>
      <div
        aria-hidden="true"
        className="absolute inset-x-0"
        data-testid="diff-gutter-highlight"
        style={{
          ...bandPosition(band, imageHeight, 2),
          background: `color-mix(in srgb, ${color} 12%, transparent)`,
        }}
      />
      {band.kind === 'changed' && imageWidth > 0 && (
        <div
          aria-hidden="true"
          className="absolute rounded-[3px] border-2 border-dashed"
          data-testid="diff-gutter-outline"
          style={{
            ...bandPosition(band, imageHeight, 12),
            left: `${(band.x1 / imageWidth) * 100}%`,
            width: `max(${((band.x2 - band.x1) / imageWidth) * 100}%, 12px)`,
            borderColor: color,
            background: `color-mix(in srgb, ${color} 6%, transparent)`,
          }}
        />
      )}
    </>
  );
}

/**
 * A strip beside the screenshot that marks every changed band of rows. It
 * scrolls and zooms with the image, so each mark sits next to its change.
 * The active band also tints its rows and outlines its changed area, like a
 * highlighted line in a code diff.
 *
 * Everything renders in one layer with `zoom: 1 / scale`. Nested zoom
 * multiplies, so inside the layer lengths are screen pixels again while
 * percentages still track the zoomed image.
 */
export function DiffGutter({
  bands,
  imageWidth,
  imageHeight,
  scale,
  activeBandId,
  onHoverBand,
  onSelectBand,
}) {
  if (!imageHeight || bands.length === 0) return null;

  let left = -(GUTTER_WIDTH + GUTTER_GAP);
  let activeIndex = bands.findIndex(band => band.id === activeBandId);
  let activeBand = bands[activeIndex];

  // The label sits above the band so it never covers the change itself, and
  // drops below it when there is no room above.
  let [labelRow, labelOffset] =
    activeBand && activeBand.y1 * scale > LABEL_HEIGHT + LABEL_GAP
      ? [activeBand.y1, -(LABEL_HEIGHT + LABEL_GAP)]
      : [activeBand?.y2, LABEL_GAP];

  return (
    <div
      className="pointer-events-none absolute inset-0 z-30"
      style={{ zoom: 1 / scale }}
    >
      {activeBand && (
        <ActiveBand
          band={activeBand}
          imageWidth={imageWidth}
          imageHeight={imageHeight}
        />
      )}

      <nav
        aria-label="Changes"
        className="pointer-events-auto absolute top-0 bottom-0"
        style={{ left, width: GUTTER_WIDTH }}
      >
        {bands.map(band => {
          let active = band.id === activeBandId;
          return (
            <button
              aria-current={active ? 'true' : undefined}
              aria-label={describeBand(band)}
              // A wider hit area than the visible bar, so it's easy to grab.
              className="group absolute -inset-x-1 cursor-pointer outline-none"
              key={band.id}
              onBlur={() => onHoverBand(null)}
              onClick={() => onSelectBand(band)}
              onFocus={() => onHoverBand(band.id)}
              onMouseEnter={() => onHoverBand(band.id)}
              onMouseLeave={() => onHoverBand(null)}
              style={bandPosition(band, imageHeight, MIN_BAND_HEIGHT)}
              type="button"
            >
              <span
                className="absolute inset-y-0 right-1 left-1 origin-right rounded-[3px] transition-transform duration-150 ease-out group-hover:scale-x-150 group-focus-visible:scale-x-150 group-aria-[current=true]:scale-x-150"
                style={{
                  background: BAND_COLORS[band.kind],
                  opacity: active ? 1 : bandOpacity(band),
                }}
              />
            </button>
          );
        })}
      </nav>

      {activeBand && (
        <BandLabel
          band={activeBand}
          index={activeIndex}
          style={{
            left,
            top: `calc(${(labelRow / imageHeight) * 100}% + ${labelOffset}px)`,
          }}
          total={bands.length}
        />
      )}
    </div>
  );
}

/**
 * Center a band in the scrolling viewer.
 */
export function scrollBandIntoView({ container, image, band, imageHeight }) {
  if (!container || !image || !imageHeight) return;
  let containerRect = container.getBoundingClientRect();
  let imageRect = image.getBoundingClientRect();
  if (imageRect.height <= 0) return;

  let imageTop = imageRect.top - containerRect.top + container.scrollTop;
  let center = ((band.y1 + band.y2) / 2 / imageHeight) * imageRect.height;
  let reduceMotion = window.matchMedia(
    '(prefers-reduced-motion: reduce)'
  ).matches;
  container.scrollTo({
    top: imageTop + center - container.clientHeight / 2,
    behavior: reduceMotion ? 'auto' : 'smooth',
  });
}
