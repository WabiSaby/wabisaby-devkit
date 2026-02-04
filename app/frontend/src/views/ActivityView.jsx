import React, { useEffect, useState, useRef, useMemo } from 'react';
import { events } from '../lib/wails';
import { Trash2, Activity } from 'lucide-react';
import { EmptyState } from '../components/EmptyState';

const STREAM_EVENTS = [
  'devkit:project:stream',
  'devkit:project:stream:done',
  'devkit:project:bulk:stream',
  'devkit:project:bulk:stream:done',
  'devkit:service:logs',
  'devkit:service:logs:done',
  'devkit:backend:logs',
  'devkit:backend:logs:done',
  'devkit:backend:started',
  'devkit:backend:exited',
  'devkit:migration:stream',
  'devkit:migration:stream:done',
  'devkit:proto:stream',
  'devkit:proto:stream:done',
];

export function ActivityView() {
  const [entries, setEntries] = useState([]);
  const topRef = useRef(null);
  const [levelFilter, setLevelFilter] = useState('all');
  const [serviceFilter, setServiceFilter] = useState('all');
  const [textFilter, setTextFilter] = useState('');
  const [showRaw, setShowRaw] = useState(false);

  const parseLogLine = (line) => {
    if (typeof line !== 'string') return { raw: String(line ?? '') };
    if (!line.startsWith('time=')) return { raw: line };

    const fields = {};
    const re = /(\w+)=("(?:[^"\\]|\\.)*"|\S+)/g;
    let match;
    while ((match = re.exec(line)) !== null) {
      const key = match[1];
      let value = match[2];
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1).replace(/\\"/g, '"');
      }
      fields[key] = value;
    }

    return {
      raw: line,
      time: fields.time,
      level: fields.level?.toUpperCase(),
      msg: fields.msg,
      component: fields.component,
      source: fields.source,
      rest: fields,
    };
  };

  const serviceOptions = useMemo(() => {
    const unique = new Set(entries.map((e) => e.source).filter(Boolean));
    return ['all', ...Array.from(unique)];
  }, [entries]);

  const filteredEntries = useMemo(() => {
    const query = textFilter.trim().toLowerCase();
    return entries.filter((e) => {
      if (serviceFilter !== 'all' && e.source !== serviceFilter) return false;
      const parsed = parseLogLine(e.line);
      if (levelFilter !== 'all' && parsed.level !== levelFilter) return false;
      if (!query) return true;
      const haystack = [
        e.source,
        parsed.msg,
        parsed.component,
        parsed.source,
        parsed.raw,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [entries, levelFilter, serviceFilter, textFilter]);

  useEffect(() => {
    const handlers = {};
    STREAM_EVENTS.forEach((eventName) => {
      handlers[eventName] = (payload) => {
        const label = eventName.replace('devkit:', '').replace(/:stream:?/, ' ');
        const source = payload?.project ?? payload?.name ?? payload?.action ?? label;

        if (eventName === 'devkit:backend:started') {
          setEntries((prev) => [...prev.slice(-999), { ts: Date.now(), source: payload?.name ?? 'backend', line: 'Started', event: eventName }]);
          return;
        }
        if (eventName === 'devkit:backend:exited') {
          const name = payload?.name ?? 'backend';
          const err = payload?.error;
          const lastOutput = Array.isArray(payload?.lastOutput) ? payload.lastOutput : [];
          setEntries((prev) => {
            const next = [...prev.slice(-999)];
            next.push({ ts: Date.now(), source: name, line: err ? `Exited with error: ${err}` : 'Stopped', event: eventName });
            lastOutput.slice(-12).forEach((ln) => {
              next.push({ ts: Date.now(), source: name, line: ln, event: eventName });
            });
            return next;
          });
          return;
        }

        const line = payload?.line != null ? payload.line : JSON.stringify(payload ?? {});
        setEntries((prev) => [...prev.slice(-999), { ts: Date.now(), source, line, event: eventName }]);
      };
      events.on(eventName, handlers[eventName]);
    });
    return () => {
      STREAM_EVENTS.forEach((eventName) => events.off(eventName, handlers[eventName]));
    };
  }, []);

  useEffect(() => {
    topRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [entries]);

  const clear = () => setEntries([]);

  return (
    <div className="view">
      <div className="view__header">
        <div className="view__title-group">
          <h2 className="view__title">Activity</h2>
          <p className="view__subtitle">Live log streams from projects, services, and core.</p>
        </div>
        <div className="view__actions">
          <button type="button" onClick={clear} className="btn btn--secondary">
            <Trash2 size={14} />
            Clear
          </button>
        </div>
      </div>
      <div className="view__body">
        <div className="activity-toolbar">
          <input
            className="input activity-toolbar__input"
            placeholder="Filter logs..."
            value={textFilter}
            onChange={(e) => setTextFilter(e.target.value)}
          />
          <select
            className="input activity-toolbar__select"
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value)}
          >
            <option value="all">All Levels</option>
            <option value="DEBUG">DEBUG</option>
            <option value="INFO">INFO</option>
            <option value="WARN">WARN</option>
            <option value="ERROR">ERROR</option>
            <option value="FATAL">FATAL</option>
          </select>
          <select
            className="input activity-toolbar__select"
            value={serviceFilter}
            onChange={(e) => setServiceFilter(e.target.value)}
          >
            {serviceOptions.map((svc) => (
              <option key={svc} value={svc}>
                {svc === 'all' ? 'All Services' : svc}
              </option>
            ))}
          </select>
          <label className="toggle activity-toolbar__checkbox">
            <input
              type="checkbox"
              checked={showRaw}
              onChange={(e) => setShowRaw(e.target.checked)}
            />
            <span className="toggle__track" />
            <span className="toggle__label">Raw</span>
          </label>
        </div>
        <div className="activity-log">
          <div ref={topRef} />
          {filteredEntries.length === 0 && (
            <EmptyState
              icon={<Activity size={44} />}
              title="No activity yet"
              subtitle="Run a project build/test, service logs, or migration/proto to see output here."
            />
          )}
          {[...filteredEntries].reverse().map((e, i) => {
            const parsed = parseLogLine(e.line);
            const time =
              parsed.time && !Number.isNaN(Date.parse(parsed.time))
                ? new Date(parsed.time).toLocaleTimeString()
                : '';
            return (
              <div key={i} className="activity-log__entry">
                <span className="activity-log__source" title={e.event}>
                  [{e.source}]
                </span>
                <span className="activity-log__time">{time}</span>
                {parsed.level && (
                  <span className={`activity-log__level activity-log__level--${parsed.level.toLowerCase()}`}>
                    {parsed.level}
                  </span>
                )}
                <div className="activity-log__content">
                  <span className="activity-log__message">
                    {showRaw || !parsed.msg ? parsed.raw : parsed.msg}
                  </span>
                  {!showRaw && (parsed.component || parsed.source) && (
                    <span className="activity-log__meta">
                      {parsed.component && (
                        <span className="activity-log__chip" title={parsed.component}>
                          {parsed.component}
                        </span>
                      )}
                      {parsed.source && (
                        <span className="activity-log__chip activity-log__chip--path" title={parsed.source}>
                          {parsed.source}
                        </span>
                      )}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
