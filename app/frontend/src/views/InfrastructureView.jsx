import React, { useEffect, useState, useCallback } from 'react';
import { services, events } from '../lib/wails';
import { BrowserOpenURL } from '../../wailsjs/runtime/runtime';
import { StreamModal } from '../components/StreamModal';
import { EmptyState } from '../components/EmptyState';
import { StartStopAllButtons } from '../components/StartStopAllButtons';
import { useToast } from '../hooks/useToast';
import {
  RefreshCw,
  Play,
  Square,
  List,
  ExternalLink,
  Server,
  Loader2,
  Database,
  Layers,
  Cloud,
  Container,
  HardDrive,
  Shield,
  Lock
} from 'lucide-react';

export function InfrastructureView() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [logsModal, setLogsModal] = useState(null);
  const [logsLines, setLogsLines] = useState([]);
  const [logsActive, setLogsActive] = useState(false);
  const [pendingActions, setPendingActions] = useState({});
  const [bulkAction, setBulkAction] = useState(null);
  const { success: toastSuccess, error: toastError, info: toastInfo } = useToast();

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
    if (pendingActions[name]) return;

    setPendingActions((prev) => ({ ...prev, [name]: 'start' }));
    try {
      toastInfo(`Starting ${name}...`);
      await services.start(name);
      await fetchServices();
      toastSuccess(`${name} started`);
    } catch (err) {
      toastError(`Failed to start ${name}: ${err.message || 'Unknown error'}`);
    } finally {
      setPendingActions((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  };

  const handleStop = async (name) => {
    if (!window.go) return;
    if (pendingActions[name]) return;

    setPendingActions((prev) => ({ ...prev, [name]: 'stop' }));
    try {
      toastInfo(`Stopping ${name}...`);
      await services.stop(name);
      await fetchServices();
      toastSuccess(`${name} stopped`);
    } catch (err) {
      toastError(`Failed to stop ${name}: ${err.message || 'Unknown error'}`);
    } finally {
      setPendingActions((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  };

  const handleStartAll = async () => {
    if (!window.go) return;
    if (bulkAction) return;
    setBulkAction('start');
    try {
      toastInfo('Starting all services...');
      await services.startAll();
      await fetchServices();
      toastSuccess('All services started');
    } catch (err) {
      toastError(`Failed to start all: ${err.message || 'Unknown error'}`);
    } finally {
      setBulkAction(null);
    }
  };

  const handleStopAll = async () => {
    if (!window.go) return;
    if (bulkAction) return;
    setBulkAction('stop');
    try {
      toastInfo('Stopping all services...');
      await services.stopAll();
      await fetchServices();
      toastSuccess('All services stopped');
    } catch (err) {
      toastError(`Failed to stop all: ${err.message || 'Unknown error'}`);
    } finally {
      setBulkAction(null);
    }
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

  const pgAdminService = list.find((entry) => isPgAdminService(entry));
  const redisCommanderService = list.find((entry) => isRedisCommanderService(entry));
  const visibleServices = list.filter((svc) => !isPgAdminService(svc) && !isRedisCommanderService(svc));
  const getUiServiceName = (service) => (isPostgresService(service) ? 'pgAdmin' : isRedisService(service) ? 'RedisCommander' : null);

  const waitForServiceRunning = async (serviceName, attempts = 10, delayMs = 800) => {
    for (let i = 0; i < attempts; i += 1) {
      try {
        const servicesList = await services.list();
        const match = servicesList.find((entry) => entry.name === serviceName);
        if (match?.status === 'running') return match;
      } catch {
        // ignore and retry
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    return null;
  };

  const openUiService = async (serviceName, url) => {
    if (!window.go || !url) return;
    const uiService = list.find((entry) => entry.name === serviceName);
    if (!uiService || uiService.status !== 'running') {
      setPendingActions((prev) => ({ ...prev, [serviceName]: 'start' }));
      try {
        toastInfo(`Starting ${serviceName}...`);
        await services.start(serviceName);
        await fetchServices();
        const readyService = await waitForServiceRunning(serviceName);
        if (!readyService) {
          toastError(`${serviceName} did not become ready yet`);
          return;
        }
        toastSuccess(`${serviceName} is ready`);
      } finally {
        setPendingActions((prev) => {
          const next = { ...prev };
          delete next[serviceName];
          return next;
        });
      }
    }
    if (window.runtime) {
      BrowserOpenURL(url);
    } else {
      window.open(url);
    }
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

      {loading && visibleServices.length === 0 ? (
        <div className="view__loading">Loading services...</div>
      ) : visibleServices.length === 0 ? (
        <div className="view__body">
          <EmptyState
            icon={<Server size={44} />}
            title="No Docker services configured"
            subtitle="When services are set up, they’ll appear here for quick start/stop actions."
          />
        </div>
      ) : (
        <div className="view__body">
          <div className="view__grid view__grid--sm">
            {visibleServices.map((svc) => {
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
              const uiServiceName = getUiServiceName(svc);
              const uiPending = uiServiceName ? pendingActions[uiServiceName] : null;
              return (
                <InfrastructureCard
                  key={svc.name}
                  service={svc}
                  pgAdminService={pgAdminService}
                  redisCommanderService={redisCommanderService}
                  pendingAction={pendingAction}
                  uiPending={uiPending}
                  onOpenUi={openUiService}
                  onStart={() => handleStart(svc.name)}
                  onStop={() => handleStop(svc.name)}
                  onLogs={() => openLogs(svc.name)}
                />
              );
            })}
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

function InfrastructureCard({
  service,
  onStart,
  onStop,
  onLogs,
  pendingAction,
  pgAdminService,
  redisCommanderService,
  uiPending,
  onOpenUi
}) {
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

  const statusLabel = isStarting ? 'Starting' : isStopping ? 'Stopping' : (service.status || 'Stopped');

  const { icon: ServiceIcon, color: iconColor } = getInfrastructureIcon(service.name);
  const wantsPgAdmin = isPostgresService(service);
  const wantsRedisCommander = isRedisService(service);
  const pgAdminUrl = pgAdminService?.url || null;
  const redisCommanderUrl = redisCommanderService?.url || null;
  const openUrl = wantsPgAdmin
    ? pgAdminUrl
    : wantsRedisCommander
      ? redisCommanderUrl
      : service.url;
  const openTitle = wantsPgAdmin
    ? 'Open pgAdmin'
    : wantsRedisCommander
      ? 'Open Redis Commander'
      : 'Open service';
  const showOpen = Boolean(openUrl || wantsPgAdmin || wantsRedisCommander);
  const openPending = uiPending === 'start';

  return (
    <div
      className={`card service-card ${isRunning ? 'service-card--running' : ''} ${isTransitioning ? 'service-card--transitioning' : ''}`}
      data-state={isStarting ? 'starting' : isStopping ? 'stopping' : service.status || 'stopped'}
      aria-busy={isTransitioning}
    >
      <div className="card__header">
        <div className="card__icon-wrap" style={iconColor ? { color: iconColor } : undefined}>
          <ServiceIcon size={20} />
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
          {window.go && (
            <>
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
            </>
          )}
        </div>
        {showOpen && (
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            title={openTitle}
            onClick={() => {
              if (!openUrl) return;
              if (wantsPgAdmin) {
                onOpenUi?.('pgAdmin', openUrl);
              } else if (wantsRedisCommander) {
                onOpenUi?.('RedisCommander', openUrl);
              } else if (window.runtime) {
                BrowserOpenURL(openUrl);
              } else {
                window.open(openUrl);
              }
            }}
            disabled={openPending}
          >
            <ExternalLink size={12} />
          </button>
        )}
      </div>
    </div>
  );
}

function isPgAdminService(service) {
  const name = service?.name?.toLowerCase?.() || '';
  return name.includes('pgadmin');
}

function isPostgresService(service) {
  const name = service?.name?.toLowerCase?.() || '';
  return name.includes('postgres');
}

function isRedisService(service) {
  const name = service?.name?.toLowerCase?.() || '';
  return name.includes('redis');
}

function isRedisCommanderService(service) {
  const name = service?.name?.toLowerCase?.() || '';
  return name.includes('rediscommander') || name.includes('redis commander') || name.includes('redis-commander');
}

function getInfrastructureIcon(name = '') {
  const key = name.toLowerCase();
  if (key.includes('postgres')) return { icon: Database, color: '#38bdf8' };
  if (key.includes('redis')) return { icon: Layers, color: '#f97316' };
  if (key.includes('minio') || key.includes('s3')) return { icon: Cloud, color: '#22d3ee' };
  if (key.includes('keycloak')) return { icon: Shield, color: '#7c3aed' };
  if (key.includes('vault')) return { icon: Lock, color: '#fbbf24' };
  if (key.includes('rabbit') || key.includes('mq')) return { icon: Container, color: '#a78bfa' };
  if (key.includes('elastic') || key.includes('search')) return { icon: HardDrive, color: '#facc15' };
  return { icon: Server, color: null };
}
