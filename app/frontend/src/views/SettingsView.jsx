import React, { useEffect, useState, useCallback } from 'react';
import { status, prerequisites, notices, submodule, env } from '../lib/wails';
import { RefreshCw, CheckCircle, XCircle, AlertCircle, GitMerge, X } from 'lucide-react';

export function SettingsView() {
  const [appStatus, setAppStatus] = useState(null);
  const [prereqList, setPrereqList] = useState([]);
  const [noticesList, setNoticesList] = useState([]);
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
      const [s, p, n, sub, e] = await Promise.all([
        status.get(),
        prerequisites.list(),
        notices.list(),
        submodule.getSyncStatus(),
        env.getStatus(),
      ]);
      setAppStatus(s ?? null);
      setPrereqList(Array.isArray(p) ? p : []);
      setNoticesList(Array.isArray(n) ? n : []);
      const needs = sub?.needsSync;
      setSubmoduleNeedsSync(Array.isArray(needs) && needs.length > 0 ? needs : null);
      setEnvStatus(e ?? null);
    } catch {
      setAppStatus(null);
      setPrereqList([]);
      setNoticesList([]);
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

  const showSubmoduleBanner =
    submoduleNeedsSync &&
    submoduleNeedsSync.length > 0 &&
    !submoduleBannerDismissed &&
    window.go;

  return (
    <div className="view" style={{ maxWidth: '42rem' }}>
      <div className="view__header">
        <div className="view__title-group">
          <h2 className="view__title">Settings</h2>
          <p className="view__subtitle">Status, prerequisites, and notices.</p>
        </div>
        <button type="button" onClick={fetchAll} className="btn btn--secondary">
          <RefreshCw size={14} className={loading ? 'icon-spin' : ''} />
          Refresh
        </button>
      </div>

      {showSubmoduleBanner && (
        <div className="banner banner--warning">
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

      <div className="view__body">
        {appStatus && typeof appStatus === 'object' && (
          <section className="settings-section">
            <h3 className="settings-section__title">Status</h3>
            <div className="settings-section__content">
              {appStatus.message ?? JSON.stringify(appStatus)}
            </div>
          </section>
        )}

        <section className="settings-section">
          <h3 className="settings-section__title">Prerequisites</h3>
          {prereqList.length === 0 && !loading ? (
            <p className="view__subtitle">No prerequisites configured.</p>
          ) : (
            <ul className="settings-list">
              {prereqList.map((p, i) => (
                <li key={i} className="settings-list__item">
                  {p.installed ? (
                    <CheckCircle size={16} style={{ color: 'var(--color-success)', flexShrink: 0 }} />
                  ) : (
                    <XCircle size={16} style={{ color: 'var(--color-danger)', flexShrink: 0 }} />
                  )}
                  <span style={{ color: 'var(--text-main)' }}>{p.name}</span>
                  {p.version && <span className="view__subtitle">{p.version}</span>}
                  {p.required && <span className="view__subtitle">(required)</span>}
                  {p.message && <span className="notice-message">{p.message}</span>}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="settings-section">
          <h3 className="settings-section__title">Notices</h3>
          {noticesList.length === 0 && !loading ? (
            <p className="view__subtitle">No notices.</p>
          ) : (
            <ul className="settings-list">
              {noticesList.map((n, i) => (
                <li
                  key={n.id ?? i}
                  className={`settings-list__item ${
                    n.severity === 'error' ? 'settings-list__item--error' : n.severity === 'warn' ? 'settings-list__item--warn' : ''
                  }`}
                >
                  {n.severity === 'error' && <XCircle size={16} style={{ color: 'var(--color-danger)', flexShrink: 0, marginTop: '2px' }} />}
                  {n.severity === 'warn' && <AlertCircle size={16} style={{ color: 'var(--color-warning)', flexShrink: 0, marginTop: '2px' }} />}
                  <span style={{ color: 'var(--text-main)' }}>{n.message}</span>
                  {n.actionKey && <span className="view__subtitle">({n.actionKey})</span>}
                </li>
              ))}
            </ul>
          )}
        </section>

        {envStatus && (
          <section className="settings-section">
            <h3 className="settings-section__title">Environment</h3>
            <div className="settings-section__content">
              <p style={{ color: 'var(--text-sub)' }}>
                .env: {envStatus.hasEnvFile ? 'Present' : 'Missing'}
                {envStatus.hasExample && ' (example available)'}
              </p>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
