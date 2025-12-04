import { VIEW_MODES } from '../../utils/constants.js';

export default function ViewModeSelector({ viewMode, onChange }) {
  const modes = [
    { value: VIEW_MODES.OVERLAY, label: 'Overlay', shortLabel: 'Overlay' },
    { value: VIEW_MODES.TOGGLE, label: 'Toggle', shortLabel: 'Toggle' },
    { value: VIEW_MODES.ONION, label: 'Slide', shortLabel: 'Slide' },
    {
      value: VIEW_MODES.SIDE_BY_SIDE,
      label: 'Side by Side',
      shortLabel: 'Side',
    },
  ];

  return (
    <div className="flex gap-1.5 md:gap-2 overflow-x-auto scrollbar-hide pb-1 -mx-1 px-1 scroll-snap-x">
      {modes.map(mode => (
        <button
          type="button"
          key={mode.value}
          className={`flex-shrink-0 px-3 md:px-4 py-2.5 md:py-2 rounded-lg text-sm font-medium transition-colors touch-manipulation scroll-snap-item ${
            viewMode === mode.value
              ? 'bg-amber-500 text-slate-900'
              : 'bg-slate-700 text-slate-300 hover:bg-slate-600 active:bg-slate-500 hover:text-white'
          }`}
          onClick={() => onChange(mode.value)}
        >
          {/* Show short label on mobile, full label on desktop */}
          <span className="md:hidden">{mode.shortLabel}</span>
          <span className="hidden md:inline">{mode.label}</span>
        </button>
      ))}
    </div>
  );
}
