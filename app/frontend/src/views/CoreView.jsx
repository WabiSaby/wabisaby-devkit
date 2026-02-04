import React, { useEffect, useState, useCallback } from 'react';
import { backend, events } from '../lib/wails';
import { BrowserOpenURL } from '../../wailsjs/runtime/runtime';
import { StreamModal } from '../components/StreamModal';
import { Skeleton } from '../components/Skeleton';
import { StartStopAllButtons } from '../components/StartStopAllButtons';
import { EmptyState } from '../components/EmptyState';
import { useToast } from '../hooks/useToast';
import {
  RefreshCw,
  Play,
  Square,
  List,
  ExternalLink,
  Shield,
  Activity,
  Server,
  Loader2
} from 'lucide-react';

export function ServicesView() {
  const [backends, setBackends] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeLogs, setActiveLogs] = useState(null);
  const [logLines, setLogLines] = useState([]);
  const [logActive, setLogActive] = useState(false);
  const [pendingActions, setPendingActions] = useState({});
  const [bulkAction, setBulkAction] = useState(null);
  const { success: toastSuccess, error: toastError, info: toastInfo } = useToast();

  const fetchBackends = useCallback(async () => {
    setLoading(true);
    if (!window.go) {
      // Mock data for browser testing
      setTimeout(() => {
        setBackends([
          { name: 'wabisaby-core', group: 'core', status: 'running', port: 8080 },
          { name: 'wabisaby-coordinator', group: 'core', status: 'stopped', port: 8081 },
          { name: 'wabisaby-node-1', group: 'nodes', status: 'running', port: 9001 },
        ]);
        setLoading(false);
      }, 500);
      return;
    }

    try {
      const list = await backend.list();
      setBackends(Array.isArray(list) ? list : []);
    } catch (err) {
      console.error(err);
      toastError('Failed to fetch services');
      setBackends([]);
    }
    setLoading(false);
  }, [toastError]);

  useEffect(() => {
    fetchBackends();
  }, [fetchBackends]);

  // Log streaming effect
  useEffect(() => {
    if (!activeLogs) return;

    const onLog = (payload) => {
      if (payload?.line != null) setLogLines((prev) => [...prev, payload.line]);
    };
    const onDone = () => setLogActive(false);

    events.on('devkit:backend:logs', onLog);
    events.on('devkit:backend:logs:done', onDone);

    return () => {
      events.off('devkit:backend:logs');
      events.off('devkit:backend:logs:done');
    };
  }, [activeLogs]);

  const handleAction = async (action, name) => {
    if (!window.go) return;
    if (pendingActions[name]) return;

    setPendingActions((prev) => ({ ...prev, [name]: action }));
    try {
      if (action === 'start') {
        toastInfo(`Starting ${name}...`);
        await backend.start(name);
        toastSuccess(`${name} started`);
      } else if (action === 'stop') {
        toastInfo(`Stopping ${name}...`);
        await backend.stop(name);
        toastSuccess(`${name} stopped`);
      }
      await fetchBackends();
    } catch (err) {
      toastError(`Failed to ${action} ${name}: ${err.message || 'Unknown error'}`);
    } finally {
      setPendingActions((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  };

  const handleGroupAction = async (action, group) => {
    if (!window.go) return;

    try {
      if (action === 'start') {
        toastInfo(`Starting group: ${group}...`);
        await backend.startGroup(group);
        toastSuccess(`Group ${group} started`);
      } else if (action === 'stop') {
        toastInfo(`Stopping group: ${group}...`);
        await backend.stopGroup(group);
        toastSuccess(`Group ${group} stopped`);
      }
      fetchBackends();
    } catch (err) {
      toastError(`Failed to ${action} group ${group}`);
    }
  };

  const groupNames = Object.keys(
    backends.reduce((acc, curr) => {
      const g = curr.group || 'other';
      acc[g] = true;
      return acc;
    }, {})
  );

  const handleStartAll = async () => {
    if (!window.go || groupNames.length === 0) return;
    if (bulkAction) return;
    setBulkAction('start');
    try {
      toastInfo('Starting all services...');
      for (const group of groupNames) {
        await backend.startGroup(group);
      }
      toastSuccess('All services started');
      await fetchBackends();
    } catch (err) {
      toastError(`Failed to start all: ${err.message || 'Unknown error'}`);
    } finally {
      setBulkAction(null);
    }
  };

  const handleStopAll = async () => {
    if (!window.go || groupNames.length === 0) return;
    if (bulkAction) return;
    setBulkAction('stop');
    try {
      toastInfo('Stopping all services...');
      for (const group of groupNames) {
        await backend.stopGroup(group);
      }
      toastSuccess('All services stopped');
      await fetchBackends();
    } catch (err) {
      toastError(`Failed to stop all: ${err.message || 'Unknown error'}`);
    } finally {
      setBulkAction(null);
    }
  };

  const openLogs = (name) => {
    setActiveLogs(name);
    setLogLines([]);
    setLogActive(true);
    backend.startLogsStream(name);
  };

  const closeLogs = () => {
    if (activeLogs) backend.stopLogsStream(activeLogs);
    setActiveLogs(null);
    setLogLines([]);
    setLogActive(false);
  };

  // Group services
  const groups = backends.reduce((acc, curr) => {
    const g = curr.group || 'other';
    if (!acc[g]) acc[g] = [];
    acc[g].push(curr);
    return acc;
  }, {});

  return (
    <div className="view">
      <div className="view__header">
        <div className="view__title-group">
          <h2 className="view__title">Service Dashboard</h2>
          <p className="view__subtitle">Control and monitor application services and nodes.</p>
        </div>
        <div className="view__actions">
          <button type="button" onClick={fetchBackends} className="btn btn--secondary">
            <RefreshCw size={14} className={loading ? 'icon-spin' : ''} />
            Refresh
          </button>
          {window.go && groupNames.length > 0 && (
            <StartStopAllButtons
              onStart={handleStartAll}
              onStop={handleStopAll}
              isStarting={bulkAction === 'start'}
              isStopping={bulkAction === 'stop'}
              disabled={loading}
            />
          )}
        </div>
      </div>

      {loading && backends.length === 0 ? (
        <div className="view__grid">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card">
              <div className="card__header">
                <Skeleton width={32} height={32} variant="circle" />
                <Skeleton width={100} height={20} />
              </div>
              <Skeleton width="100%" height={60} />
            </div>
          ))}
        </div>
      ) : backends.length === 0 ? (
        <div className="view__body">
          <EmptyState
            icon={<Server size={44} />}
            title="No runnable services found"
            subtitle="When core services are available, you’ll see them listed here."
          />
        </div>
      ) : (
        <div className="view__body">
          {Object.entries(groups).map(([groupName, services]) => (
            <div key={groupName} className="view__section">
              <div className="view__section-header">
                <h3 className="view__section-title">{groupName} Services</h3>
              </div>

              <div className="view__grid view__grid--sm">
                {services.map((svc) => {
                  const bulkPending =
                    bulkAction === 'start'
                      ? svc.status !== 'running'
                        ? 'start'
                        : null
                      : bulkAction === 'stop'
                        ? svc.status === 'running'
                          ? 'stop'
                          : null
                        : null;
                  const pendingAction = pendingActions[svc.name] || bulkPending;
                  return (
                    <ServiceCard
                      key={svc.name}
                      service={svc}
                      pendingAction={pendingAction}
                      onStart={() => handleAction('start', svc.name)}
                      onStop={() => handleAction('stop', svc.name)}
                      onLogs={() => openLogs(svc.name)}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {activeLogs && (
        <StreamModal
          title={`Logs: ${activeLogs}`}
          lines={logLines}
          onClose={closeLogs}
          isActive={logActive}
        />
      )}
    </div>
  );
}

function ServiceCard({ service, onStart, onStop, onLogs, pendingAction }) {
  const isRunning = service.status === 'running';
  const isError = service.status === 'error';
  const isStarting = pendingAction === 'start';
  const isStopping = pendingAction === 'stop';
  const isTransitioning = isStarting || isStopping;
  const badgeVariant = isTransitioning
    ? 'badge--info badge--pending'
    : isRunning
      ? 'badge--success'
      : isError
        ? 'badge--danger'
        : 'badge--muted';

  // For API service, open button always goes to API docs (use docsUrl or construct /docs from port)
  const isApiService = service.name === 'api';
  const openUrl = isApiService
    ? (service.docsUrl || (service.port ? `http://localhost:${service.port}/docs` : null))
    : (service.docsUrl || service.healthUrl);
  const openTitle = isApiService ? 'Open API docs' : (service.docsUrl ? 'Open API docs' : 'Open health');

  const statusLabel = isStarting ? 'Starting' : isStopping ? 'Stopping' : (service.status || 'Stopped');

  return (
    <div
      className={`card service-card ${isRunning ? 'service-card--running' : ''} ${isTransitioning ? 'service-card--transitioning' : ''}`}
      data-state={isStarting ? 'starting' : isStopping ? 'stopping' : service.status || 'stopped'}
      aria-busy={isTransitioning}
    >
      <div className="card__header">
        <div className="card__icon-wrap">
          {service.group === 'core' ? <Shield size={20} /> : <Activity size={20} />}
        </div>
        <div className={`badge ${badgeVariant}`}>
          <span className="badge__dot" />
          <span>{statusLabel}</span>
        </div>
      </div>

      <div className="card__main" style={{ marginBottom: 'var(--space-4)' }}>
        <h3 className="card__title">{service.name}</h3>
        <p className="card__meta">
          {service.port ? `Port: ${service.port}` : 'No Port Exposed'}
        </p>
      </div>

      <div className="card__footer">
        <div className="card__actions">
          {isRunning ? (
            <button
              type="button"
              onClick={onStop}
              className={`btn btn--danger btn--sm btn--state ${isStopping ? 'btn--pending' : ''}`}
              disabled={isTransitioning}
              aria-busy={isStopping}
            >
              {isStopping ? <Loader2 size={12} className="icon-spin" /> : <Square size={12} />} {isStopping ? 'Stopping' : 'Stop'}
            </button>
          ) : (
            <button
              type="button"
              onClick={onStart}
              className={`btn btn--success btn--sm btn--state ${isStarting ? 'btn--pending' : ''}`}
              disabled={isTransitioning}
              aria-busy={isStarting}
            >
              {isStarting ? <Loader2 size={12} className="icon-spin" /> : <Play size={12} />} {isStarting ? 'Starting' : 'Start'}
            </button>
          )}
          <button type="button" onClick={onLogs} className="btn btn--ghost btn--sm" disabled={isTransitioning}>
            <List size={12} /> Logs
          </button>
        </div>
        {openUrl && (
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            title={openTitle}
            onClick={() => (window.runtime ? BrowserOpenURL(openUrl) : window.open(openUrl))}
          >
            <ExternalLink size={12} />
          </button>
        )}
      </div>
    </div>
  );
}
