import React, { useMemo } from 'react';
import {
  Layout,
  Boxes,
  Activity,
  Settings,
  Server,
  Network,
  Plug,
  Github,
  ChevronRight,
} from 'lucide-react';
import { usePermissions } from '../context/PermissionsContext';

const QUICK_LINKS = [
  { id: 'projects', label: 'Projects', description: 'Manage and run projects', icon: Layout },
  { id: 'infrastructure', label: 'Infrastructure', description: 'Services and Docker', icon: Boxes },
  { id: 'backend', label: 'Backend', description: 'Backend services', icon: Server },
  { id: 'mesh', label: 'WabiSaby Mesh', description: 'Mesh services', icon: Network },
  { id: 'plugins', label: 'Plugin Infrastructure', description: 'Plugins and extensions', icon: Plug },
  { id: 'activity', label: 'Activity', description: 'Recent activity and logs', icon: Activity },
  { id: 'settings', label: 'Settings', description: 'Prerequisites and environment', icon: Settings },
];

export function LandingView({ onNavigate }) {
  const { permissions, canAccessView, loading } = usePermissions();
  const isConnected = permissions?.connected;

  const visibleLinks = useMemo(
    () => QUICK_LINKS.filter((item) => canAccessView(item.id)),
    [canAccessView],
  );

  return (
    <div className="view">
      <div className="view__header">
        <div className="view__title-group">
          <h1 className="view__title">DevKit</h1>
          <p className="view__subtitle">
            {isConnected
              ? `Welcome back, ${permissions.username}. Pick a section below or use the sidebar.`
              : 'WabiSaby development toolkit. Connect to GitHub to get started.'}
          </p>
        </div>
      </div>
      <div className="view__body">
        {!loading && !isConnected && (
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <div className="card__body" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <Github size={32} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <h3 style={{ margin: 0, fontSize: '1rem' }}>Connect to GitHub</h3>
                <p className="text-sub" style={{ margin: '0.25rem 0 0' }}>
                  Sign in with your GitHub account to unlock team-based features and access your projects.
                </p>
              </div>
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => onNavigate?.('settings')}
              >
                <Settings size={14} />
                Go to Settings
              </button>
            </div>
          </div>
        )}

        <div className="landing-grid">
          {visibleLinks.map((item) => {
            const IconC = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                className="landing-card"
                onClick={() => onNavigate?.(item.id)}
              >
                <div className="landing-card__icon">
                  <IconC size={24} />
                </div>
                <div className="landing-card__text">
                  <span className="landing-card__title">{item.label}</span>
                  <span className="landing-card__description">{item.description}</span>
                </div>
                <ChevronRight size={18} className="landing-card__chevron" />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
