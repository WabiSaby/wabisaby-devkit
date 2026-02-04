import React from 'react';
import {
  Layout,
  Boxes,
  Activity,
  Settings,
  Server,
  Network,
  Plug,
  ChevronRight,
} from 'lucide-react';

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
  return (
    <div className="view">
      <div className="view__header">
        <div className="view__title-group">
          <h1 className="view__title">DevKit</h1>
          <p className="view__subtitle">
            WabiSaby development toolkit. Pick a section below or use the sidebar to get started.
          </p>
        </div>
      </div>
      <div className="view__body">
        <div className="landing-grid">
          {QUICK_LINKS.map((item) => {
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
