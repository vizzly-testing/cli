/**
 * Layout Component
 * Observatory Design System
 *
 * Main application layout with header and content area
 */

import Header from './header.jsx';

export default function Layout({ children, currentView, onNavigate, loading }) {
  return (
    <div className="min-h-screen bg-slate-900 flex flex-col">
      <Header
        currentView={currentView}
        onNavigate={onNavigate}
        loading={loading}
      />
      <main className="flex-1">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8">
          {children}
        </div>
      </main>
    </div>
  );
}
