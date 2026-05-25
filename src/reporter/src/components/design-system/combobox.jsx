/**
 * Combobox Component
 * Observatory Design System
 *
 * An accessible searchable dropdown using Downshift
 *
 * Requires peer dependency: downshift
 */

import {
  ChevronUpDownIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { useCombobox } from 'downshift';
import { useId } from 'react';

/**
 * @param {Object} props
 * @param {Array} props.items - Array of items to display
 * @param {Function} props.itemToString - Function to convert item to string
 * @param {Function} props.renderItem - Function to render each item: (item, { highlighted, selected, disabled }) => ReactNode
 * @param {Function} props.filterItems - Custom filter function: (items, inputValue) => filteredItems
 * @param {*} props.selectedItem - Currently selected item
 * @param {Function} props.onSelectedItemChange - Callback when selection changes
 * @param {Function} props.onInputValueChange - Callback when input value changes
 * @param {String} props.placeholder - Placeholder text
 * @param {Boolean} props.disabled - Whether the combobox is disabled
 * @param {Function} props.isItemDisabled - Function to determine if an item is disabled
 * @param {String} props.label - Accessible label
 * @param {String} props.emptyMessage - Message when no items match
 * @param {String} props.size - 'sm' | 'md' | 'lg'
 */
export function Combobox({
  items = [],
  itemToString = item => item?.toString() || '',
  renderItem,
  filterItems,
  selectedItem,
  onSelectedItemChange,
  onInputValueChange,
  placeholder = 'Search...',
  disabled = false,
  isItemDisabled = () => false,
  label,
  emptyMessage = 'No items found',
  size = 'md',
  className = '',
}) {
  let inputId = useId();

  // Default filter: case-insensitive string matching
  let defaultFilterItems = (items, inputValue) => {
    if (!inputValue) return items;
    let lower = inputValue.toLowerCase();
    return items.filter(item =>
      itemToString(item).toLowerCase().includes(lower)
    );
  };

  let filterFn = filterItems || defaultFilterItems;

  let {
    isOpen,
    getToggleButtonProps,
    getLabelProps,
    getMenuProps,
    getInputProps,
    highlightedIndex,
    getItemProps,
    inputValue,
    reset,
  } = useCombobox({
    items,
    itemToString,
    selectedItem,
    onSelectedItemChange: ({ selectedItem: newItem }) => {
      onSelectedItemChange?.(newItem);
    },
    onInputValueChange: ({ inputValue: newValue }) => {
      onInputValueChange?.(newValue);
    },
  });

  let filteredItems = filterFn(items, inputValue);

  let sizeClasses = {
    sm: 'py-2 pl-9 pr-16 text-sm',
    md: 'py-3 pl-10 pr-20',
    lg: 'py-4 pl-12 pr-24 text-lg',
  };

  let iconSizes = {
    sm: 'h-4 w-4',
    md: 'h-5 w-5',
    lg: 'h-6 w-6',
  };

  return (
    <div className={`relative ${className}`}>
      {/* Label */}
      {label && (
        <label
          {...getLabelProps()}
          htmlFor={inputId}
          className="block text-sm font-medium text-[var(--text-secondary)] mb-2"
        >
          {label}
        </label>
      )}

      {/* Input Container */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <MagnifyingGlassIcon
            className={`${iconSizes[size]} text-[var(--text-tertiary)]`}
          />
        </div>

        <input
          {...getInputProps({
            id: inputId,
            disabled,
            placeholder: selectedItem
              ? itemToString(selectedItem)
              : placeholder,
            className: `w-full ${sizeClasses[size]} bg-[var(--vz-raised)] border border-[var(--vz-border)] rounded-lg text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--accent-brand)_45%,transparent)] focus:border-[var(--accent-brand)] disabled:opacity-50 disabled:cursor-not-allowed ${
              selectedItem ? 'font-medium' : ''
            }`,
          })}
        />

        <div className="absolute inset-y-0 right-0 flex items-center pr-2 gap-1">
          {selectedItem && (
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                reset();
              }}
              disabled={disabled}
              className="p-1 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] rounded transition-colors disabled:opacity-50"
              aria-label="Clear selection"
            >
              <XMarkIcon className={iconSizes[size]} />
            </button>
          )}
          <button
            type="button"
            {...getToggleButtonProps({
              disabled,
              'aria-label': 'toggle menu',
              className:
                'p-1 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] rounded transition-colors disabled:opacity-50',
            })}
          >
            <ChevronUpDownIcon className={iconSizes[size]} />
          </button>
        </div>
      </div>

      {/* Dropdown Menu */}
      <ul
        {...getMenuProps({
          className: `absolute z-50 mt-1 w-full bg-[var(--vz-raised)] border border-[var(--vz-border)] rounded-lg shadow-xl max-h-60 overflow-auto ${
            isOpen ? '' : 'hidden'
          }`,
        })}
      >
        {isOpen &&
          (filteredItems.length > 0 ? (
            filteredItems.map((item, index) => {
              let itemDisabled = isItemDisabled(item);
              let highlighted = highlightedIndex === index;
              let selected = selectedItem === item;

              return (
                <li
                  key={`${itemToString(item)}-${index}`}
                  {...getItemProps({
                    item,
                    index,
                    disabled: itemDisabled,
                    className: `relative px-4 py-3 cursor-pointer select-none ${
                      highlighted ? 'bg-white/8' : ''
                    } ${itemDisabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-white/8'} ${
                      selected
                        ? 'bg-[var(--accent-brand-muted)] text-[var(--accent-brand)]'
                        : 'text-[var(--text-secondary)]'
                    }`,
                  })}
                >
                  {renderItem
                    ? renderItem(item, {
                        highlighted,
                        selected,
                        disabled: itemDisabled,
                      })
                    : itemToString(item)}
                </li>
              );
            })
          ) : (
            <li className="px-4 py-3 text-[var(--text-tertiary)] text-sm text-center">
              {emptyMessage}
            </li>
          ))}
      </ul>
    </div>
  );
}
