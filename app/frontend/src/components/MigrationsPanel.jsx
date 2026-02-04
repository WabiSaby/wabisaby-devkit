import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { migration, events } from '../lib/wails';
import { StreamModal } from './StreamModal';
import { useToast } from '../hooks/useToast';
import {
  ArrowDown,
  ArrowUp,
  Database,
  RefreshCw,
  AlertTriangle,
  Loader2,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Circle,
  GitBranch,
} from 'lucide-react';

export function MigrationsPanel() {
  const [collapsed, setCollapsed] = useState(true);
  const [migrationStatus, setMigrationStatus] = useState(null);
  const [migrationLoading, setMigrationLoading] = useState(false);
  const [migrationModalAction, setMigrationModalAction] = useState(null);
  const [migrationLines, setMigrationLines] = useState([]);
  const [migrationActive, setMigrationActive] = useState(false);
  const { error: toastError, info: toastInfo, success: toastSuccess } = useToast();

  const fetchMigrationStatus = useCallback(async () => {
    if (!window.go) {
      setMigrationStatus(null);
      setMigrationLoading(false);
      return;
    }
    setMigrationLoading(true);
    try {
      const m = await migration.getStatus();
      setMigrationStatus(m ?? null);
    } catch {
      setMigrationStatus(null);
    }
    setMigrationLoading(false);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => fetchMigrationStatus(), 0);
    return () => clearTimeout(t);
  }, [fetchMigrationStatus]);

  useEffect(() => {
    if (!migrationModalAction) return;
    const onLine = (payload) => {
      if (payload?.action && payload.action !== migrationModalAction) return;
      if (payload?.line != null) setMigrationLines((prev) => [...prev, payload.line]);
    };
    const onDone = (payload) => {
      if (payload?.action && payload.action !== migrationModalAction) return;
      setMigrationActive(false);
      fetchMigrationStatus();
      toastSuccess('Migration finished');
    };
    events.on('devkit:migration:stream', onLine);
    events.on('devkit:migration:stream:done', onDone);
    return () => {
      events.off('devkit:migration:stream');
      events.off('devkit:migration:stream:done');
    };
  }, [migrationModalAction, fetchMigrationStatus, toastSuccess]);

  const startMigration = async (action) => {
    if (!window.go) return;
    setMigrationLines([]);
    setMigrationModalAction(action);
    setMigrationActive(true);
    try {
      toastInfo(`Running migration ${action}...`);
      await migration.startStream(action);
    } catch (err) {
      setMigrationActive(false);
      toastError(`Failed to start migration: ${err.message || 'Unknown error'}`);
    }
  };

  const closeMigrationModal = () => {
    if (migrationModalAction && migrationActive) migration.stopStream(migrationModalAction);
    setMigrationModalAction(null);
    setMigrationLines([]);
    setMigrationActive(false);
  };

  const migrations = useMemo(
    () => (Array.isArray(migrationStatus?.migrations) ? migrationStatus.migrations : []),
    [migrationStatus]
  );
  const sortedMigrations = useMemo(() => {
    return [...migrations].sort((a, b) => {
      if (a.applied === b.applied) {
        return (b.version || 0) - (a.version || 0);
      }
      return a.applied ? 1 : -1;
    });
  }, [migrations]);
  const appliedCount = migrations.filter((m) => m.applied).length;
  const pendingCount = migrations.length - appliedCount;
  const isDirty = migrationStatus?.dirty;
  const hasError = Boolean(migrationStatus?.error);
  const isRunning = migrationActive;
  const actionLabel = migrationModalAction === 'down' ? 'Rollback' : 'Run Up';
  const currentVersion = migrationStatus?.currentVersion ?? 0;

  // One-line summary for collapsed header
  const summaryParts = [];
  if (migrationStatus && !migrationLoading) {
    summaryParts.push(`v${currentVersion}`);
    if (pendingCount > 0) summaryParts.push(`${pendingCount} pending`);
    if (appliedCount > 0) summaryParts.push(`${appliedCount} applied`);
    summaryParts.push(isDirty ? 'Dirty' : 'Clean');
  }
  const summaryLine = summaryParts.length ? summaryParts.join(' · ') : null;

  return (
    <>
      <div className={`card migration-card migration-card--collapsible ${collapsed ? 'migration-card--collapsed' : ''}`}>
        <div
          className="card__header migration-card__header-toggle"
          onClick={() => setCollapsed((c) => !c)}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setCollapsed((c) => !c)}
          role="button"
          tabIndex={0}
          aria-expanded={!collapsed}
        >
          <div className="migration-card__header-inner">
            <div className="migration-card__header-main">
              <div className="card__icon-wrap migration-card__icon">
                <Database size={20} />
              </div>
              <div className="migration-card__header-text">
                <h3 className="card__title migration-card__title">Database Migrations</h3>
                <p className="migration-card__subtitle">
                  {summaryLine || 'Track schema state and run migrations safely.'}
                </p>
              </div>
              <span className="migration-card__chevron" aria-hidden>
                {collapsed ? <ChevronDown size={20} /> : <ChevronUp size={20} />}
              </span>
            </div>
            <div className="card__actions migration-card__header-actions" onClick={(e) => e.stopPropagation()}>
              {isRunning && (
                <div className="migration-pill migration-pill--running">
                  <Loader2 size={12} className="icon-spin" />
                  {actionLabel}
                </div>
              )}
              <button
                type="button"
                onClick={fetchMigrationStatus}
                className="btn btn--ghost btn--sm btn--icon"
                disabled={migrationLoading}
                title="Refresh status"
              >
                <RefreshCw size={14} className={migrationLoading ? 'icon-spin' : ''} />
              </button>
              {window.go && (
                <div className="migration-card__action-buttons">
                  <button
                    type="button"
                    onClick={() => startMigration('up')}
                    className="btn btn--success btn--sm"
                    disabled={migrationActive || pendingCount === 0}
                    title={pendingCount > 0 ? `Run ${pendingCount} pending migration${pendingCount > 1 ? 's' : ''}` : 'No pending migrations'}
                  >
                    <ArrowUp size={14} />
                    {pendingCount > 0 ? ` Run ${pendingCount}` : ' Run up'}
                  </button>
                  <button
                    type="button"
                    onClick={() => startMigration('down')}
                    className="btn btn--danger btn--sm"
                    disabled={migrationActive || appliedCount === 0}
                    title={appliedCount > 0 ? 'Rollback last migration' : 'Nothing to rollback'}
                  >
                    <ArrowDown size={14} /> Rollback
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="migration-card__collapsible">
          <div className="migration-card__body">
            {migrationLoading && !migrationStatus ? (
              <div className="migration-card__loading">
                <div className="migration-card__skeleton migration-card__skeleton--strip" />
                <div className="migration-card__skeleton migration-card__skeleton--list" />
              </div>
            ) : !migrationStatus ? (
              <div className="migration-card__empty">
                <GitBranch size={32} strokeWidth={1.2} />
                <p className="migration-card__empty-title">No migration status</p>
                <p className="migration-card__empty-desc">Connect a backend or run the app to see migrations.</p>
              </div>
            ) : (
              <>
                {hasError && (
                  <div className="migration-alert migration-alert--error">
                    <AlertTriangle size={18} />
                    <div>
                      <strong>Migration error</strong>
                      <p>{migrationStatus?.error}</p>
                    </div>
                  </div>
                )}

                <div className="migration-strip">
                  <div className="migration-strip__version">
                    <span className="migration-strip__label">Version</span>
                    <span className="migration-strip__value migration-strip__value--mono">{currentVersion}</span>
                  </div>
                  <div className="migration-strip__divider" />
                  <div className="migration-strip__counts">
                    <div className="migration-strip__count migration-strip__count--pending">
                      <Circle size={10} />
                      <span>{pendingCount}</span> pending
                    </div>
                    <div className="migration-strip__count migration-strip__count--applied">
                      <CheckCircle2 size={10} />
                      <span>{appliedCount}</span> applied
                    </div>
                  </div>
                  <div className="migration-strip__divider" />
                  <div className={`migration-strip__state migration-strip__state--${isDirty ? 'dirty' : 'clean'}`}>
                    <span className="migration-strip__state-dot" />
                    {isDirty ? 'Dirty' : 'Clean'}
                  </div>
                </div>

                {sortedMigrations.length > 0 ? (
                  <div className="migration-timeline">
                    <div className="migration-timeline__label">Migrations</div>
                    <ul className="migration-timeline__list">
                      {sortedMigrations.map((m, i) => (
                        <li
                          key={m.version}
                          className={`migration-timeline__item migration-timeline__item--${m.applied ? 'applied' : 'pending'}`}
                          style={{ animationDelay: `${i * 0.04}s` }}
                        >
                          <span className="migration-timeline__indicator" aria-hidden>
                            {m.applied ? <CheckCircle2 size={16} /> : <Circle size={16} />}
                          </span>
                          <div className="migration-timeline__content">
                            <span className="migration-timeline__name">{m.name}</span>
                            <span className="migration-timeline__version">v{m.version}</span>
                          </div>
                          <span className={`migration-timeline__badge migration-timeline__badge--${m.applied ? 'applied' : 'pending'}`}>
                            {m.applied ? 'Applied' : 'Pending'}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <div className="migration-card__empty migration-card__empty--inline">
                    <p>No migrations defined yet.</p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {migrationModalAction && (
        <StreamModal
          title={`Migration ${migrationModalAction}`}
          lines={migrationLines}
          onClose={closeMigrationModal}
          isActive={migrationActive}
        />
      )}
    </>
  );
}
