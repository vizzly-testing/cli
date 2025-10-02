import {
  CameraIcon,
  CheckCircleIcon,
  MagnifyingGlassIcon,
  ExclamationCircleIcon,
} from '@heroicons/react/24/outline';

export function WaitingForScreenshots() {
  return (
    <div className="min-h-screen bg-slate-900 flex flex-col">
      <div className="flex-1 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center">
          <div className="mb-12">
            <div className="w-16 h-16 bg-amber-500/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <CameraIcon className="w-8 h-8 text-amber-400" />
            </div>
            <h1 className="text-3xl font-bold text-white mb-4">
              TDD Server Running
            </h1>
            <p className="text-xl text-gray-300 mb-2">
              Server is ready to receive screenshots
            </p>
            <div className="inline-flex items-center space-x-2 bg-green-500/20 border border-green-500/30 rounded-lg px-4 py-2">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
              <span className="text-green-400 text-sm font-medium">
                Ready for connections
              </span>
            </div>
          </div>

          <div className="bg-white/5 backdrop-blur-sm border border-gray-700 rounded-xl p-8 mb-8">
            <h3 className="text-lg font-semibold text-white mb-6">
              Waiting for Screenshots
            </h3>
            <p className="text-gray-300 mb-6">
              Run your tests to start capturing visual comparisons:
            </p>
            <div className="space-y-3">
              <div className="bg-gray-800/50 border border-gray-600 rounded-lg p-4 font-mono text-sm text-gray-300">
                npm test --watch
              </div>
              <div className="bg-gray-800/50 border border-gray-600 rounded-lg p-4 font-mono text-sm text-gray-300">
                npm run test:watch
              </div>
            </div>
          </div>

          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center space-x-2 bg-amber-500 hover:bg-amber-600 text-white font-medium px-6 py-3 rounded-lg transition-colors"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            <span>Refresh</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export function AllPassed() {
  return (
    <div className="text-center py-16">
      <div className="w-16 h-16 bg-green-500/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
        <CheckCircleIcon className="w-8 h-8 text-green-400" />
      </div>
      <h2 className="text-2xl font-bold text-white mb-4">
        All Visual Tests Passed!
      </h2>
      <p className="text-gray-400 max-w-md mx-auto">
        No visual differences detected in your screenshots. Your UI is
        consistent with the baseline.
      </p>
    </div>
  );
}

export function NoResults() {
  return (
    <div className="text-center py-16">
      <div className="w-16 h-16 bg-gray-500/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
        <MagnifyingGlassIcon className="w-8 h-8 text-gray-400" />
      </div>
      <h3 className="text-xl font-semibold text-white mb-2">
        No Results Found
      </h3>
      <p className="text-gray-400">
        No comparisons match your current filter selection.
      </p>
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 bg-red-500/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <ExclamationCircleIcon className="w-8 h-8 text-red-400" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-4">
          Error Loading Report
        </h2>
        <p className="text-gray-400 mb-8">{error}</p>
        <button
          onClick={onRetry}
          className="inline-flex items-center space-x-2 bg-amber-500 hover:bg-amber-600 text-white font-medium px-6 py-3 rounded-lg transition-colors"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          <span>Retry</span>
        </button>
      </div>
    </div>
  );
}

export function LoadingState() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-gray-300">Loading visual comparison report...</p>
      </div>
    </div>
  );
}
