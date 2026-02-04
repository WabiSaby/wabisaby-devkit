import React, { useEffect, useState, useCallback } from 'react';
import { status, prerequisites, submodule, env } from '../lib/wails';
import {
  RefreshCw, CheckCircle, XCircle, GitMerge, X,
  Settings as SettingsIcon, Layout, Terminal
} from 'lucide-react';

export function SettingsView({ onBreadcrumbChange }) {
  const [activeTab, setActiveTab] = useState('status');
  const [appStatus, setAppStatus] = useState(null);
  const [prereqList, setPrereqList] = useState([]);
  const [submoduleNeedsSync, setSubmoduleNeedsSync] = useState(null);
  const [submoduleSyncing, setSubmoduleSyncing] = useState(false);
  const [submoduleBannerDismissed, setSubmoduleBannerDismissed] = useState(false);
  const [envStatus, setEnvStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    if (!window.go) {
      setLoading(false);
      return;
    }
    try {
      const [s, p, sub, e] = await Promise.all([
        status.get(),
        prerequisites.list(),
        submodule.getSyncStatus(),
        env.getStatus(),
      ]);
      setAppStatus(s ?? null);
      setPrereqList(Array.isArray(p) ? p : []);
      const needs = sub?.needsSync;
      setSubmoduleNeedsSync(Array.isArray(needs) && needs.length > 0 ? needs : null);
      setEnvStatus(e ?? null);
    } catch {
      setAppStatus(null);
      setPrereqList([]);
      setSubmoduleNeedsSync(null);
      setEnvStatus(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => fetchAll(), 0);
    return () => clearTimeout(t);
  }, [fetchAll]);

  const handleSubmoduleSync = async () => {
    setSubmoduleSyncing(true);
    const { success } = await submodule.sync('Sync submodules');
    setSubmoduleSyncing(false);
    if (success) {
      setSubmoduleNeedsSync(null);
      setSubmoduleBannerDismissed(true);
      fetchAll();
    }
  };

  const tabs = [
    { id: 'status', label: 'General Status', icon: <SettingsIcon size={16} /> },
    { id: 'prereqs', label: 'Prerequisites', icon: <Layout size={16} /> },
    { id: 'env', label: 'Environment', icon: <Terminal size={16} /> },
  ];

  useEffect(() => {
    const labels = { status: 'General Status', prereqs: 'Prerequisites', env: 'Environment' };
    const label = labels[activeTab] ?? null;
    onBreadcrumbChange?.(label);
    return () => onBreadcrumbChange?.(null);
  }, [activeTab, onBreadcrumbChange]);

  const formatBool = (value) => (value ? 'Yes' : 'No');
  const projectSummary = appStatus?.projectsTotal != null
    ? `${appStatus.projectsCloned ?? 0}/${appStatus.projectsTotal} cloned, ${appStatus.projectsDirty ?? 0} dirty, ${appStatus.projectsMissing ?? 0} missing`
    : null;
  const backendSummary = appStatus?.backendTotal != null
    ? `${appStatus.backendRunning ?? 0}/${appStatus.backendTotal} running`
    : null;
  const dockerSummary = appStatus?.dockerTotal != null
    ? `${appStatus.dockerRunning ?? 0}/${appStatus.dockerTotal} running`
    : null;
  const envSummary = appStatus?.envRequiredCount != null
    ? `Missing ${appStatus.envMissingRequired ?? 0} of ${appStatus.envRequiredCount} required`
    : null;
  const runtimeSummary = appStatus?.os && appStatus?.arch && appStatus?.goVersion
    ? `${appStatus.os}/${appStatus.arch} • ${appStatus.goVersion}`
    : null;

  return (
    <div className="view view--has-sidebar view--settings">
      <div className="view__sidebar">
        <h2 className="view__sidebar-title">Settings</h2>
        <nav className="view__sidebar-nav">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`nav-item ${activeTab === tab.id ? 'nav-item--active' : ''}`}
            >
              {tab.icon}
              <span>{tab.label}</span>
              {tab.count > 0 && <span className="badge badge--warning ml-auto">{tab.count}</span>}
            </button>
          ))}
        </nav>

        <div className="view__sidebar-footer">
          <button type="button" onClick={fetchAll} className="btn btn--secondary btn--full" disabled={loading}>
            <RefreshCw size={14} className={loading ? 'icon-spin' : ''} />
            <span>Refresh Data</span>
          </button>
        </div>
      </div>

      <div className="view__content-area" key={activeTab}>
        <div className="view__header">
          <div className="view__title-group">
            <h2 className="view__title">{tabs.find(t => t.id === activeTab)?.label}</h2>
            <p className="view__subtitle">Configure and monitor system status.</p>
          </div>
        </div>

        <div className="view__body">
          {submoduleNeedsSync && submoduleNeedsSync.length > 0 && !submoduleBannerDismissed && (
            <div className="banner banner--warning mb-4">
              <div className="banner__content">
                <GitMerge size={18} style={{ color: 'var(--color-warning)' }} />
                <span>Submodules need sync: {submoduleNeedsSync.join(', ')}</span>
              </div>
              <div className="banner__actions">
                <button
                  type="button"
                  onClick={handleSubmoduleSync}
                  disabled={submoduleSyncing}
                  className="btn btn--primary"
                >
                  {submoduleSyncing ? 'Syncing...' : 'Sync submodules'}
                </button>
                <button type="button" onClick={() => setSubmoduleBannerDismissed(true)} className="btn btn--ghost">
                  <X size={18} />
                </button>
              </div>
            </div>
          )}

          {activeTab === 'status' && (
            <section className="settings-section">
              <div className="card">
                <div className="card__header">
                  <h3 className="card__title">System Status</h3>
                </div>
                <div className="card__body">
                  {appStatus ? (
                    <div className="flex flex-col gap-2">
                      <div className="status-row">
                        <span className="status-label">Message:</span>
                        <span className="status-value">{appStatus.message ?? JSON.stringify(appStatus)}</span>
                      </div>
                      {appStatus.generatedAt && (
                        <div className="status-row">
                          <span className="status-label">Updated:</span>
                          <span className="status-value">{appStatus.generatedAt}</span>
                        </div>
                      )}
                      {appStatus.startedAt && (
                        <div className="status-row">
                          <span className="status-label">Started:</span>
                          <span className="status-value">{appStatus.startedAt}</span>
                        </div>
                      )}
                      {appStatus.uptime && (
                        <div className="status-row">
                          <span className="status-label">Uptime:</span>
                          <span className="status-value">{appStatus.uptime}</span>
                        </div>
                      )}
                      {(appStatus.gitBranch || appStatus.gitCommit) && (
                        <div className="status-row">
                          <span className="status-label">Git:</span>
                          <span className="status-value">
                            {appStatus.gitBranch ?? 'unknown'}
                            {appStatus.gitCommit ? ` @ ${appStatus.gitCommit}` : ''}
                            {appStatus.gitDirty != null ? ` • dirty: ${formatBool(appStatus.gitDirty)}` : ''}
                          </span>
                        </div>
                      )}
                      {(appStatus.devkitRoot || appStatus.projectsDir) && (
                        <div className="status-row">
                          <span className="status-label">Paths:</span>
                          <span className="status-value">
                            {appStatus.devkitRoot && `DevKit: ${appStatus.devkitRoot}`}
                            {appStatus.devkitRoot && appStatus.projectsDir ? ' • ' : ''}
                            {appStatus.projectsDir && `Projects: ${appStatus.projectsDir}`}
                          </span>
                        </div>
                      )}
                      {appStatus.wabisabyCore && (
                        <div className="status-row">
                          <span className="status-label">Core:</span>
                          <span className="status-value">{appStatus.wabisabyCore}</span>
                        </div>
                      )}
                      {projectSummary && (
                        <div className="status-row">
                          <span className="status-label">Projects:</span>
                          <span className="status-value">{projectSummary}</span>
                        </div>
                      )}
                      {(backendSummary || dockerSummary) && (
                        <div className="status-row">
                          <span className="status-label">Services:</span>
                          <span className="status-value">
                            {backendSummary && `Backend ${backendSummary}`}
                            {backendSummary && dockerSummary ? ' • ' : ''}
                            {dockerSummary && `Docker ${dockerSummary}`}
                          </span>
                        </div>
                      )}
                      {(appStatus.envFilePresent != null || envSummary) && (
                        <div className="status-row">
                          <span className="status-label">Environment:</span>
                          <span className="status-value">
                            {appStatus.envFilePresent != null && `Env file: ${formatBool(appStatus.envFilePresent)}`}
                            {appStatus.envExamplePresent != null ? ` • Example: ${formatBool(appStatus.envExamplePresent)}` : ''}
                            {envSummary ? ` • ${envSummary}` : ''}
                          </span>
                        </div>
                      )}
                      {runtimeSummary && (
                        <div className="status-row">
                          <span className="status-label">Runtime:</span>
                          <span className="status-value">{runtimeSummary}</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-sub">No status information available.</p>
                  )}
                </div>
              </div>
            </section>
          )}

          {activeTab === 'prereqs' && (
            <div className="card">
              <div className="card__body p-0">
                {prereqList.length === 0 && !loading ? (
                  <div className="p-4 text-center text-sub">No prerequisites configured.</div>
                ) : (
                  <ul className="list-group">
                    {prereqList.map((p, i) => (
                      <li key={i} className="list-group__item">
                        <div className="flex items-center gap-3">
                          {p.installed ? (
                            <CheckCircle size={18} style={{ color: 'var(--color-success)' }} />
                          ) : (
                            <XCircle size={18} style={{ color: 'var(--color-danger)' }} />
                          )}
                          <div className="flex flex-col">
                            <span className="font-medium">{p.name}</span>
                            {p.version && <span className="text-sm text-sub">{p.version}</span>}
                          </div>
                        </div>
                        <div className="flex flex-col items-end">
                          {p.required && <span className="badge badge--neutral">Required</span>}
                          {p.message && <span className="text-xs text-warning">{p.message}</span>}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          {activeTab === 'env' && (
            <div className="card">
              <div className="card__header">
                <h3 className="card__title">Environment Variables</h3>
              </div>
              <div className="card__body">
                {envStatus ? (
                  <div className="flex items-center gap-4">
                    <div className={`status-indicator ${envStatus.hasEnvFile ? 'status-indicator--ready' : 'status-indicator--error'}`} />
                    <div className="flex flex-col">
                      <span className="font-medium">.env file</span>
                      <span className="text-sm text-sub">
                        {envStatus.hasEnvFile ? 'Present and loaded.' : 'Missing. Application might not work correctly.'}
                      </span>
                    </div>
                    {envStatus.hasExample && !envStatus.hasEnvFile && (
                      <button className="btn btn--secondary ml-auto">Copy .env.example</button>
                    )}
                  </div>
                ) : (
                  <p className="text-sub">Loading environment status...</p>
                )}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
