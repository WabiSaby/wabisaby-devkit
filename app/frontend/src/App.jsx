import { useState } from 'react';
import { Layout, Boxes, Terminal, Activity, Settings, PanelLeftClose, PanelLeft, Server, Github } from 'lucide-react';
import { ProjectsView } from './views/ProjectsView';
import { InfrastructureView } from './views/InfrastructureView';
import { ServicesView } from './views/ServicesView';
import { ActivityView } from './views/ActivityView';
import { SettingsView } from './views/SettingsView';

function App() {
  const [activeView, setActiveView] = useState('projects');
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const renderView = () => {
    switch (activeView) {
      case 'projects':
        return <ProjectsView />;
      case 'infrastructure':
        return <InfrastructureView />;
      case 'services':
        return <ServicesView />;
      case 'activity':
        return <ActivityView />;
      case 'settings':
        return <SettingsView />;
      default:
        return <ProjectsView />;
    }
  };

  return (
    <div className={`app ${sidebarOpen ? '' : 'app--sidebar-collapsed'}`}>
      <header className="app__titlebar" />
      <div className="app__body">
        <aside className="app__sidebar">
          <div className="app__sidebar-header">
            <div className="app__sidebar-brand">
              <Layout size={24} style={{ color: 'var(--color-primary)' }} />
              <span className="app__sidebar-title">DevKit</span>
            </div>
            <button
              type="button"
              className="btn btn--ghost btn--icon"
              onClick={() => setSidebarOpen((prev) => !prev)}
              title={sidebarOpen ? "Collapse Sidebar" : "Expand Sidebar"}
            >
              {sidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeft size={18} />}
            </button>
          </div>
          <nav className="app__sidebar-nav">
            <NavItem
              icon={<Layout size={20} />}
              label="Projects"
              active={activeView === 'projects'}
              onClick={() => setActiveView('projects')}
            />
            <NavItem
              icon={<Boxes size={20} />}
              label="Infrastructure"
              active={activeView === 'infrastructure'}
              onClick={() => setActiveView('infrastructure')}
            />
            <NavItem
              icon={<Server size={20} />}
              label="Services"
              active={activeView === 'services'}
              onClick={() => setActiveView('services')}
            />
            <NavItem
              icon={<Activity size={20} />}
              label="Activity"
              active={activeView === 'activity'}
              onClick={() => setActiveView('activity')}
            />
          </nav>
          <div className="app__sidebar-footer">
            <NavItem
              icon={<Settings size={20} />}
              label="Settings"
              active={activeView === 'settings'}
              onClick={() => setActiveView('settings')}
            />
          </div>
        </aside>

        <main className="app__main">
          <div className="app__content">
            {renderView()}
          </div>
          <footer className="app__statusbar">
            <div className="app__statusbar-left">
              <div className="status-item">
                <div className="status-indicator status-indicator--ready" />
                <span>Ready</span>
              </div>
              <div className="status-item">v0.1.0</div>
            </div>
            <div className="app__statusbar-right">
              <a
                href="https://github.com/WabiSaby"
                target="_blank"
                rel="noopener noreferrer"
                className="status-item status-link"
                title="WabiSaby GitHub"
              >
                <Github size={12} />
                <span>GitHub</span>
              </a>
            </div>
          </footer>
        </main>
      </div>
    </div>
  );
}

function NavItem({ icon, label, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`nav-item ${active ? 'nav-item--active' : ''}`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

export default App;
