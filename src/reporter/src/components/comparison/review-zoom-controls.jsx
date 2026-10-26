import {
  MagnifyingGlassMinusIcon,
  MagnifyingGlassPlusIcon,
} from '@heroicons/react/24/outline';
import { Dropdown, DropdownItem, IconButton } from '@vizzly-testing/bear-den';
import { stepReviewZoom } from '../../utils/review.js';

let presets = [
  { value: 'fit-width', label: 'Fit width' },
  { value: 'fit', label: 'Fit to screen' },
  { value: 1, label: 'Actual size' },
  { value: 0.25, label: '25%' },
  { value: 0.5, label: '50%' },
  { value: 0.75, label: '75%' },
  { value: 1.5, label: '150%' },
  { value: 2, label: '200%' },
];

export function ReviewZoomControls({ zoom, onChange }) {
  let label =
    { fit: 'Fit screen', 'fit-width': 'Fit width' }[zoom] ||
    `${Math.round(zoom * 100)}%`;
  return (
    <div className="flex shrink-0 items-center">
      <IconButton
        icon={MagnifyingGlassMinusIcon}
        label="Zoom out"
        size="sm"
        variant="ghost"
        onClick={() => onChange(stepReviewZoom(zoom, -0.25))}
      />
      <Dropdown
        align="end"
        trigger={label}
        triggerClassName="review-zoom-trigger"
        width="w-44"
      >
        {presets.map(preset => (
          <DropdownItem
            key={preset.value}
            onClick={() => onChange(preset.value)}
            role="menuitemradio"
            aria-checked={zoom === preset.value}
          >
            {preset.label}
          </DropdownItem>
        ))}
      </Dropdown>
      <IconButton
        icon={MagnifyingGlassPlusIcon}
        label="Zoom in"
        size="sm"
        variant="ghost"
        onClick={() => onChange(stepReviewZoom(zoom, 0.25))}
      />
    </div>
  );
}
