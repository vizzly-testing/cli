import {
  ComputerDesktopIcon,
  DevicePhoneMobileIcon,
  DeviceTabletIcon,
} from '@heroicons/react/24/outline';

/**
 * Device icon helper
 */
const DeviceIcon = ({ viewportWidth, className = 'w-3 h-3' }) => {
  if (!viewportWidth) return <ComputerDesktopIcon className={className} />;

  if (viewportWidth <= 768) {
    return <DevicePhoneMobileIcon className={className} title="Mobile" />;
  } else if (viewportWidth <= 1024) {
    return <DeviceTabletIcon className={className} title="Tablet" />;
  } else {
    return <ComputerDesktopIcon className={className} title="Desktop" />;
  }
};

/**
 * Variant selector for toggling between different viewport sizes and browsers
 * Matches cloud product's variant selection UI
 */
export default function VariantSelector({ group, selectedIndex, onSelect }) {
  if (!group || !group.comparisons || group.comparisons.length <= 1) {
    return null; // Don't show selector for single variant
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs text-gray-400 font-medium">Variants:</span>
      <div className="flex gap-1 flex-wrap">
        {group.comparisons.map((comparison, index) => {
          let viewport = '';
          let viewportWidth = null;

          if (
            comparison.properties?.viewport_width &&
            comparison.properties?.viewport_height
          ) {
            viewport = `${comparison.properties.viewport_width}×${comparison.properties.viewport_height}`;
            viewportWidth = comparison.properties.viewport_width;
          }

          let browser = comparison.properties?.browser || null;
          let hasChange =
            comparison.status === 'failed' || comparison.status === 'new';

          // Build label: show viewport, and browser badge if present
          let label = viewport || `Variant ${index + 1}`;
          let isSelected = selectedIndex === index;

          return (
            <button
              key={comparison.id || index}
              onClick={() => onSelect(index)}
              className={`
                relative inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium
                transition-all duration-200
                ${
                  isSelected
                    ? 'bg-blue-500 text-white shadow-md shadow-blue-500/50'
                    : 'bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white border border-gray-600/50'
                }
              `}
              title={`${browser || 'Unknown browser'} - ${viewport || 'Unknown size'}${hasChange ? ' (Changed)' : ''}`}
            >
              {/* Change indicator dot */}
              {hasChange && (
                <span
                  className={`absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full ${
                    comparison.status === 'failed'
                      ? 'bg-red-500'
                      : 'bg-yellow-500'
                  } border-2 border-gray-900`}
                />
              )}

              {viewportWidth && (
                <DeviceIcon
                  viewportWidth={viewportWidth}
                  className={`w-3 h-3 ${isSelected ? 'text-white' : 'text-gray-400'}`}
                />
              )}
              <span className="font-mono">{label}</span>
              {browser && (
                <span
                  className={`
                  px-1.5 py-0.5 rounded text-[10px] font-medium uppercase
                  ${isSelected ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'}
                `}
                >
                  {browser}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
