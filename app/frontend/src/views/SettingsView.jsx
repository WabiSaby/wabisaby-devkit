import React, { useEffect, useState, useCallback, useRef } from 'react';
import { status, prerequisites, submodule, env, github } from '../lib/wails';
import { BrowserOpenURL } from '../../wailsjs/runtime/runtime';
import { usePermissions } from '../context/PermissionsContext';
import {
  RefreshCw, CheckCircle, XCircle, GitMerge, X,
  Settings as SettingsIcon, Layout, Terminal, Github,
  Clock, GitBranch, FolderOpen, Boxes, Server, FileCode, Copy,
  Eye, EyeOff, Lock, Plus, Trash2, Pencil, Save, AlertTriangle,
  LogOut, Users, Shield, ExternalLink, ClipboardCopy
} from 'lucide-react';
import { ViewWithSidebarLayout } from '../layouts';

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

  // --- Env var management state ---
  const [revealedVars, setRevealedVars] = useState({});
  const [editingVar, setEditingVar] = useState(null); // { name, value }
  const [editValue, setEditValue] = useState('');
  const [addingVar, setAddingVar] = useState(false);
  const [newVarName, setNewVarName] = useState('');
  const [newVarValue, setNewVarValue] = useState('');
  const [envSaving, setEnvSaving] = useState(false);
  const [envError, setEnvError] = useState(null);
  const editInputRef = useRef(null);
  const addNameRef = useRef(null);

  const toggleReveal = (name) => setRevealedVars((prev) => ({ ...prev, [name]: !prev[name] }));

  const startEditing = (v) => {
    setEditingVar(v.name);
    setEditValue(v.value ?? '');
    setEnvError(null);
    setTimeout(() => editInputRef.current?.focus(), 0);
  };

  const cancelEditing = () => {
    setEditingVar(null);
    setEditValue('');
    setEnvError(null);
  };

  const saveVar = async (name, value) => {
    setEnvSaving(true);
    setEnvError(null);
    const { success, message } = await env.updateVar(name, value);
    setEnvSaving(false);
    if (success) {
      setEditingVar(null);
      setEditValue('');
      fetchAll();
    } else {
      setEnvError(message ?? 'Failed to save variable');
    }
  };

  const deleteVar = async (name) => {
    setEnvSaving(true);
    setEnvError(null);
    const { success, message } = await env.deleteVar(name);
    setEnvSaving(false);
    if (success) {
      fetchAll();
    } else {
      setEnvError(message ?? 'Failed to delete variable');
    }
  };

  const handleCopyExample = async () => {
    setEnvSaving(true);
    setEnvError(null);
    const { success, message } = await env.copyExample();
    setEnvSaving(false);
    if (success) {
      fetchAll();
    } else {
      setEnvError(message ?? 'Failed to copy env.example');
    }
  };

  const startAdding = () => {
    setAddingVar(true);
    setNewVarName('');
    setNewVarValue('');
    setEnvError(null);
    setTimeout(() => addNameRef.current?.focus(), 0);
  };

  const cancelAdding = () => {
    setAddingVar(false);
    setNewVarName('');
    setNewVarValue('');
    setEnvError(null);
  };

  const saveNewVar = async () => {
    const name = newVarName.trim();
    if (!name) {
      setEnvError('Variable name cannot be empty');
      return;
    }
    setEnvSaving(true);
    setEnvError(null);
    const { success, message } = await env.updateVar(name, newVarValue);
    setEnvSaving(false);
    if (success) {
      setAddingVar(false);
      setNewVarName('');
      setNewVarValue('');
      fetchAll();
    } else {
      setEnvError(message ?? 'Failed to add variable');
    }
  };

  // --- GitHub connection state ---
  const { permissions, setPermissions } = usePermissions();
  const [ghConnecting, setGhConnecting] = useState(false);
  const [ghDeviceFlow, setGhDeviceFlow] = useState(null); // { userCode, verificationUri }
  const [ghError, setGhError] = useState(null);
  const [ghCopied, setGhCopied] = useState(false);
  const [ghRefreshing, setGhRefreshing] = useState(false);

  const openExternal = (url) => {
    if (window.runtime?.BrowserOpenURL) {
      BrowserOpenURL(url);
      return;
    }
    window.open(url, '_blank');
  };

  const startGitHubConnect = async () => {
    setGhError(null);
    setGhConnecting(true);
    setGhDeviceFlow(null);
    const { success, data, message } = await github.startDeviceFlow();
    if (!success) {
      setGhError(message || 'Failed to start GitHub connection');
      setGhConnecting(false);
      return;
    }
    setGhDeviceFlow(data);
    try { openExternal(data.verificationUri); } catch { /* ignore */ }
    const pollResult = await github.pollAuth();
    if (pollResult.success) {
      setPermissions(pollResult.data);
      setGhDeviceFlow(null);
    } else {
      setGhError(pollResult.message || 'GitHub authorisation failed');
    }
    setGhConnecting(false);
  };

  const copyCode = (code) => {
    navigator.clipboard?.writeText(code);
    setGhCopied(true);
    setTimeout(() => setGhCopied(false), 2000);
  };

  const handleGitHubDisconnect = async () => {
    const perms = await github.disconnect();
    setPermissions(perms);
    setGhDeviceFlow(null);
    setGhError(null);
  };

  const handleGitHubRefreshTeams = async () => {
    setGhRefreshing(true);
    setGhError(null);
    const { success, data, message } = await github.refreshTeams();
    if (success) {
      setPermissions(data);
    } else {
      setGhError(message || 'Failed to refresh teams');
    }
    setGhRefreshing(false);
  };

  const maskValue = (value) => value ? '\u2022'.repeat(Math.min(value.length, 24)) : '';

  const renderVarGroup = (title, vars, allowDelete = false) => {
    if (!vars || vars.length === 0) return null;
    return (
      <div className="env-group">
        <h4 className="env-group__title">{title}</h4>
        <ul className="env-var-list">
          {vars.map((v) => {
            const isEditing = editingVar === v.name;
            const isRevealed = revealedVars[v.name];
            const displayValue = v.sensitive && !isRevealed ? maskValue(v.value) : (v.value || '');
            return (
              <li key={v.name} className={`env-var-row ${!v.isSet ? 'env-var-row--unset' : ''}`}>
                <div className="env-var-row__name">
                  <code>{v.name}</code>
                  <span className="env-var-row__badges">
                    {v.required && <span className="badge badge--neutral">Required</span>}
                    {v.sensitive && (
                      <span className="badge badge--sensitive" title="Sensitive value">
                        <Lock size={10} />
                        Sensitive
                      </span>
                    )}
                  </span>
                </div>
                <div className="env-var-row__value">
                  {isEditing ? (
                    <div className="env-var-row__edit">
                      <input
                        ref={editInputRef}
                        type={v.sensitive && !isRevealed ? 'password' : 'text'}
                        className="env-var-row__input"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveVar(v.name, editValue);
                          if (e.key === 'Escape') cancelEditing();
                        }}
                        disabled={envSaving}
                      />
                      <button
                        type="button"
                        className="btn btn--icon btn--ghost"
                        onClick={() => saveVar(v.name, editValue)}
                        disabled={envSaving}
                        title="Save"
                      >
                        <Save size={14} />
                      </button>
                      <button
                        type="button"
                        className="btn btn--icon btn--ghost"
                        onClick={cancelEditing}
                        disabled={envSaving}
                        title="Cancel"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <div className="env-var-row__display">
                      <span className={`env-var-row__val ${v.sensitive && !isRevealed ? 'env-var-row__val--masked' : ''} ${!v.isSet ? 'env-var-row__val--empty' : ''}`}>
                        {v.isSet ? displayValue : '(not set)'}
                      </span>
                      <div className="env-var-row__actions">
                        {v.sensitive && v.isSet && (
                          <button
                            type="button"
                            className="btn btn--icon btn--ghost"
                            onClick={() => toggleReveal(v.name)}
                            title={isRevealed ? 'Hide value' : 'Reveal value'}
                          >
                            {isRevealed ? <EyeOff size={14} /> : <Eye size={14} />}
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn btn--icon btn--ghost"
                          onClick={() => startEditing(v)}
                          title="Edit"
                        >
                          <Pencil size={14} />
                        </button>
                        {allowDelete && (
                          <button
                            type="button"
                            className="btn btn--icon btn--ghost btn--danger"
                            onClick={() => deleteVar(v.name)}
                            title="Delete"
                            disabled={envSaving}
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    );
  };

  const tabs = [
    { id: 'status', label: 'General Status', icon: <SettingsIcon size={16} /> },
    { id: 'github', label: 'GitHub', icon: <Github size={16} /> },
    { id: 'prereqs', label: 'Prerequisites', icon: <Layout size={16} /> },
    { id: 'env', label: 'Environment', icon: <Terminal size={16} /> },
  ];

  useEffect(() => {
    const labels = { status: 'General Status', github: 'GitHub', prereqs: 'Prerequisites', env: 'Environment' };
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

  const tabSubtitles = {
    status: 'System health, paths, and runtime at a glance.',
    github: 'Connect to GitHub for team-based access.',
    prereqs: 'Tools and runtimes required by the devkit.',
    env: 'Environment file and variables.',
  };
  const prereqInstalled = prereqList.filter((p) => p.installed).length;
  const prereqTotal = prereqList.length;

  return (
    <ViewWithSidebarLayout
      sidebarTitle="Settings"
      sidebarNav={tabs}
      activeNavId={activeTab}
      onNavSelect={setActiveTab}
      sidebarFooter={
        <button type="button" onClick={fetchAll} className="btn btn--secondary btn--full" disabled={loading}>
          <RefreshCw size={14} className={loading ? 'icon-spin' : ''} />
          <span>Refresh Data</span>
        </button>
      }
      contentTitle={tabs.find(t => t.id === activeTab)?.label}
      contentSubtitle={tabSubtitles[activeTab] ?? 'Configure and monitor.'}
      contentKey={activeTab}
      viewClassName="view--settings"
    >
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
            <section className="settings-section settings-status">
              {appStatus ? (
                <>
                  <div className="status-overview card">
                    <div className="status-overview__message">
                      {appStatus.message ?? 'System status'}
                    </div>
                    <div className="status-overview__metrics">
                      {appStatus.uptime && (
                        <span className="status-metric" title="Uptime">
                          <Clock size={14} />
                          {appStatus.uptime}
                        </span>
                      )}
                      {(appStatus.gitBranch || appStatus.gitCommit) && (
                        <span className="status-metric status-metric--mono" title="Git">
                          <GitBranch size={14} />
                          {appStatus.gitBranch ?? '—'}
                          {appStatus.gitCommit ? ` @ ${String(appStatus.gitCommit).slice(0, 7)}` : ''}
                        </span>
                      )}
                      {appStatus.projectsTotal != null && (
                        <span className="status-metric" title="Projects">
                          <Boxes size={14} />
                          {appStatus.projectsCloned ?? 0}/{appStatus.projectsTotal}
                        </span>
                      )}
                      {(appStatus.backendTotal != null || appStatus.dockerTotal != null) && (
                        <span className="status-metric" title="Services">
                          <Server size={14} />
                          {(appStatus.backendRunning ?? 0) + (appStatus.dockerRunning ?? 0)}/{(appStatus.backendTotal ?? 0) + (appStatus.dockerTotal ?? 0)}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="status-details">
                    <h3 className="status-details__title">Status details</h3>
                    <div className="status-grid">
                      {(appStatus.generatedAt || appStatus.startedAt || appStatus.uptime) && (
                        <div className="card status-group status-group--col-1">
                          <div className="status-group__header">
                            <Clock size={18} className="status-group__icon" />
                            <h4 className="status-group__title">Overview</h4>
                          </div>
                          <div className="status-group__body">
                            {appStatus.generatedAt && (
                              <div className="status-row">
                                <span className="status-label">Updated</span>
                                <span className="status-value status-value--mono">{appStatus.generatedAt}</span>
                              </div>
                            )}
                            {appStatus.startedAt && (
                              <div className="status-row">
                                <span className="status-label">Started</span>
                                <span className="status-value status-value--mono">{appStatus.startedAt}</span>
                              </div>
                            )}
                            {appStatus.uptime && (
                              <div className="status-row">
                                <span className="status-label">Uptime</span>
                                <span className="status-value">{appStatus.uptime}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {(appStatus.gitBranch || appStatus.gitCommit != null || appStatus.wabisabyCore) && (
                        <div className="card status-group status-group--col-2">
                          <div className="status-group__header">
                            <GitBranch size={18} className="status-group__icon" />
                            <h4 className="status-group__title">Repository</h4>
                          </div>
                          <div className="status-group__body">
                            {appStatus.gitBranch != null && (
                              <div className="status-row">
                                <span className="status-label">Branch</span>
                                <span className="status-value status-value--mono">{appStatus.gitBranch}</span>
                              </div>
                            )}
                            {appStatus.gitCommit && (
                              <div className="status-row">
                                <span className="status-label">Commit</span>
                                <span className="status-value status-value--mono">{appStatus.gitCommit}</span>
                              </div>
                            )}
                            {appStatus.gitDirty != null && (
                              <div className="status-row">
                                <span className="status-label">Dirty</span>
                                <span className="status-value">{formatBool(appStatus.gitDirty)}</span>
                              </div>
                            )}
                            {appStatus.wabisabyCore && (
                              <div className="status-row">
                                <span className="status-label">Core</span>
                                <span className="status-value status-value--mono">{appStatus.wabisabyCore}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {(projectSummary || backendSummary || dockerSummary) && (
                        <div className="card status-group status-group--col-1">
                          <div className="status-group__header">
                            <Boxes size={18} className="status-group__icon" />
                            <h4 className="status-group__title">Workspace</h4>
                          </div>
                          <div className="status-group__body">
                            {projectSummary && (
                              <div className="status-row">
                                <span className="status-label">Projects</span>
                                <span className="status-value">{projectSummary}</span>
                              </div>
                            )}
                            {(backendSummary || dockerSummary) && (
                              <div className="status-row">
                                <span className="status-label">Services</span>
                                <span className="status-value">
                                  {backendSummary && `Backend ${backendSummary}`}
                                  {backendSummary && dockerSummary ? ' · ' : ''}
                                  {dockerSummary && `Docker ${dockerSummary}`}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {(appStatus.devkitRoot || appStatus.projectsDir) && (
                        <div className="card status-group status-group--col-2">
                          <div className="status-group__header">
                            <FolderOpen size={18} className="status-group__icon" />
                            <h4 className="status-group__title">Paths</h4>
                          </div>
                          <div className="status-group__body">
                            {appStatus.devkitRoot && (
                              <div className="status-row">
                                <span className="status-label">DevKit</span>
                                <span className="status-value status-value--mono status-value--wrap">{appStatus.devkitRoot}</span>
                              </div>
                            )}
                            {appStatus.projectsDir && (
                              <div className="status-row">
                                <span className="status-label">Projects</span>
                                <span className="status-value status-value--mono status-value--wrap">{appStatus.projectsDir}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {((appStatus.envFilePresent != null || appStatus.envExamplePresent != null) || envSummary || runtimeSummary) && (
                        <div className="card status-group status-group--full">
                          <div className="status-group__header">
                            <FileCode size={18} className="status-group__icon" />
                            <h4 className="status-group__title">Environment & runtime</h4>
                          </div>
                          <div className="status-group__body">
                            {appStatus.envFilePresent != null && (
                              <div className="status-row">
                                <span className="status-label">Env file</span>
                                <span className="status-value">{formatBool(appStatus.envFilePresent)}</span>
                              </div>
                            )}
                            {appStatus.envExamplePresent != null && (
                              <div className="status-row">
                                <span className="status-label">.env.example</span>
                                <span className="status-value">{formatBool(appStatus.envExamplePresent)}</span>
                              </div>
                            )}
                            {envSummary && (
                              <div className="status-row">
                                <span className="status-label">Required vars</span>
                                <span className="status-value">{envSummary}</span>
                              </div>
                            )}
                            {runtimeSummary && (
                              <div className="status-row">
                                <span className="status-label">Runtime</span>
                                <span className="status-value status-value--mono">{runtimeSummary}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <div className="card">
                  <div className="card__body">
                    <p className="text-sub">No status information available.</p>
                  </div>
                </div>
              )}
            </section>
          )}

          {activeTab === 'github' && (
            <section className="settings-section settings-github">
              <div className="card">
                <div className="card__header">
                  <h3 className="card__title">GitHub Connection</h3>
                  <p className="settings-env__intro">
                    Connect your GitHub account to enable team-based access control.
                    Features are restricted based on your team membership in the WabiSaby organisation.
                  </p>
                </div>
                <div className="card__body">
                  {permissions?.connected ? (
                    <div className="settings-env__status">
                      <div className="status-indicator status-indicator--lg status-indicator--ready" />
                      <div className="settings-env__status-text">
                        <span className="settings-env__status-label">
                          Connected as <strong>{permissions.username}</strong>
                        </span>
                        <span className="settings-env__status-desc">
                          Teams: {permissions.teams?.length > 0 ? permissions.teams.join(', ') : 'none in WabiSaby'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                          type="button"
                          className="btn btn--secondary"
                          onClick={handleGitHubRefreshTeams}
                          disabled={ghRefreshing}
                          title="Refresh team memberships"
                        >
                          <RefreshCw size={14} className={ghRefreshing ? 'icon-spin' : ''} />
                          Refresh Teams
                        </button>
                        <button
                          type="button"
                          className="btn btn--ghost btn--danger"
                          onClick={handleGitHubDisconnect}
                          title="Disconnect GitHub account"
                        >
                          <LogOut size={14} />
                          Disconnect
                        </button>
                      </div>
                    </div>
                  ) : ghDeviceFlow ? (
                    <div className="settings-github__device-flow">
                      <p className="settings-github__instruction">
                        Enter this code on GitHub to authorise DevKit:
                      </p>
                      <div className="settings-github__code-row">
                        <code className="settings-github__code">{ghDeviceFlow.userCode}</code>
                        <button
                          type="button"
                          className="btn btn--secondary btn--sm"
                          onClick={() => copyCode(ghDeviceFlow.userCode)}
                        >
                          <ClipboardCopy size={14} />
                          {ghCopied ? 'Copied!' : 'Copy'}
                        </button>
                      </div>
                      <button
                        type="button"
                        className="btn btn--primary"
                        onClick={() => openExternal(ghDeviceFlow.verificationUri)}
                      >
                        <ExternalLink size={14} />
                        Open GitHub
                      </button>
                      <p className="text-sub" style={{ marginTop: '0.75rem' }}>
                        Waiting for authorisation...
                      </p>
                    </div>
                  ) : (
                    <div className="settings-env__status">
                      <div className="status-indicator status-indicator--lg status-indicator--error" />
                      <div className="settings-env__status-text">
                        <span className="settings-env__status-label">Not connected</span>
                        <span className="settings-env__status-desc">
                          Sign in with GitHub to unlock team-based features.
                        </span>
                      </div>
                      <button
                        type="button"
                        className="btn btn--primary"
                        onClick={startGitHubConnect}
                        disabled={ghConnecting}
                      >
                        <Github size={14} />
                        {ghConnecting ? 'Connecting...' : 'Connect to GitHub'}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {ghError && (
                <div className="banner banner--error" style={{ marginTop: '1rem' }}>
                  <div className="banner__content">
                    <AlertTriangle size={16} />
                    <span>{ghError}</span>
                  </div>
                  <button type="button" onClick={() => setGhError(null)} className="btn btn--ghost">
                    <X size={16} />
                  </button>
                </div>
              )}

              {permissions?.connected && (
                <div className="card" style={{ marginTop: '1rem' }}>
                  <div className="card__header">
                    <h3 className="card__title">Access Summary</h3>
                  </div>
                  <div className="card__body">
                    <div className="status-grid">
                      <div className="card status-group status-group--col-1">
                        <div className="status-group__header">
                          <Users size={18} className="status-group__icon" />
                          <h4 className="status-group__title">Teams</h4>
                        </div>
                        <div className="status-group__body">
                          {permissions.teams?.length > 0 ? permissions.teams.map((team) => (
                            <div key={team} className="status-row">
                              <span className="status-label">{team}</span>
                              <span className="status-value">
                                <CheckCircle size={14} style={{ color: 'var(--color-success)' }} />
                              </span>
                            </div>
                          )) : (
                            <div className="status-row">
                              <span className="status-label text-sub">No teams in WabiSaby org</span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="card status-group status-group--col-2">
                        <div className="status-group__header">
                          <Shield size={18} className="status-group__icon" />
                          <h4 className="status-group__title">Granted Access</h4>
                        </div>
                        <div className="status-group__body">
                          <div className="status-row">
                            <span className="status-label">Views</span>
                            <span className="status-value">{permissions.views?.join(', ') || 'none'}</span>
                          </div>
                          <div className="status-row">
                            <span className="status-label">Command groups</span>
                            <span className="status-value">{permissions.commands?.join(', ') || 'none'}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </section>
          )}

          {activeTab === 'prereqs' && (
            <section className="settings-section settings-prereqs">
              <div className="card settings-prereqs__card">
                <div className="card__header settings-prereqs__header">
                  <div className="settings-prereqs__title-row">
                    <h3 className="card__title">Prerequisites</h3>
                    {prereqTotal > 0 && (
                      <span className="settings-prereqs__summary">
                        {prereqInstalled} of {prereqTotal} installed
                      </span>
                    )}
                  </div>
                  <p className="settings-prereqs__intro">
                    Tools and runtimes the devkit depends on. Required items must be installed for full functionality.
                  </p>
                </div>
                {prereqTotal > 0 && (
                  <div className="settings-prereqs__strip">
                    <span className={`settings-prereqs__pill ${prereqInstalled === prereqTotal ? 'settings-prereqs__pill--ok' : ''}`}>
                      <CheckCircle size={14} />
                      {prereqInstalled} installed
                    </span>
                    {prereqInstalled < prereqTotal && (
                      <span className="settings-prereqs__pill settings-prereqs__pill--missing">
                        <XCircle size={14} />
                        {prereqTotal - prereqInstalled} missing
                      </span>
                    )}
                  </div>
                )}
                <div className="card__body p-0">
                  {prereqList.length === 0 && !loading ? (
                    <div className="settings-empty">No prerequisites configured.</div>
                  ) : (
                    <ul className="settings-prereqs__list">
                      {prereqList.map((p, i) => (
                        <li
                          key={i}
                          className={`settings-prereqs__item ${p.installed ? 'settings-prereqs__item--ok' : 'settings-prereqs__item--missing'} ${p.required ? 'settings-prereqs__item--required' : ''}`}
                        >
                          <div className="settings-prereqs__item-main">
                            {p.installed ? (
                              <CheckCircle size={20} className="settings-prereqs__item-icon settings-prereqs__item-icon--ok" />
                            ) : (
                              <XCircle size={20} className="settings-prereqs__item-icon settings-prereqs__item-icon--missing" />
                            )}
                            <div className="settings-prereqs__item-text">
                              <span className="settings-prereqs__item-name">{p.name}</span>
                              {p.version && <span className="settings-prereqs__item-version">{p.version}</span>}
                              {p.message && !p.installed && (
                                <span className="settings-prereqs__item-message">{p.message}</span>
                              )}
                            </div>
                          </div>
                          <div className="settings-prereqs__item-meta">
                            {p.required && <span className="badge badge--neutral">Required</span>}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </section>
          )}

          {activeTab === 'env' && (
            <section className="settings-section settings-env">
              {/* Status banner */}
              <div className="card settings-env__card">
                <div className="card__header">
                  <h3 className="card__title">.env file</h3>
                  <p className="settings-env__intro">
                    Configuration is loaded from a <code>.env</code> file in the project root.
                  </p>
                </div>
                <div className="card__body">
                  {envStatus ? (
                    <div className="settings-env__status">
                      <div className={`status-indicator status-indicator--lg ${envStatus.hasEnvFile ? 'status-indicator--ready' : 'status-indicator--error'}`} />
                      <div className="settings-env__status-text">
                        <span className="settings-env__status-label">
                          {envStatus.hasEnvFile ? 'Present and loaded' : 'Missing'}
                        </span>
                        <span className="settings-env__status-desc">
                          {envStatus.hasEnvFile
                            ? 'Environment variables are loaded from .env. Restart services after changes.'
                            : 'Create .env from env.example or add variables below.'}
                        </span>
                      </div>
                      {envStatus.hasExample && !envStatus.hasEnvFile && (
                        <button
                          type="button"
                          className="btn btn--secondary settings-env__action"
                          onClick={handleCopyExample}
                          disabled={envSaving}
                        >
                          <Copy size={14} />
                          Copy env.example
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="settings-env__loading">
                      <div className="loading-spinner settings-env__spinner" />
                      <span>Checking environment...</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Error banner */}
              {envError && (
                <div className="banner banner--error">
                  <div className="banner__content">
                    <AlertTriangle size={16} />
                    <span>{envError}</span>
                  </div>
                  <button type="button" onClick={() => setEnvError(null)} className="btn btn--ghost">
                    <X size={16} />
                  </button>
                </div>
              )}

              {/* Restart reminder */}
              {envStatus?.hasEnvFile && (
                <div className="settings-env__tip">
                  <AlertTriangle size={14} />
                  <span>Variables are read at service startup. Restart running services to apply changes.</span>
                </div>
              )}

              {/* Variable groups */}
              {envStatus && (
                <div className="card settings-env__vars-card">
                  <div className="card__body p-0">
                    {renderVarGroup('Required', envStatus.requiredVars)}
                    {renderVarGroup('Optional', envStatus.optionalVars)}
                    {renderVarGroup('Custom', envStatus.customVars, true)}

                    {/* Add variable form */}
                    <div className="env-group env-group--add">
                      {addingVar ? (
                        <div className="env-var-add-form">
                          <input
                            ref={addNameRef}
                            type="text"
                            className="env-var-row__input env-var-add-form__name"
                            placeholder="VARIABLE_NAME"
                            value={newVarName}
                            onChange={(e) => setNewVarName(e.target.value.toUpperCase())}
                            onKeyDown={(e) => {
                              if (e.key === 'Escape') cancelAdding();
                            }}
                            disabled={envSaving}
                          />
                          <span className="env-var-add-form__eq">=</span>
                          <input
                            type="text"
                            className="env-var-row__input env-var-add-form__value"
                            placeholder="value"
                            value={newVarValue}
                            onChange={(e) => setNewVarValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveNewVar();
                              if (e.key === 'Escape') cancelAdding();
                            }}
                            disabled={envSaving}
                          />
                          <button
                            type="button"
                            className="btn btn--primary btn--sm"
                            onClick={saveNewVar}
                            disabled={envSaving || !newVarName.trim()}
                          >
                            <Save size={14} />
                            Add
                          </button>
                          <button
                            type="button"
                            className="btn btn--ghost btn--sm"
                            onClick={cancelAdding}
                            disabled={envSaving}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="btn btn--secondary btn--sm env-var-add-btn"
                          onClick={startAdding}
                        >
                          <Plus size={14} />
                          Add variable
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </section>
          )}
    </ViewWithSidebarLayout>
  );
}
