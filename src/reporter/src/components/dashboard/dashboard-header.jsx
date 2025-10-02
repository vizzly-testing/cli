import { CheckIcon } from '@heroicons/react/24/outline';

export default function DashboardHeader({
  loading,
  onNavigate,
  currentView,
  onAcceptAll,
  hasChanges,
}) {
  return (
    <nav className="bg-black/20 backdrop-blur-sm border-b border-gray-700">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center space-x-6">
            <button
              onClick={() => onNavigate && onNavigate('comparisons')}
              className="text-2xl font-bold text-amber-500 hover:text-amber-400 transition-colors"
            >
              Vizzly TDD
            </button>

            {onNavigate && (
              <div className="flex items-center space-x-1">
                <button
                  onClick={() => onNavigate('comparisons')}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    currentView === 'comparisons'
                      ? 'bg-amber-500/20 text-amber-400'
                      : 'text-gray-400 hover:text-white hover:bg-slate-700/50'
                  }`}
                >
                  Comparisons
                </button>
                <button
                  onClick={() => onNavigate('stats')}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    currentView === 'stats'
                      ? 'bg-amber-500/20 text-amber-400'
                      : 'text-gray-400 hover:text-white hover:bg-slate-700/50'
                  }`}
                >
                  Stats
                </button>
              </div>
            )}
          </div>
          <div className="flex items-center space-x-4">
            {onAcceptAll && hasChanges && (
              <button
                onClick={onAcceptAll}
                disabled={loading}
                className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white text-sm font-medium px-4 py-2 rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              >
                <CheckIcon className="w-4 h-4" />
                Accept All Changes
              </button>
            )}
            {loading && (
              <div className="flex items-center space-x-2 text-amber-400">
                <div className="w-4 h-4 border-2 border-amber-400/30 border-t-amber-400 rounded-full animate-spin"></div>
                <span className="text-sm">Refreshing...</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
