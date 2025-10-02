import { VIEW_MODES } from '../../utils/constants.js';

export default function ViewModeSelector({ viewMode, onChange }) {
  let modes = [
    { value: VIEW_MODES.OVERLAY, label: 'Overlay' },
    { value: VIEW_MODES.TOGGLE, label: 'Toggle' },
    { value: VIEW_MODES.ONION, label: 'Onion Skin' },
    { value: VIEW_MODES.SIDE_BY_SIDE, label: 'Side by Side' },
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {modes.map(mode => (
        <button
          key={mode.value}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            viewMode === mode.value
              ? 'bg-amber-500 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white'
          }`}
          onClick={() => onChange(mode.value)}
        >
          {mode.label}
        </button>
      ))}
    </div>
  );
}
