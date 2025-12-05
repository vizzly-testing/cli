import {
  CameraIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ClockIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import { useState } from 'react';
import { getStatusInfo } from '../../utils/comparison-helpers.js';
import { USER_ACTION, VIEW_MODES } from '../../utils/constants.js';
import StatusBadge from '../ui/status-badge.jsx';
import ComparisonActions from './comparison-actions.jsx';
import ComparisonViewer from './comparison-viewer.jsx';
import VariantSelector from './variant-selector.jsx';
import ViewModeSelector from './view-mode-selector.jsx';

export default function ComparisonCard({
  comparison,
  onAccept,
  onReject,
  userAction,
  variantSelector = null, // { group, selectedIndex, onSelect } when variants exist
}) {
  const [viewMode, setViewMode] = useState(VIEW_MODES.OVERLAY);
  const [isExpanded, setIsExpanded] = useState(comparison.status === 'failed'); // Auto-expand failed tests
  const statusInfo = getStatusInfo(comparison);
  const showActions = comparison.status === 'failed' && !userAction;

  // Determine card styling based on status
  const getBorderStyle = () => {
    if (comparison.status === 'failed')
      return 'border-red-500/50 shadow-lg shadow-red-500/10';
    if (comparison.status === 'baseline-created') return 'border-blue-500/30';
    return 'border-slate-700/50';
  };

  const getHeaderOpacity = () => {
    if (comparison.status === 'passed') return 'opacity-75';
    return 'opacity-100';
  };

  const handleAccept = () => {
    onAccept(comparison.id);
  };

  const handleReject = () => {
    onReject(comparison.id);
  };

  // Get viewport info in a consistent format
  const getViewportInfo = () => {
    if (
      comparison.properties?.viewport_width &&
      comparison.properties?.viewport_height
    ) {
      return `${comparison.properties.viewport_width}×${comparison.properties.viewport_height}`;
    }
    if (comparison.properties?.viewport) {
      return `${comparison.properties.viewport.width}×${comparison.properties.viewport.height}`;
    }
    return null;
  };

  const viewportInfo = getViewportInfo();

  return (
    <div
      className={`bg-white/5 backdrop-blur-sm border rounded-xl transition-all ${getBorderStyle()}`}
    >
      {/* Header - Always Visible */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className={`w-full p-3 md:p-4 text-left hover:bg-white/5 transition-colors touch-manipulation ${getHeaderOpacity()}`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 md:gap-3 flex-1 min-w-0">
            {/* Status Icon - smaller on mobile */}
            <div
              className={`w-7 h-7 md:w-8 md:h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                comparison.status === 'failed'
                  ? 'bg-red-500/20'
                  : comparison.status === 'baseline-created'
                    ? 'bg-blue-500/20'
                    : 'bg-emerald-500/10'
              }`}
            >
              <CameraIcon
                className={`w-3.5 h-3.5 md:w-4 md:h-4 ${
                  comparison.status === 'failed'
                    ? 'text-red-400'
                    : comparison.status === 'baseline-created'
                      ? 'text-blue-400'
                      : 'text-emerald-400'
                }`}
              />
            </div>

            {/* Title and metadata */}
            <div className="flex-1 min-w-0">
              <h3
                className="text-base md:text-lg font-semibold text-white truncate select-text cursor-text"
                onClick={e => e.stopPropagation()}
                onKeyDown={e => e.key === 'Enter' && e.stopPropagation()}
                title={comparison.name || comparison.originalName}
              >
                {comparison.name || comparison.originalName || 'Unknown'}
              </h3>

              {/* Mobile: Status description only */}
              <div className="md:hidden text-xs text-slate-400 mt-0.5">
                {statusInfo.description}
              </div>

              {/* Desktop: Full metadata */}
              <div className="hidden md:flex flex-wrap gap-3 text-xs text-slate-400 mt-1">
                <span className="font-medium">{statusInfo.description}</span>
                {comparison.properties?.browser && (
                  <span>• {comparison.properties.browser}</span>
                )}
                {viewportInfo && <span>• {viewportInfo}</span>}
              </div>
            </div>
          </div>

          {/* Right side: Status badge + expand icon */}
          <div className="flex items-center gap-2 md:gap-3 flex-shrink-0">
            {/* Status badges - hidden on mobile, shown in expanded view instead */}
            <div className="hidden md:block">
              {userAction === USER_ACTION.REJECTED && (
                <StatusBadge
                  icon={ExclamationTriangleIcon}
                  label="Rejected"
                  colorClass="yellow"
                />
              )}
              {userAction === USER_ACTION.ACCEPTED && (
                <StatusBadge
                  icon={statusInfo.icon}
                  label="Accepted"
                  colorClass="green"
                />
              )}
              {userAction === USER_ACTION.ACCEPTING && (
                <StatusBadge
                  icon={ClockIcon}
                  label="Accepting..."
                  colorClass="blue"
                />
              )}
              {!userAction && (
                <StatusBadge
                  icon={statusInfo.icon}
                  label={statusInfo.label}
                  colorClass={statusInfo.colorClass}
                />
              )}
            </div>

            {/* Mobile: Compact status indicator */}
            <div className="md:hidden">
              {comparison.status === 'failed' && (
                <span className="w-2.5 h-2.5 bg-red-500 rounded-full" />
              )}
              {comparison.status === 'baseline-created' && (
                <span className="w-2.5 h-2.5 bg-blue-500 rounded-full" />
              )}
              {comparison.status === 'passed' && (
                <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full" />
              )}
            </div>

            {/* Expand icon */}
            <div className="w-8 h-8 flex items-center justify-center">
              {isExpanded ? (
                <ChevronUpIcon className="w-5 h-5 text-slate-400" />
              ) : (
                <ChevronDownIcon className="w-5 h-5 text-slate-400" />
              )}
            </div>
          </div>
        </div>
      </button>

      {/* Expandable Content */}
      {isExpanded && (
        <div className="px-3 pb-3 md:px-4 md:pb-4 space-y-3 md:space-y-4 border-t border-slate-700/50 animate-slide-down">
          {/* Mobile: Show metadata row */}
          <div className="md:hidden pt-3 flex flex-wrap items-center gap-2 text-xs text-slate-400">
            {comparison.properties?.browser && (
              <span className="bg-slate-700/50 px-2 py-1 rounded">
                {comparison.properties.browser}
              </span>
            )}
            {viewportInfo && (
              <span className="bg-slate-700/50 px-2 py-1 rounded">
                {viewportInfo}
              </span>
            )}
            {/* Mobile status badge */}
            {userAction === USER_ACTION.REJECTED && (
              <span className="bg-amber-500/20 text-amber-400 px-2 py-1 rounded">
                Rejected
              </span>
            )}
            {userAction === USER_ACTION.ACCEPTED && (
              <span className="bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded">
                Accepted
              </span>
            )}
          </div>

          {/* Variant Selector - shown first when multiple variants exist */}
          {variantSelector && (
            <div className="pt-2 md:pt-4">
              <VariantSelector
                group={variantSelector.group}
                selectedIndex={variantSelector.selectedIndex}
                onSelect={variantSelector.onSelect}
              />
            </div>
          )}

          {/* Action Buttons */}
          {showActions && (
            <div className={variantSelector ? '' : 'pt-2 md:pt-4'}>
              <ComparisonActions
                onAccept={handleAccept}
                onReject={handleReject}
                disabled={userAction === USER_ACTION.ACCEPTING}
              />
            </div>
          )}

          {/* View Mode Controls */}
          <div className={variantSelector || showActions ? '' : 'pt-2'}>
            <ViewModeSelector viewMode={viewMode} onChange={setViewMode} />
          </div>

          {/* Comparison Viewer */}
          <div className="bg-slate-900/50 border border-slate-600 rounded-lg overflow-hidden">
            <ComparisonViewer comparison={comparison} viewMode={viewMode} />
          </div>
        </div>
      )}
    </div>
  );
}
