import { Route, Switch, useLocation } from 'wouter';
import { useReportData } from '../hooks/queries/use-tdd-queries.js';
import { Layout } from './layout/index.js';
import { EmptyState, Spinner } from './design-system/index.js';
import StatsView from './views/stats-view.jsx';
import ComparisonsView from './views/comparisons-view.jsx';
import ComparisonDetailView from './views/comparison-detail-view.jsx';
import SettingsView from './views/settings-view.jsx';
import ProjectsView from './views/projects-view.jsx';
import BuildsView from './views/builds-view.jsx';
import WaitingForScreenshots from './waiting-for-screenshots.jsx';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';

function LoadingState() {
  return (
    <div className="flex flex-col items-center justify-center py-32">
      <Spinner size="lg" className="text-amber-400 mb-4" />
      <p className="text-slate-400 text-sm">Loading report data...</p>
    </div>
  );
}

function ErrorState({ error, onRetry }) {
  return (
    <EmptyState
      icon={ExclamationTriangleIcon}
      title="Failed to load report"
      description={
        error || 'An unexpected error occurred while loading the report data.'
      }
      action={
        <button
          onClick={onRetry}
          className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-900 font-medium rounded-lg transition-colors"
        >
          Try Again
        </button>
      }
    />
  );
}

export default function AppRouter() {
  let [location, setLocation] = useLocation();
  let { data: reportData, isLoading, error, refetch } = useReportData();

  // Check if we're on a comparison detail route (fullscreen)
  let isComparisonRoute = location.startsWith('/comparison/');

  // Determine current view based on route
  let currentView =
    location === '/stats'
      ? 'stats'
      : location === '/settings'
        ? 'settings'
        : location === '/projects'
          ? 'projects'
          : location === '/builds'
            ? 'builds'
            : 'comparisons';

  let navigateTo = view => {
    if (view === 'stats') setLocation('/stats');
    else if (view === 'settings') setLocation('/settings');
    else if (view === 'projects') setLocation('/projects');
    else if (view === 'builds') setLocation('/builds');
    else setLocation('/');
  };

  // Settings, Projects, and Builds don't need screenshot data - always allow access
  let isManagementRoute =
    location === '/settings' ||
    location === '/projects' ||
    location === '/builds';

  // Loading state (but not for management routes)
  if (isLoading && !reportData && !isManagementRoute) {
    return (
      <Layout
        currentView={currentView}
        onNavigate={navigateTo}
        loading={isLoading}
      >
        <LoadingState />
      </Layout>
    );
  }

  // Error state (but not for management routes)
  if (error && !reportData && !isManagementRoute) {
    return (
      <Layout
        currentView={currentView}
        onNavigate={navigateTo}
        loading={isLoading}
      >
        <ErrorState error={error.message} onRetry={refetch} />
      </Layout>
    );
  }

  // Waiting for screenshots state (but not for management routes)
  // Now wrapped in Layout so users can still navigate
  if (!reportData && !isManagementRoute) {
    return (
      <Layout
        currentView={currentView}
        onNavigate={navigateTo}
        loading={isLoading}
      >
        <WaitingForScreenshots />
      </Layout>
    );
  }

  // Fullscreen comparison view - no layout wrapper
  // If no report data, redirect to home (with layout) instead of showing orphaned waiting state
  if (isComparisonRoute) {
    if (!reportData) {
      return (
        <Layout
          currentView="comparisons"
          onNavigate={navigateTo}
          loading={isLoading}
        >
          <WaitingForScreenshots />
        </Layout>
      );
    }
    return (
      <Switch>
        <Route path="/comparison/:id">
          <ComparisonDetailView />
        </Route>
      </Switch>
    );
  }

  // Normal routes with layout
  return (
    <Layout
      currentView={currentView}
      onNavigate={navigateTo}
      loading={isLoading}
    >
      <Switch>
        <Route path="/stats">
          {reportData ? <StatsView /> : <WaitingForScreenshots />}
        </Route>

        <Route path="/settings">
          <SettingsView />
        </Route>

        <Route path="/projects">
          <ProjectsView />
        </Route>

        <Route path="/builds">
          <BuildsView />
        </Route>

        {/* Comparisons list route */}
        <Route path="/">
          {reportData ? <ComparisonsView /> : <WaitingForScreenshots />}
        </Route>
      </Switch>
    </Layout>
  );
}
