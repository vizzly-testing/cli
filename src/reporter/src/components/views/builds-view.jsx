import {
  ArrowDownTrayIcon,
  ArrowPathIcon,
  ArrowRightOnRectangleIcon,
  BuildingOfficeIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ClockIcon,
  FolderIcon,
  UserCircleIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  useAuthStatus,
  useInitiateLogin,
  usePollAuthorization,
} from '../../hooks/queries/use-auth-queries.js';
import {
  useBuilds,
  useDownloadBaselines,
  useProjects,
} from '../../hooks/queries/use-cloud-queries.js';
import { queryKeys } from '../../lib/query-keys.js';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  EmptyState,
  Skeleton,
  SkeletonCard,
  Spinner,
} from '../design-system/index.js';
import { useToast } from '../ui/toast.jsx';

function StatusBadge({ status }) {
  const variants = {
    passed: { variant: 'success', icon: CheckCircleIcon },
    completed: { variant: 'success', icon: CheckCircleIcon },
    failed: { variant: 'danger', icon: XCircleIcon },
    pending: { variant: 'warning', icon: ClockIcon },
    processing: { variant: 'info', icon: ArrowPathIcon },
  };

  const config = variants[status] || variants.pending;

  return (
    <Badge variant={config.variant} dot pulseDot={status === 'processing'}>
      {status}
    </Badge>
  );
}

function getTimeAgo(date) {
  const seconds = Math.floor((Date.now() - date) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;

  return date.toLocaleDateString();
}

function BuildCard({ build, project, onDownload, downloading }) {
  const createdAt = new Date(build.createdAt || build.created_at);
  const timeAgo = getTimeAgo(createdAt);

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
  const { data: buildsData, isLoading: loadingBuilds } = useBuilds(
    expanded ? project.organizationSlug : null,
    expanded ? project.slug : null
  );

  const builds = buildsData?.builds || [];

  return (
    <Card hover={false}>
      <button
        type="button"
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
          const key = `${project.organizationSlug}/${project.slug}`;
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

function DeviceFlowLogin({ onComplete }) {
  const [deviceFlow, setDeviceFlow] = useState(null);
  const [error, setError] = useState(null);

  const initiateLoginMutation = useInitiateLogin();
  const pollMutation = usePollAuthorization();
  const { addToast } = useToast();

  useEffect(() => {
    async function startDeviceFlow() {
      try {
        const flow = await initiateLoginMutation.mutateAsync();
        setDeviceFlow(flow);
      } catch (err) {
        setError(err.message);
        addToast(`Failed to start login: ${err.message}`, 'error');
      }
    }

    startDeviceFlow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addToast, initiateLoginMutation.mutateAsync]);

  async function checkAuthorization() {
    if (!deviceFlow?.deviceCode) return;

    setError(null);

    try {
      const result = await pollMutation.mutateAsync(deviceFlow.deviceCode);

      if (result.status === 'complete') {
        addToast('Login successful!', 'success');
        onComplete?.();
      } else if (result.status === 'pending') {
        addToast('Still waiting for authorization...', 'info');
      } else {
        setError('Unexpected response from server');
      }
    } catch (err) {
      setError(err.message);
      addToast(`Check failed: ${err.message}`, 'error');
    }
  }

  if (error) {
    return (
      <Alert variant="danger" title="Login Error">
        {error}
      </Alert>
    );
  }

  if (!deviceFlow) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Spinner size="lg" className="text-amber-400 mb-4" />
        <p className="text-slate-400">Starting login flow...</p>
      </div>
    );
  }

  return (
    <Card hover={false}>
      <CardBody className="text-center py-8">
        <h3 className="text-xl font-semibold text-white mb-6">
          Sign in to Vizzly
        </h3>

        <div className="bg-slate-900/50 rounded-xl p-6 mb-6 border border-slate-700/50 max-w-sm mx-auto">
          <p className="text-sm text-slate-400 mb-4">
            Click below to authorize:
          </p>
          <a
            href={
              deviceFlow.verificationUriComplete || deviceFlow.verificationUri
            }
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-6 py-3 bg-amber-500 hover:bg-amber-400 text-slate-900 font-medium rounded-lg transition-colors mb-4"
          >
            Open Authorization Page
          </a>
          <div className="mt-4 pt-4 border-t border-slate-700/50">
            <p className="text-xs text-slate-500 mb-2">
              Or enter this code manually:
            </p>
            <div className="text-2xl font-mono font-bold text-amber-400 tracking-wider">
              {deviceFlow.userCode}
            </div>
          </div>
        </div>

        <p className="text-sm text-slate-400 mb-4">
          After authorizing in your browser, click the button below to complete
          sign in.
        </p>

        <Button
          variant="secondary"
          onClick={checkAuthorization}
          loading={pollMutation.isPending}
        >
          Check Status
        </Button>
      </CardBody>
    </Card>
  );
}

function LoginPrompt() {
  const [showingLogin, setShowingLogin] = useState(false);
  const queryClient = useQueryClient();
  const { addToast } = useToast();

  const handleLoginComplete = useCallback(() => {
    setShowingLogin(false);
    queryClient.invalidateQueries({ queryKey: queryKeys.auth });
    queryClient.invalidateQueries({ queryKey: queryKeys.projects() });
    addToast('Login successful!', 'success');
  }, [queryClient, addToast]);

  if (showingLogin) {
    return (
      <div className="space-y-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowingLogin(false)}
        >
          &larr; Back
        </Button>
        <DeviceFlowLogin onComplete={handleLoginComplete} />
      </div>
    );
  }

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
          onClick={() => setShowingLogin(true)}
          icon={ArrowRightOnRectangleIcon}
        >
          Sign In
        </Button>
      </CardBody>
    </Card>
  );
}

export default function BuildsView() {
  const [expandedProjects, setExpandedProjects] = useState({});
  const [downloadingBuildId, setDownloadingBuildId] = useState(null);
  const { addToast } = useToast();

  // Use TanStack Query for data
  const { data: authData, isLoading: authLoading } = useAuthStatus();
  const {
    data: projectsData,
    isLoading: projectsLoading,
    refetch,
  } = useProjects();
  const downloadMutation = useDownloadBaselines();

  const authenticated = authData?.authenticated;

  // Group projects by organization
  const projectsByOrg = useMemo(() => {
    const projects = projectsData?.projects || [];
    const grouped = {};
    for (const project of projects) {
      const orgSlug = project.organizationSlug || 'unknown';
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

  const handleExpand = useCallback((orgSlug, projectSlug) => {
    const key = `${orgSlug}/${projectSlug}`;
    setExpandedProjects(prev => ({
      ...prev,
      [key]: !prev[key],
    }));
  }, []);

  const handleDownload = useCallback(
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
        <LoginPrompt />
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
