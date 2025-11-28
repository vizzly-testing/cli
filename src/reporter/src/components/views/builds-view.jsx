import { useState, useCallback, useMemo } from 'react';
import { useToast } from '../ui/toast.jsx';
import { useAuthStatus } from '../../hooks/queries/use-auth-queries.js';
import {
  useProjects,
  useBuilds,
  useDownloadBaselines,
} from '../../hooks/queries/use-cloud-queries.js';
import {
  FolderIcon,
  ArrowDownTrayIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  BuildingOfficeIcon,
  ArrowPathIcon,
  UserCircleIcon,
  ArrowRightOnRectangleIcon,
} from '@heroicons/react/24/outline';

function StatusBadge({ status }) {
  let variants = {
    passed: {
      bg: 'bg-emerald-500/10',
      border: 'border-emerald-500/20',
      text: 'text-emerald-400',
      icon: CheckCircleIcon,
    },
    completed: {
      bg: 'bg-emerald-500/10',
      border: 'border-emerald-500/20',
      text: 'text-emerald-400',
      icon: CheckCircleIcon,
    },
    failed: {
      bg: 'bg-red-500/10',
      border: 'border-red-500/20',
      text: 'text-red-400',
      icon: XCircleIcon,
    },
    pending: {
      bg: 'bg-amber-500/10',
      border: 'border-amber-500/20',
      text: 'text-amber-400',
      icon: ClockIcon,
    },
    processing: {
      bg: 'bg-blue-500/10',
      border: 'border-blue-500/20',
      text: 'text-blue-400',
      icon: ArrowPathIcon,
    },
  };

  let variant = variants[status] || variants.pending;
  let Icon = variant.icon;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-sm font-medium rounded-full border ${variant.bg} ${variant.border} ${variant.text}`}
    >
      <Icon className="w-3.5 h-3.5" />
      {status}
    </span>
  );
}

function BuildCard({ build, project, onDownload, downloading }) {
  let createdAt = new Date(build.createdAt || build.created_at);
  let timeAgo = getTimeAgo(createdAt);

  return (
    <div className="flex items-center justify-between p-4 bg-white/[0.03] hover:bg-white/[0.05] border border-slate-700/50 hover:border-slate-600 rounded-xl transition-all duration-200">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3">
          <h4 className="text-sm font-medium text-white truncate">
            {build.name || 'Unnamed build'}
          </h4>
          <StatusBadge status={build.status} />
        </div>
        <div className="flex items-center gap-4 mt-2 text-xs text-slate-400">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
            {build.branch || 'main'}
          </span>
          <span>{timeAgo}</span>
          {build.screenshot_count > 0 && (
            <span>{build.screenshot_count} screenshots</span>
          )}
        </div>
      </div>
      <button
        onClick={() => onDownload(build, project)}
        disabled={downloading}
        className="ml-4 p-2.5 text-slate-400 hover:text-amber-400 hover:bg-amber-500/10 rounded-lg transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed border border-transparent hover:border-amber-500/20"
        title="Download baselines from this build"
      >
        {downloading ? (
          <div className="w-5 h-5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
        ) : (
          <ArrowDownTrayIcon className="w-5 h-5" />
        )}
      </button>
    </div>
  );
}

function ProjectCard({
  project,
  onExpand,
  expanded,
  onDownload,
  downloadingBuildId,
}) {
  // Fetch builds for this project when expanded
  let { data: buildsData, isLoading: loadingBuilds } = useBuilds(
    expanded ? project.organizationSlug : null,
    expanded ? project.slug : null
  );

  let builds = buildsData?.builds || [];

  return (
    <div className="bg-white/[0.03] border border-slate-700/50 rounded-xl overflow-hidden transition-all duration-200 hover:border-slate-600">
      <button
        onClick={() => onExpand(project.organizationSlug, project.slug)}
        className="w-full flex items-center justify-between p-5 text-left hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
            <FolderIcon className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-white">
              {project.name || project.slug}
            </h3>
            <p className="text-sm text-slate-400 mt-0.5">
              {project.organizationSlug} / {project.slug}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {loadingBuilds && (
            <div className="w-4 h-4 border-2 border-amber-400/30 border-t-amber-400 rounded-full animate-spin" />
          )}
          {expanded ? (
            <ChevronDownIcon className="w-5 h-5 text-slate-400" />
          ) : (
            <ChevronRightIcon className="w-5 h-5 text-slate-400" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-slate-700/50 p-4 bg-slate-900/30">
          {loadingBuilds ? (
            <div className="text-center py-8">
              <div className="w-6 h-6 border-2 border-amber-400/30 border-t-amber-400 rounded-full animate-spin mx-auto" />
              <p className="text-sm text-slate-400 mt-3">Loading builds...</p>
            </div>
          ) : builds && builds.length > 0 ? (
            <div className="space-y-3">
              {builds.map((build, idx) => (
                <BuildCard
                  key={build.id || idx}
                  build={build}
                  project={project}
                  onDownload={onDownload}
                  downloading={downloadingBuildId === build.id}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <ClockIcon className="w-10 h-10 text-slate-500 mx-auto mb-3" />
              <p className="text-sm text-slate-400">
                No builds found for this project
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Run <code className="text-amber-400">vizzly run</code> to create
                your first build
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function OrganizationSection({
  org,
  expandedProjects,
  onExpand,
  onDownload,
  downloadingBuildId,
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 rounded-lg bg-slate-700/50 flex items-center justify-center">
          <BuildingOfficeIcon className="w-4 h-4 text-slate-400" />
        </div>
        <h2 className="text-lg font-semibold text-white">{org.name}</h2>
        <span className="text-sm text-slate-500">
          {org.projects.length} project{org.projects.length !== 1 ? 's' : ''}
        </span>
      </div>
      <div className="space-y-3 pl-11">
        {org.projects.map(project => {
          let key = `${project.organizationSlug}/${project.slug}`;
          return (
            <ProjectCard
              key={key}
              project={project}
              expanded={expandedProjects[key]}
              onExpand={onExpand}
              onDownload={onDownload}
              downloadingBuildId={downloadingBuildId}
            />
          );
        })}
      </div>
    </div>
  );
}

function LoginPrompt({ onLogin }) {
  return (
    <div className="bg-white/[0.03] border border-slate-700/50 rounded-xl p-8 text-center">
      <UserCircleIcon className="w-16 h-16 text-slate-500 mx-auto mb-4" />
      <h3 className="text-xl font-semibold text-white mb-2">
        Sign in required
      </h3>
      <p className="text-slate-400 mb-6 max-w-md mx-auto">
        Sign in to your Vizzly account to browse your projects and download
        baselines from cloud builds.
      </p>
      <button
        onClick={onLogin}
        className="inline-flex items-center gap-2 px-6 py-3 bg-amber-500 hover:bg-amber-400 text-slate-900 font-medium rounded-lg transition-all duration-150 shadow-lg shadow-amber-500/20"
      >
        <ArrowRightOnRectangleIcon className="w-5 h-5" />
        Sign In
      </button>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="bg-white/[0.03] border border-slate-700/50 rounded-xl p-8 text-center">
      <FolderIcon className="w-16 h-16 text-slate-500 mx-auto mb-4" />
      <h3 className="text-xl font-semibold text-white mb-2">
        No projects found
      </h3>
      <p className="text-slate-400 mb-6 max-w-md mx-auto">
        You don&apos;t have any Vizzly projects yet. Create a project in the
        Vizzly dashboard to get started.
      </p>
      <a
        href="https://app.vizzly.dev"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 px-6 py-3 bg-white/10 hover:bg-white/15 border border-white/10 text-white font-medium rounded-lg transition-all duration-150"
      >
        Open Vizzly Dashboard
        <ChevronRightIcon className="w-4 h-4" />
      </a>
    </div>
  );
}

function getTimeAgo(date) {
  let seconds = Math.floor((new Date() - date) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;

  return date.toLocaleDateString();
}

export default function BuildsView() {
  let [expandedProjects, setExpandedProjects] = useState({});
  let [downloadingBuildId, setDownloadingBuildId] = useState(null);
  let { addToast } = useToast();

  // Use TanStack Query for data
  let { data: authData, isLoading: authLoading } = useAuthStatus();
  let {
    data: projectsData,
    isLoading: projectsLoading,
    refetch,
  } = useProjects();
  let downloadMutation = useDownloadBaselines();

  let authenticated = authData?.authenticated;

  // Group projects by organization
  let projectsByOrg = useMemo(() => {
    let projects = projectsData?.projects || [];
    let grouped = {};
    for (let project of projects) {
      let orgSlug = project.organizationSlug || 'unknown';
      if (!grouped[orgSlug]) {
        grouped[orgSlug] = {
          slug: orgSlug,
          name: project.organizationName || orgSlug,
          projects: [],
        };
      }
      grouped[orgSlug].projects.push(project);
    }
    return Object.values(grouped);
  }, [projectsData?.projects]);

  let handleExpand = useCallback((orgSlug, projectSlug) => {
    let key = `${orgSlug}/${projectSlug}`;
    setExpandedProjects(prev => ({
      ...prev,
      [key]: !prev[key],
    }));
  }, []);

  let handleDownload = useCallback(
    (build, project) => {
      setDownloadingBuildId(build.id);
      downloadMutation.mutate(
        {
          buildId: build.id,
          organizationSlug: project?.organizationSlug,
          projectSlug: project?.slug,
        },
        {
          onSuccess: () => {
            addToast(
              `Baselines downloaded from "${build.name || build.id}"`,
              'success'
            );
            setDownloadingBuildId(null);
          },
          onError: err => {
            addToast(`Failed to download baselines: ${err.message}`, 'error');
            setDownloadingBuildId(null);
          },
        }
      );
    },
    [downloadMutation, addToast]
  );

  let handleLogin = useCallback(() => {
    // Navigate to projects page for login
    window.location.href = '/projects';
  }, []);

  if (projectsLoading || authLoading) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="animate-pulse space-y-6">
          <div className="h-10 bg-slate-700/50 rounded-lg w-64" />
          <div className="h-4 bg-slate-700/50 rounded w-96" />
          <div className="h-48 bg-slate-700/50 rounded-xl" />
          <div className="h-48 bg-slate-700/50 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Remote Builds</h1>
          <p className="text-slate-400 mt-1">
            Browse your cloud builds and download baselines for local TDD
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-300 hover:text-white bg-white/[0.03] hover:bg-white/[0.06] border border-slate-700 hover:border-slate-600 rounded-lg transition-all duration-150"
        >
          <ArrowPathIcon className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Content */}
      {!authenticated ? (
        <LoginPrompt onLogin={handleLogin} />
      ) : projectsByOrg.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-8">
          {projectsByOrg.map(org => (
            <OrganizationSection
              key={org.slug}
              org={org}
              expandedProjects={expandedProjects}
              onExpand={handleExpand}
              onDownload={handleDownload}
              downloadingBuildId={downloadingBuildId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
