import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Bell, CheckCircle, XCircle, AlertCircle, ChevronRight, Settings, Boxes, Server, RefreshCw, Search, Command } from 'lucide-react';
import { notices, submodule, generate } from '../lib/wails';

const VIEW_LABELS = {
  home: 'Home',
  projects: 'Projects',
  infrastructure: 'Infrastructure',
  backend: 'Backend',
  mesh: 'WabiSaby Mesh',
  plugins: 'Plugin Infrastructure',
  activity: 'Activity',
  settings: 'Settings',
};

const ACTION_CONFIG = {
  settings: { label: 'Open Settings', icon: Settings, view: 'settings' },
  infrastructure: { label: 'View Infrastructure', icon: Boxes, view: 'infrastructure' },
  backend: { label: 'View Backend', icon: Server, view: 'backend' },
  env: { label: 'Check Environment', icon: Settings, view: 'settings' },
  submodule_sync: { label: 'Sync Submodules', icon: RefreshCw, action: 'syncSubmodules' },
  generate: { label: 'Run Generate', icon: RefreshCw, action: 'generate' },
};

export function TopBar({ currentView, breadcrumbSub, onNavigate, onOpenPalette }) {
  const [noticesList, setNoticesList] = useState([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [dropdownVisible, setDropdownVisible] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);
  const dropdownRef = useRef(null);

  const openDropdown = () => {
    setDropdownVisible(true);
    setDropdownOpen(true);
  };

  const closeDropdown = () => {
    setDropdownOpen(false);
    setTimeout(() => setDropdownVisible(false), 200);
  };

  const fetchNotices = useCallback(async () => {
    if (!window.go) return;
    try {
      const n = await notices.list();
      setNoticesList(Array.isArray(n) ? n : []);
    } catch {
      setNoticesList([]);
    }
  }, []);

  useEffect(() => {
    fetchNotices();
    const interval = setInterval(fetchNotices, 30000);
    return () => clearInterval(interval);
  }, [fetchNotices]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        closeDropdown();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleAction = async (notice) => {
    const config = ACTION_CONFIG[notice.actionKey];
    if (!config) return;

    if (config.view && onNavigate) {
      onNavigate(config.view);
      closeDropdown();
    } else if (config.action === 'syncSubmodules') {
      setActionLoading(notice.id ?? notice.actionKey);
      try {
        await submodule.sync('Sync submodules');
        fetchNotices();
      } finally {
        setActionLoading(null);
      }
    } else if (config.action === 'generate') {
      setActionLoading(notice.id ?? notice.actionKey);
      try {
        await generate.run();
        fetchNotices();
      } finally {
        setActionLoading(null);
      }
    }
  };

  const hasNotices = noticesList.length > 0;
  const hasErrors = noticesList.some(n => n.severity === 'error');

  const getSeverityLabel = (severity) => {
    switch (severity) {
      case 'error': return 'Error';
      case 'warn': return 'Warning';
      default: return 'Info';
    }
  };

  const viewLabel = VIEW_LABELS[currentView] ?? currentView;
  const segments = [
    { id: 'root', label: 'DevKit', view: 'home' },
    { id: 'view', label: viewLabel, view: currentView },
    ...(breadcrumbSub ? [{ id: 'sub', label: breadcrumbSub, view: null }] : []),
  ];

  return (
    <div className="topbar">
      <nav className="topbar__left" aria-label="Breadcrumb">
        <ol className="topbar__breadcrumb">
          {segments.map((seg, i) => {
            const isLast = i === segments.length - 1;
            return (
              <li key={seg.id} className="topbar__breadcrumb-item">
                {i > 0 && (
                  <span className="topbar__breadcrumb-sep" aria-hidden>
                    <ChevronRight size={14} />
                  </span>
                )}
                {isLast ? (
                  <span className="topbar__breadcrumb-current">{seg.label}</span>
                ) : seg.view && onNavigate ? (
                  <button
                    type="button"
                    className="topbar__breadcrumb-link"
                    onClick={() => onNavigate(seg.view)}
                  >
                    {seg.label}
                  </button>
                ) : (
                  <span className="topbar__breadcrumb-current">{seg.label}</span>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
      <div className="topbar__right">
        <button
          type="button"
          className="topbar__command-btn"
          onClick={onOpenPalette}
          title="Command Palette (⌘K)"
        >
          <Search size={14} />
          <span>Commands</span>
          <kbd className="topbar__command-kbd">
            <Command size={10} />K
          </kbd>
        </button>
        <div className="topbar__notifications" ref={dropdownRef}>
          <button
            type="button"
            className={`topbar__notifications-btn ${hasNotices ? 'topbar__notifications-btn--active' : ''}`}
            onClick={() => dropdownOpen ? closeDropdown() : openDropdown()}
            title="Notifications"
          >
            <Bell size={18} />
            {hasNotices && (
              <span className={`topbar__notifications-badge ${hasErrors ? 'topbar__notifications-badge--error' : ''}`}>
                {noticesList.length}
              </span>
            )}
          </button>

          {dropdownVisible && (
            <div className={`topbar__dropdown ${dropdownOpen ? 'topbar__dropdown--open' : 'topbar__dropdown--closing'}`}>
              <div className="topbar__dropdown-header">
                <span className="topbar__dropdown-title">Notifications</span>
                {hasNotices && (
                  <span className="badge badge--neutral">{noticesList.length}</span>
                )}
              </div>
              <div className="topbar__dropdown-body">
                {noticesList.length === 0 ? (
                  <div className="topbar__dropdown-empty">
                    <CheckCircle size={32} style={{ color: 'var(--color-success)', opacity: 0.5 }} />
                    <p>No notifications</p>
                  </div>
                ) : (
                  <ul className="topbar__dropdown-list">
                    {noticesList.map((n, i) => {
                      const config = ACTION_CONFIG[n.actionKey];
                      const ActionIcon = config?.icon;
                      const isLoading = actionLoading === (n.id ?? n.actionKey);

                      return (
                        <li
                          key={n.id ?? i}
                          className={`notification-card ${
                            n.severity === 'error' ? 'notification-card--error' :
                            n.severity === 'warn' ? 'notification-card--warning' : ''
                          }`}
                        >
                          <div className="notification-card__header">
                            <div className="notification-card__severity">
                              {n.severity === 'error' && <XCircle size={14} />}
                              {n.severity === 'warn' && <AlertCircle size={14} />}
                              <span>{getSeverityLabel(n.severity)}</span>
                            </div>
                          </div>
                          <p className="notification-card__message">{n.message}</p>
                          {config && (
                            <button
                              type="button"
                              className="notification-card__action"
                              onClick={() => handleAction(n)}
                              disabled={isLoading}
                            >
                              {isLoading ? (
                                <RefreshCw size={14} className="icon-spin" />
                              ) : (
                                ActionIcon && <ActionIcon size={14} />
                              )}
                              <span>{config.label}</span>
                              <ChevronRight size={14} />
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
