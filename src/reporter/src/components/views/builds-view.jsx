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
import {
  Card,
  CardBody,
  Button,
  Badge,
  EmptyState,
  Skeleton,
  SkeletonCard,
  Spinner,
} from '../design-system/index.js';

function StatusBadge({ status }) {
  let variants = {
    passed: { variant: 'success', icon: CheckCircleIcon },
    completed: { variant: 'success', icon: CheckCircleIcon },
    failed: { variant: 'danger', icon: XCircleIcon },
    pending: { variant: 'warning', icon: ClockIcon },
    processing: { variant: 'info', icon: ArrowPathIcon },
  };

  let config = variants[status] || variants.pending;

  return (
    <Badge variant={config.variant} dot pulseDot={status === 'processing'}>
      {status}
    </Badge>
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

function BuildCard({ build, project, onDownload, downloading }) {
  let createdAt = new Date(build.createdAt || build.created_at);
  let timeAgo = getTimeAgo(createdAt);

  return (
    <div className="flex items-center justify-between p-4 vz-card">
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
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onDownload(build, project)}
        loading={downloading}
        icon={ArrowDownTrayIcon}
        title="Download baselines from this build"
      />
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
    <Card hover={false}>
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
          {loadingBuilds && <Spinner size="sm" className="text-amber-400" />}
          {expanded ? (
            <ChevronDownIcon className="w-5 h-5 text-slate-400" />
          ) : (
            <ChevronRightIcon className="w-5 h-5 text-slate-400" />
          )}
        </div>
      </button>

      {expanded && (
        <CardBody
          padding="p-4"
          className="bg-slate-900/30 border-t border-slate-700/50"
        >
          {loadingBuilds ? (
            <div className="flex flex-col items-center justify-center py-8">
              <Spinner size="md" className="text-amber-400 mb-3" />
              <p className="text-sm text-slate-400">Loading builds...</p>
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
            <EmptyState
              icon={ClockIcon}
              title="No builds yet"
              description={
                <>
                  Run <code className="text-amber-400">vizzly run</code> to
                  create your first build
                </>
              }
            />
          )}
        </CardBody>
      )}
    </Card>
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
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-slate-700/50 flex items-center justify-center">
          <BuildingOfficeIcon className="w-4 h-4 text-slate-400" />
        </div>
        <h2 className="text-lg font-semibold text-white">{org.name}</h2>
        <Badge variant="default">
          {org.projects.length} project{org.projects.length !== 1 ? 's' : ''}
        </Badge>
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
    <Card hover={false}>
      <CardBody className="text-center py-12">
        <div className="w-16 h-16 rounded-2xl bg-slate-700/50 flex items-center justify-center mx-auto mb-4">
          <UserCircleIcon className="w-8 h-8 text-slate-400" />
        </div>
        <h3 className="text-xl font-semibold text-white mb-2">
          Sign in required
        </h3>
        <p className="text-slate-400 mb-6 max-w-md mx-auto">
          Sign in to your Vizzly account to browse your projects and download
          baselines from cloud builds.
        </p>
        <Button
          variant="primary"
          onClick={onLogin}
          icon={ArrowRightOnRectangleIcon}
        >
          Sign In
        </Button>
      </CardBody>
    </Card>
  );
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
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton variant="heading" className="w-40 mb-2" />
            <Skeleton variant="text" className="w-72" />
          </div>
          <Skeleton variant="button" />
        </div>
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Remote Builds</h1>
          <p className="text-slate-400 mt-1">
            Browse your cloud builds and download baselines for local TDD
          </p>
        </div>
        <Button
          variant="secondary"
          onClick={() => refetch()}
          icon={ArrowPathIcon}
        >
          Refresh
        </Button>
      </div>

      {/* Content */}
      {!authenticated ? (
        <LoginPrompt onLogin={handleLogin} />
      ) : projectsByOrg.length === 0 ? (
        <Card hover={false}>
          <CardBody>
            <EmptyState
              icon={FolderIcon}
              title="No projects found"
              description="You don't have any Vizzly projects yet. Create a project in the Vizzly dashboard to get started."
              action={
                <a
                  href="https://app.vizzly.dev"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2"
                >
                  <Button
                    variant="secondary"
                    icon={ChevronRightIcon}
                    iconPosition="right"
                  >
                    Open Vizzly Dashboard
                  </Button>
                </a>
              }
            />
          </CardBody>
        </Card>
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
