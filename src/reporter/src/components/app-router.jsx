import { Route, Switch, useLocation } from 'wouter';
import { useReportData } from '../hooks/queries/use-tdd-queries.js';
import DashboardHeader from './dashboard/dashboard-header.jsx';
import StatsView from './views/stats-view.jsx';
import ComparisonsView from './views/comparisons-view.jsx';
import ComparisonDetailView from './views/comparison-detail-view.jsx';
import SettingsView from './views/settings-view.jsx';
import ProjectsView from './views/projects-view.jsx';
import BuildsView from './views/builds-view.jsx';
import {
  LoadingState,
  ErrorState,
  WaitingForScreenshots,
} from './dashboard/empty-state.jsx';

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
      <div className="min-h-screen bg-slate-900 flex flex-col">
        <DashboardHeader
          loading={isLoading}
          onNavigate={navigateTo}
          currentView={currentView}
        />
        <LoadingState />
      </div>
    );
  }

  // Error state (but not for management routes)
  if (error && !reportData && !isManagementRoute) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col">
        <DashboardHeader
          loading={isLoading}
          onNavigate={navigateTo}
          currentView={currentView}
        />
        <ErrorState error={error.message} onRetry={refetch} />
      </div>
    );
  }

  // Waiting for screenshots state (but not for management routes)
  if (!reportData && !isManagementRoute) {
    return <WaitingForScreenshots />;
  }

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Hide header when in fullscreen comparison view */}
      {!isComparisonRoute && (
        <DashboardHeader
          loading={isLoading}
          onNavigate={navigateTo}
          currentView={currentView}
        />
      )}

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

        {/* Comparison detail route - fullscreen viewer */}
        <Route path="/comparison/:id">
          {reportData ? <ComparisonDetailView /> : <WaitingForScreenshots />}
        </Route>

        {/* Comparisons list route */}
        <Route path="/">
          {reportData ? <ComparisonsView /> : <WaitingForScreenshots />}
        </Route>
      </Switch>
    </div>
  );
}
