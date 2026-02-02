import React, { useEffect, useState, useCallback } from 'react';
import { backend, events } from '../lib/wails';
import { StreamModal } from '../components/StreamModal';
import { Skeleton } from '../components/Skeleton';
import { StartStopAllButtons } from '../components/StartStopAllButtons';
import { useToast } from '../hooks/useToast';
import {
  RefreshCw,
  Play,
  Square,
  List,
  ExternalLink,
  Shield,
  Activity,
  Server
} from 'lucide-react';

export function ServicesView() {
  const [backends, setBackends] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeLogs, setActiveLogs] = useState(null);
  const [logLines, setLogLines] = useState([]);
  const [logActive, setLogActive] = useState(false);
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
      fetchBackends();
    } catch (err) {
      toastError(`Failed to ${action} ${name}: ${err.message || 'Unknown error'}`);
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
    try {
      toastInfo('Starting all services...');
      for (const group of groupNames) {
        await backend.startGroup(group);
      }
      toastSuccess('All services started');
      fetchBackends();
    } catch (err) {
      toastError(`Failed to start all: ${err.message || 'Unknown error'}`);
    }
  };

  const handleStopAll = async () => {
    if (!window.go || groupNames.length === 0) return;
    try {
      toastInfo('Stopping all services...');
      for (const group of groupNames) {
        await backend.stopGroup(group);
      }
      toastSuccess('All services stopped');
      fetchBackends();
    } catch (err) {
      toastError(`Failed to stop all: ${err.message || 'Unknown error'}`);
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
            <StartStopAllButtons onStart={handleStartAll} onStop={handleStopAll} />
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
        <div className="view__empty">
          <Server size={48} style={{ opacity: 0.2, marginBottom: 'var(--space-4)' }} />
          No runnable services found.
        </div>
      ) : (
        <div className="view__body">
          {Object.entries(groups).map(([groupName, services]) => (
            <div key={groupName} className="view__section">
              <div className="view__section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
                <h3 className="view__section-title" style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {groupName} Services
                </h3>
              </div>

              <div className="view__grid view__grid--sm">
                {services.map((svc) => (
                  <ServiceCard
                    key={svc.name}
                    service={svc}
                    onStart={() => handleAction('start', svc.name)}
                    onStop={() => handleAction('stop', svc.name)}
                    onLogs={() => openLogs(svc.name)}
                  />
                ))}
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

function ServiceCard({ service, onStart, onStop, onLogs }) {
  const isRunning = service.status === 'running';
  const isError = service.status === 'error';
  const badgeVariant = isRunning ? 'badge--success' : isError ? 'badge--danger' : 'badge--muted';

  return (
    <div className={`card service-card ${isRunning ? 'service-card--running' : ''}`}>
      <div className="card__header">
        <div className="card__icon-wrap">
          {service.group === 'core' ? <Shield size={20} /> : <Activity size={20} />}
        </div>
        <div className={`badge ${badgeVariant}`}>
          <span className="badge__dot" />
          <span>{service.status || 'Stopped'}</span>
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
            <button type="button" onClick={onStop} className="btn btn--danger btn--sm">
              <Square size={12} /> Stop
            </button>
          ) : (
            <button type="button" onClick={onStart} className="btn btn--success btn--sm">
              <Play size={12} /> Start
            </button>
          )}
          <button type="button" onClick={onLogs} className="btn btn--ghost btn--sm">
            <List size={12} /> Logs
          </button>
        </div>
        {service.healthUrl && (
          <a href={service.healthUrl} target="_blank" rel="noopener noreferrer" className="btn btn--ghost btn--sm">
            <ExternalLink size={12} />
          </a>
        )}
      </div>
    </div>
  );
}
