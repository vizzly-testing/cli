import { useState, useCallback, useMemo } from 'react';
import { FormField, ConfigSourceBadge } from '../ui/form-field.jsx';
import { useToast } from '../ui/toast.jsx';
import useConfig from '../../hooks/use-config.js';
import { CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/outline';

export default function SettingsView() {
  let [activeTab, setActiveTab] = useState('general');
  let [formData, setFormData] = useState({});
  let [hasChanges, setHasChanges] = useState(false);

  let { config, loading, error, saving, updateConfig, refetch } = useConfig();
  let { addToast } = useToast();

  // Initialize form data when config loads (compute derived state)
  let formDataFromConfig = useMemo(() => {
    if (config?.config) {
      return {
        threshold: config.config.comparison?.threshold ?? 0.1,
        port: config.config.server?.port ?? 47392,
        timeout: config.config.server?.timeout ?? 30000,
        buildName: config.config.build?.name ?? 'Build {timestamp}',
        environment: config.config.build?.environment ?? 'test',
        openReport: config.config.tdd?.openReport ?? false,
      };
    }
    return {
      threshold: 0.1,
      port: 47392,
      timeout: 30000,
      buildName: 'Build {timestamp}',
      environment: 'test',
      openReport: false,
    };
  }, [config]);

  // Only initialize formData if it's empty (first load)
  if (
    Object.keys(formData).length === 0 &&
    Object.keys(formDataFromConfig).length > 0
  ) {
    setFormData(formDataFromConfig);
  }

  let handleFieldChange = useCallback((name, value) => {
    setFormData(prev => ({ ...prev, [name]: value }));
    setHasChanges(true);
  }, []);

  let handleSave = useCallback(async () => {
    try {
      // Map form data to config structure
      let updates = {
        comparison: {
          threshold: formData.threshold,
        },
        server: {
          port: formData.port,
          timeout: formData.timeout,
        },
        build: {
          name: formData.buildName,
          environment: formData.environment,
        },
        tdd: {
          openReport: formData.openReport,
        },
      };

      await updateConfig('project', updates);
      setHasChanges(false);
      addToast('Settings saved successfully!', 'success');
    } catch (err) {
      addToast(`Failed to save settings: ${err.message}`, 'error');
    }
  }, [formData, updateConfig, addToast]);

  let handleReset = useCallback(() => {
    if (config?.config) {
      setFormData({
        threshold: config.config.comparison?.threshold ?? 0.1,
        port: config.config.server?.port ?? 47392,
        timeout: config.config.server?.timeout ?? 30000,
        buildName: config.config.build?.name ?? 'Build {timestamp}',
        environment: config.config.build?.environment ?? 'test',
        openReport: config.config.tdd?.openReport ?? false,
      });
      setHasChanges(false);
    }
  }, [config]);

  let tabs = [
    { id: 'general', label: 'General' },
    { id: 'server', label: 'Server' },
    { id: 'build', label: 'Build' },
  ];

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="animate-pulse">
          <div className="h-8 bg-slate-700 rounded w-48 mb-8"></div>
          <div className="space-y-4">
            <div className="h-12 bg-slate-700 rounded"></div>
            <div className="h-12 bg-slate-700 rounded"></div>
            <div className="h-12 bg-slate-700 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-red-500/10 border border-red-500 rounded-lg p-6 text-center">
          <XCircleIcon className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-red-400 mb-2">
            Failed to load settings
          </h3>
          <p className="text-gray-400 mb-4">{error}</p>
          <button
            onClick={refetch}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-100 mb-2">Settings</h1>
        <p className="text-gray-400">
          Configure your Vizzly local development server
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-slate-700 mb-8">
        <nav className="flex space-x-8">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                pb-4 px-1 border-b-2 font-medium text-sm transition-colors
                ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-gray-400 hover:text-gray-300 hover:border-gray-600'
                }
              `}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="bg-slate-800/50 rounded-lg p-8 mb-6">
        {activeTab === 'general' && (
          <div>
            <h2 className="text-xl font-semibold text-gray-100 mb-6">
              General Settings
            </h2>

            <FormField
              label="Visual Comparison Threshold"
              name="threshold"
              type="number"
              value={formData.threshold}
              onChange={handleFieldChange}
              help="Percentage of pixel difference allowed before marking as failed (0.0 - 1.0)"
              placeholder="0.1"
            />

            <FormField
              label="Auto-open Report"
              name="openReport"
              type="checkbox"
              value={formData.openReport}
              onChange={handleFieldChange}
              help="Automatically open the dashboard in your browser when starting TDD mode"
            />

            <div className="mt-6 pt-6 border-t border-slate-700">
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <span>Source:</span>
                <ConfigSourceBadge
                  source={config?.sources?.comparison || 'default'}
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'server' && (
          <div>
            <h2 className="text-xl font-semibold text-gray-100 mb-6">
              Server Settings
            </h2>

            <FormField
              label="Server Port"
              name="port"
              type="number"
              value={formData.port}
              onChange={handleFieldChange}
              help="Port for the local screenshot server"
              placeholder="47392"
            />

            <FormField
              label="Server Timeout"
              name="timeout"
              type="number"
              value={formData.timeout}
              onChange={handleFieldChange}
              help="Request timeout in milliseconds"
              placeholder="30000"
            />

            <div className="mt-6 pt-6 border-t border-slate-700">
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <span>Source:</span>
                <ConfigSourceBadge
                  source={config?.sources?.server || 'default'}
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'build' && (
          <div>
            <h2 className="text-xl font-semibold text-gray-100 mb-6">
              Build Settings
            </h2>

            <FormField
              label="Build Name Template"
              name="buildName"
              type="text"
              value={formData.buildName}
              onChange={handleFieldChange}
              help="Template for build names (use {timestamp} for current time)"
              placeholder="Build {timestamp}"
            />

            <FormField
              label="Environment"
              name="environment"
              type="select"
              value={formData.environment}
              onChange={handleFieldChange}
              help="Target environment for builds"
              options={[
                { value: 'test', label: 'Test' },
                { value: 'development', label: 'Development' },
                { value: 'staging', label: 'Staging' },
                { value: 'production', label: 'Production' },
              ]}
            />

            <div className="mt-6 pt-6 border-t border-slate-700">
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <span>Source:</span>
                <ConfigSourceBadge
                  source={config?.sources?.build || 'default'}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Save/Reset Actions */}
      {hasChanges && (
        <div className="fixed bottom-8 right-8 bg-slate-800 border border-slate-700 rounded-lg shadow-xl p-4 flex items-center gap-4">
          <span className="text-sm text-gray-400">
            You have unsaved changes
          </span>
          <div className="flex gap-3">
            <button
              onClick={handleReset}
              disabled={saving}
              className="px-4 py-2 text-gray-300 hover:text-gray-100 transition-colors disabled:opacity-50"
            >
              Reset
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              {saving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <CheckCircleIcon className="w-5 h-5" />
                  Save Changes
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
