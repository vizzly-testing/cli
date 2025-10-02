import { useState } from 'react';
import {
  CameraIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from '@heroicons/react/24/outline';
import ComparisonViewer from './comparison-viewer.jsx';
import ComparisonActions from './comparison-actions.jsx';
import ViewModeSelector from './view-mode-selector.jsx';
import StatusBadge from '../ui/status-badge.jsx';
import { getStatusInfo } from '../../utils/comparison-helpers.js';
import { VIEW_MODES, USER_ACTION } from '../../utils/constants.js';

export default function ComparisonCard({
  comparison,
  onAccept,
  onReject,
  userAction,
}) {
  let [viewMode, setViewMode] = useState(VIEW_MODES.OVERLAY);
  let [isExpanded, setIsExpanded] = useState(comparison.status === 'failed'); // Auto-expand failed tests
  let statusInfo = getStatusInfo(comparison);
  let showActions = comparison.status === 'failed' && !userAction;

  // Determine card styling based on status
  let getBorderStyle = () => {
    if (comparison.status === 'failed')
      return 'border-red-500/50 shadow-lg shadow-red-500/10';
    if (comparison.status === 'baseline-created') return 'border-blue-500/30';
    return 'border-gray-700/50';
  };

  let getHeaderOpacity = () => {
    if (comparison.status === 'passed') return 'opacity-75';
    return 'opacity-100';
  };

  let handleAccept = () => {
    onAccept(comparison.name);
  };

  let handleReject = () => {
    onReject(comparison.name);
  };

  return (
    <div
      className={`bg-white/5 backdrop-blur-sm border rounded-xl transition-all ${getBorderStyle()}`}
    >
      {/* Header - Always Visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={`w-full p-4 text-left hover:bg-white/5 transition-colors ${getHeaderOpacity()}`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3 flex-1 min-w-0">
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                comparison.status === 'failed'
                  ? 'bg-red-500/20'
                  : comparison.status === 'baseline-created'
                    ? 'bg-blue-500/20'
                    : 'bg-green-500/10'
              }`}
            >
              <CameraIcon
                className={`w-4 h-4 ${
                  comparison.status === 'failed'
                    ? 'text-red-400'
                    : comparison.status === 'baseline-created'
                      ? 'text-blue-400'
                      : 'text-green-400'
                }`}
              />
            </div>

            <div className="flex-1 min-w-0">
              <h3
                className="text-lg font-semibold text-white truncate select-text cursor-text"
                onClick={e => e.stopPropagation()}
                title={comparison.name || comparison.originalName}
              >
                {comparison.name || comparison.originalName || 'Unknown'}
              </h3>
              <div className="flex flex-wrap gap-3 text-xs text-gray-400 mt-1">
                <span className="font-medium">{statusInfo.description}</span>
                {comparison.properties?.browser && (
                  <span>• {comparison.properties.browser}</span>
                )}
                {comparison.properties?.viewport && (
                  <span>
                    • {comparison.properties.viewport.width}×
                    {comparison.properties.viewport.height}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-3 flex-shrink-0 ml-4">
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

            {isExpanded ? (
              <ChevronUpIcon className="w-5 h-5 text-gray-400" />
            ) : (
              <ChevronDownIcon className="w-5 h-5 text-gray-400" />
            )}
          </div>
        </div>
      </button>

      {/* Expandable Content */}
      {isExpanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-gray-700/50">
          {/* Action Buttons */}
          {showActions && (
            <div className="pt-4">
              <ComparisonActions
                onAccept={handleAccept}
                onReject={handleReject}
                disabled={userAction === USER_ACTION.ACCEPTING}
              />
            </div>
          )}

          {/* View Mode Controls */}
          <div className="pt-2">
            <ViewModeSelector viewMode={viewMode} onChange={setViewMode} />
          </div>

          {/* Comparison Viewer */}
          <div className="bg-gray-900/50 border border-gray-600 rounded-lg overflow-hidden">
            <ComparisonViewer comparison={comparison} viewMode={viewMode} />
          </div>
        </div>
      )}
    </div>
  );
}
