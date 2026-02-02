import React, { useEffect, useState, useCallback } from 'react';
import { services, events } from '../lib/wails';
import { StreamModal } from '../components/StreamModal';
import { StartStopAllButtons } from '../components/StartStopAllButtons';
import { RefreshCw, Play, Square, List, ExternalLink, Server } from 'lucide-react';

export function InfrastructureView() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [logsModal, setLogsModal] = useState(null);
  const [logsLines, setLogsLines] = useState([]);
  const [logsActive, setLogsActive] = useState(false);

  const fetchServices = useCallback(async () => {
    setLoading(true);
    if (!window.go) {
      setList([]);
      setLoading(false);
      return;
    }
    try {
      const data = await services.list();
      setList(Array.isArray(data) ? data : []);
    } catch {
      setList([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => fetchServices(), 0);
    return () => clearTimeout(t);
  }, [fetchServices]);

  useEffect(() => {
    if (!logsModal) return;
    const onLog = (payload) => {
      if (payload?.line != null) setLogsLines((prev) => [...prev, payload.line]);
    };
    const onDone = () => setLogsActive(false);
    events.on('devkit:service:logs', onLog);
    events.on('devkit:service:logs:done', onDone);
    return () => {
      events.off('devkit:service:logs');
      events.off('devkit:service:logs:done');
    };
  }, [logsModal]);

  const handleStart = async (name) => {
    if (!window.go) return;
    await services.start(name);
    fetchServices();
  };

  const handleStop = async (name) => {
    if (!window.go) return;
    await services.stop(name);
    fetchServices();
  };

  const handleStartAll = async () => {
    if (!window.go) return;
    await services.startAll();
    fetchServices();
  };

  const handleStopAll = async () => {
    if (!window.go) return;
    await services.stopAll();
    fetchServices();
  };

  const openLogs = (name) => {
    setLogsModal(name);
    setLogsLines([]);
    setLogsActive(true);
    services.startLogsStream(name);
  };

  const closeLogsModal = () => {
    if (logsModal && logsActive) services.stopLogsStream(logsModal);
    setLogsModal(null);
    setLogsLines([]);
    setLogsActive(false);
  };

  return (
    <div className="view">
      <div className="view__header">
        <div className="view__title-group">
          <h2 className="view__title">Docker Services</h2>
          <p className="view__subtitle">Start and stop infrastructure services.</p>
        </div>
        <div className="view__actions">
          <button type="button" onClick={fetchServices} className="btn btn--secondary">
            <RefreshCw size={14} className={loading ? 'icon-spin' : ''} />
            Refresh
          </button>
          {window.go && (
            <StartStopAllButtons onStart={handleStartAll} onStop={handleStopAll} />
          )}
        </div>
      </div>

      {loading && list.length === 0 ? (
        <div className="view__loading">Loading services...</div>
      ) : list.length === 0 ? (
        <div className="view__empty">No Docker services configured.</div>
      ) : (
        <div className="view__body">
          <div className="view__grid view__grid--sm">
            {list.map((svc) => (
              <InfrastructureCard
                key={svc.name}
                service={svc}
                onStart={() => handleStart(svc.name)}
                onStop={() => handleStop(svc.name)}
                onLogs={() => openLogs(svc.name)}
              />
            ))}
          </div>
        </div>
      )}

      {logsModal && (
        <StreamModal
          title={`Service logs — ${logsModal}`}
          lines={logsLines}
          onClose={closeLogsModal}
          isActive={logsActive}
        />
      )}
    </div>
  );
}

function InfrastructureCard({ service, onStart, onStop, onLogs }) {
  const isRunning = service.status === 'running';
  const isError = service.status === 'error';
  const badgeVariant = isRunning ? 'badge--success' : isError ? 'badge--danger' : 'badge--muted';

  return (
    <div className={`card service-card ${isRunning ? 'service-card--running' : ''}`}>
      <div className="card__header">
        <div className="card__icon-wrap">
          <Server size={20} />
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
          {window.go && (
            <>
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
            </>
          )}
        </div>
        {service.url && (
          <a href={service.url} target="_blank" rel="noopener noreferrer" className="btn btn--ghost btn--sm">
            <ExternalLink size={12} />
          </a>
        )}
      </div>
    </div>
  );
}
