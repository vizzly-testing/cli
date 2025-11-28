import { useState } from 'react';
import { Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline';

export default function DashboardHeader({ loading, onNavigate, currentView }) {
  let [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  let navItems = [
    { key: 'comparisons', label: 'Comparisons' },
    { key: 'stats', label: 'Stats' },
    { key: 'builds', label: 'Builds' },
    { key: 'projects', label: 'Projects' },
    { key: 'settings', label: 'Settings' },
  ];

  let handleNavigate = view => {
    onNavigate?.(view);
    setMobileMenuOpen(false);
  };

  return (
    <nav className="bg-black/20 backdrop-blur-sm border-b border-gray-700">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14 md:h-16">
          {/* Logo */}
          <button
            onClick={() => handleNavigate('comparisons')}
            className="text-xl md:text-2xl font-bold text-amber-500 hover:text-amber-400 transition-colors touch-manipulation"
          >
            Vizzly TDD
          </button>

          {/* Desktop Navigation */}
          {onNavigate && (
            <div className="hidden md:flex items-center space-x-1">
              {navItems.map(item => (
                <button
                  key={item.key}
                  onClick={() => handleNavigate(item.key)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    currentView === item.key
                      ? 'bg-amber-500/20 text-amber-400'
                      : 'text-gray-400 hover:text-white hover:bg-slate-700/50'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}

          {/* Right side: Loading + Mobile Menu Toggle */}
          <div className="flex items-center gap-3">
            {loading && (
              <div className="flex items-center space-x-2 text-amber-400">
                <div className="w-4 h-4 border-2 border-amber-400/30 border-t-amber-400 rounded-full animate-spin"></div>
                <span className="hidden sm:inline text-sm">Refreshing...</span>
              </div>
            )}

            {/* Mobile Menu Toggle */}
            {onNavigate && (
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="md:hidden p-2 text-gray-400 hover:text-white rounded-lg hover:bg-slate-700/50 transition-colors touch-manipulation"
                aria-label="Toggle menu"
              >
                {mobileMenuOpen ? (
                  <XMarkIcon className="w-6 h-6" />
                ) : (
                  <Bars3Icon className="w-6 h-6" />
                )}
              </button>
            )}
          </div>
        </div>

        {/* Mobile Navigation Menu */}
        {onNavigate && mobileMenuOpen && (
          <div className="md:hidden border-t border-gray-700/50 py-2 animate-slide-down">
            <div className="flex flex-col space-y-1">
              {navItems.map(item => (
                <button
                  key={item.key}
                  onClick={() => handleNavigate(item.key)}
                  className={`w-full text-left px-4 py-3 rounded-lg text-base font-medium transition-colors touch-manipulation ${
                    currentView === item.key
                      ? 'bg-amber-500/20 text-amber-400'
                      : 'text-gray-300 hover:text-white hover:bg-slate-700/50'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
