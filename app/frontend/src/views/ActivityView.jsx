import React, { useEffect, useState, useRef } from 'react';
import { events } from '../lib/wails';
import { Trash2 } from 'lucide-react';

const STREAM_EVENTS = [
  'devkit:project:stream',
  'devkit:project:stream:done',
  'devkit:project:bulk:stream',
  'devkit:project:bulk:stream:done',
  'devkit:service:logs',
  'devkit:service:logs:done',
  'devkit:backend:logs',
  'devkit:backend:logs:done',
  'devkit:migration:stream',
  'devkit:migration:stream:done',
  'devkit:proto:stream',
  'devkit:proto:stream:done',
];

export function ActivityView() {
  const [entries, setEntries] = useState([]);
  const bottomRef = useRef(null);

  useEffect(() => {
    const handlers = {};
    STREAM_EVENTS.forEach((eventName) => {
      handlers[eventName] = (payload) => {
        const label = eventName.replace('devkit:', '').replace(/:stream:?/, ' ');
        const line = payload?.line != null ? payload.line : JSON.stringify(payload ?? {});
        const source = payload?.project ?? payload?.name ?? payload?.action ?? label;
        setEntries((prev) => [...prev.slice(-999), { ts: Date.now(), source, line, event: eventName }]);
      };
      events.on(eventName, handlers[eventName]);
    });
    return () => {
      STREAM_EVENTS.forEach((eventName) => events.off(eventName, handlers[eventName]));
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [entries]);

  const clear = () => setEntries([]);

  return (
    <div className="view">
      <div className="view__header">
        <div className="view__title-group">
          <h2 className="view__title">Activity</h2>
          <p className="view__subtitle">Live log streams from projects, services, and core.</p>
        </div>
        <button type="button" onClick={clear} className="btn btn--secondary">
          <Trash2 size={14} />
          Clear
        </button>
      </div>
      <div className="view__body">
        <div className="activity-log">
          {entries.length === 0 && (
            <p style={{ color: 'var(--text-muted)' }}>
              No activity yet. Run a project build/test, service logs, or migration/proto to see output here.
            </p>
          )}
          {entries.map((e, i) => (
            <div key={i} className="activity-log__entry">
              <span className="activity-log__source" title={e.event}>
                [{e.source}]
              </span>
              <span className="activity-log__line">{e.line}</span>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
}
