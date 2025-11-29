/**
 * Header Component
 * Observatory Design System
 *
 * Main navigation header with responsive mobile menu
 */

import { useState } from 'react';
import {
  Bars3Icon,
  XMarkIcon,
  PhotoIcon,
  ChartBarIcon,
  CloudIcon,
  FolderIcon,
  Cog6ToothIcon,
} from '@heroicons/react/24/outline';
import { Spinner } from '../design-system/index.js';

let navItems = [
  { key: 'comparisons', label: 'Comparisons', icon: PhotoIcon },
  { key: 'stats', label: 'Stats', icon: ChartBarIcon },
  { key: 'builds', label: 'Builds', icon: CloudIcon },
  { key: 'projects', label: 'Projects', icon: FolderIcon },
  { key: 'settings', label: 'Settings', icon: Cog6ToothIcon },
];

export default function Header({ currentView, onNavigate, loading }) {
  let [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  let handleNavigate = view => {
    onNavigate?.(view);
    setMobileMenuOpen(false);
  };

  return (
    <header className="sticky top-0 z-40 bg-slate-900/95 backdrop-blur-sm border-b border-slate-700/50">
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <button
            onClick={() => handleNavigate('comparisons')}
            className="flex items-center gap-2 group touch-manipulation"
          >
            <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center">
              <svg
                className="w-5 h-5 text-slate-900"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
            </div>
            <span className="text-lg font-semibold text-white group-hover:text-amber-400 transition-colors">
              Vizzly
            </span>
            <span className="text-xs font-medium text-slate-500 bg-slate-800 px-2 py-0.5 rounded">
              TDD
            </span>
          </button>

          {/* Desktop Navigation */}
          {onNavigate && (
            <div className="hidden md:flex items-center gap-1">
              {navItems.map(item => {
                let isActive = currentView === item.key;
                return (
                  <button
                    key={item.key}
                    onClick={() => handleNavigate(item.key)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                      isActive
                        ? 'bg-amber-500/10 text-amber-400'
                        : 'text-slate-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <item.icon className="w-4 h-4" />
                    {item.label}
                  </button>
                );
              })}
            </div>
          )}

          {/* Right side: Loading + Mobile Menu Toggle */}
          <div className="flex items-center gap-3">
            {loading && (
              <div className="flex items-center gap-2 text-amber-400">
                <Spinner size="sm" />
                <span className="hidden sm:inline text-sm">Syncing...</span>
              </div>
            )}

            {/* Mobile Menu Toggle */}
            {onNavigate && (
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="md:hidden p-2 text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors touch-manipulation"
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
          <div className="md:hidden border-t border-slate-700/50 py-3 animate-slide-down">
            <div className="flex flex-col gap-1">
              {navItems.map(item => {
                let isActive = currentView === item.key;
                return (
                  <button
                    key={item.key}
                    onClick={() => handleNavigate(item.key)}
                    className={`flex items-center gap-3 w-full px-4 py-3 rounded-lg text-base font-medium transition-colors touch-manipulation ${
                      isActive
                        ? 'bg-amber-500/10 text-amber-400'
                        : 'text-slate-300 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <item.icon className="w-5 h-5" />
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </nav>
    </header>
  );
}
