import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline';
import { IconButton } from '@vizzly-testing/bear-den';

/**
 * Step through changes in order. With nothing selected yet, "next" starts at
 * the first change and "previous" at the last.
 */
export function DiffStepper({ bands, selectedBandId, onSelectBand }) {
  if (bands.length === 0) return null;

  let selectedIndex = bands.findIndex(band => band.id === selectedBandId);
  let step = direction => {
    let nextIndex =
      selectedIndex < 0 && direction < 0
        ? bands.length - 1
        : (selectedIndex + direction + bands.length) % bands.length;
    onSelectBand(bands[nextIndex]);
  };

  return (
    <div
      aria-label="Step through changes"
      className="absolute bottom-4 left-1/2 z-30 flex -translate-x-1/2 items-center gap-0.5 rounded-full border border-[var(--bd-border)] bg-[var(--bd-bg)] p-0.5 text-xs shadow-lg"
      role="toolbar"
    >
      <IconButton
        className="rounded-full"
        icon={ChevronUpIcon}
        label="Previous change"
        onClick={() => step(-1)}
        size="sm"
      />
      <span className="min-w-[88px] px-1 text-center font-mono tabular-nums text-[var(--bd-text-secondary)]">
        {selectedIndex < 0
          ? `${bands.length} ${bands.length === 1 ? 'change' : 'changes'}`
          : `${selectedIndex + 1} of ${bands.length}`}
      </span>
      <IconButton
        className="rounded-full"
        icon={ChevronDownIcon}
        label="Next change"
        onClick={() => step(1)}
        size="sm"
      />
    </div>
  );
}
