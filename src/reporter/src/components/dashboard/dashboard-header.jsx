export default function DashboardHeader({ loading, onNavigate, currentView }) {
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
                <button
                  onClick={() => onNavigate('projects')}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    currentView === 'projects'
                      ? 'bg-amber-500/20 text-amber-400'
                      : 'text-gray-400 hover:text-white hover:bg-slate-700/50'
                  }`}
                >
                  Projects
                </button>
                <button
                  onClick={() => onNavigate('settings')}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    currentView === 'settings'
                      ? 'bg-amber-500/20 text-amber-400'
                      : 'text-gray-400 hover:text-white hover:bg-slate-700/50'
                  }`}
                >
                  Settings
                </button>
              </div>
            )}
          </div>
          <div className="flex items-center space-x-4">
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
