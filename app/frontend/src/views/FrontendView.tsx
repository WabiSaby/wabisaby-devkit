import React, { useEffect, useState, useCallback } from 'react';
import { Play, Square, ExternalLink, Globe, List } from 'lucide-react';
import { ViewLayout } from '@wabisaby/ui';
import { webapp, events } from '../lib/wails';
import { StreamModal } from '../components/StreamModal';
import { BrowserOpenURL } from '../../wailsjs/runtime/runtime';

const WEBAPP_PROJECT = 'wabisaby-web';
const DEV_SERVER_URL = 'http://localhost:5174';

export function FrontendView() {
  const [devStreamOpen, setDevStreamOpen] = useState(false);
  const [devStreamLines, setDevStreamLines] = useState<string[]>([]);
  const [devActive, setDevActive] = useState(false);

  // Always listen for process exit so we can set devActive false when the server actually stops
  useEffect(() => {
    const onDone = (payload: { project?: string; action?: string }) => {
      if (payload?.project === WEBAPP_PROJECT && payload?.action === 'dev') {
        setDevActive(false);
      }
    };
    events.on('devkit:project:stream:done', onDone);
    return () => {
      events.off('devkit:project:stream:done');
    };
  }, []);

  // While the dev server is running, keep accumulating log lines (so Logs modal can show them)
  useEffect(() => {
    if (!devActive) return;
    const onLine = (payload: { project?: string; action?: string; line?: string }) => {
      if (payload?.project === WEBAPP_PROJECT && payload?.action === 'dev' && payload?.line != null) {
        setDevStreamLines((prev) => [...prev, payload.line]);
      }
    };
    events.on('devkit:project:stream', onLine);
    return () => {
      events.off('devkit:project:stream');
    };
  }, [devActive]);

  const handleStartDev = useCallback(async () => {
    setDevStreamLines([]);
    setDevActive(true);
    setDevStreamOpen(true);
    const { success, message } = await webapp.startDev();
    if (!success) {
      setDevStreamLines((prev) => [...prev, message || 'Failed to start dev server'].filter(Boolean));
      setDevActive(false);
    }
  }, []);

  const handleStopDev = useCallback(() => {
    webapp.stopDev();
    setDevActive(false);
  }, []);

  const closeDevModal = useCallback(() => {
    setDevStreamOpen(false);
  }, []);

  const handleOpenInBrowser = useCallback(() => {
    if (window.runtime?.BrowserOpenURL) {
      BrowserOpenURL(DEV_SERVER_URL);
    } else {
      window.open(DEV_SERVER_URL, '_blank');
    }
  }, []);

  return (
    <ViewLayout
      title="Frontend"
      subtitle="Run the WabiSaby web app in development mode."
    >
      <div className="view__grid view__grid--sm">
        <WebAppCard
          devActive={devActive}
          onStartDev={handleStartDev}
          onStopDev={handleStopDev}
          onOpenLogs={() => setDevStreamOpen(true)}
          onOpenInBrowser={handleOpenInBrowser}
        />
      </div>

      {devStreamOpen && (
        <StreamModal
          title="wabisaby-web — dev server"
          lines={devStreamLines}
          onClose={closeDevModal}
          isActive={devActive}
        />
      )}
    </ViewLayout>
  );
}

function WebAppCard({ devActive, onStartDev, onStopDev, onOpenLogs, onOpenInBrowser }) {
  const statusLabel = devActive ? 'Running' : 'Stopped';
  const badgeVariant = devActive ? 'badge--success' : 'badge--muted';

  return (
    <div
      className={`card service-card ${devActive ? 'service-card--running' : ''}`}
      data-state={devActive ? 'running' : 'stopped'}
    >
      <div className="card__header">
        <div className="card__icon-wrap" style={{ color: 'var(--color-primary)' }}>
          <Globe size={20} aria-label="Web app" />
        </div>
        <div className={`badge ${badgeVariant}`}>
          <span className="badge__dot" />
          <span>{statusLabel}</span>
        </div>
      </div>

      <div className="card__main" style={{ marginBottom: 'var(--space-4)' }}>
        <h3 className="card__title">WabiSaby Web App</h3>
        <p className="card__meta">wabisaby-web · Vite dev server</p>
      </div>

      <div className="card__footer">
        <div className="card__actions">
          {devActive ? (
            <>
              <button
                type="button"
                onClick={onStopDev}
                className="btn btn--danger btn--sm btn--state"
              >
                <Square size={12} /> Stop
              </button>
              <button type="button" onClick={onOpenLogs} className="btn btn--ghost btn--sm">
                <List size={12} /> Logs
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onStartDev}
              className="btn btn--success btn--sm btn--state"
            >
              <Play size={12} /> Start dev server
            </button>
          )}
        </div>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          title={`Open ${DEV_SERVER_URL} in browser`}
          onClick={onOpenInBrowser}
        >
          <ExternalLink size={12} />
        </button>
      </div>
    </div>
  );
}
