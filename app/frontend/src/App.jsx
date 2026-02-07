import { useState, useEffect, useCallback, useMemo } from 'react';
import { Layout, Boxes, Activity, Settings, PanelLeftClose, PanelLeft, Server, Github, Network, Plug } from 'lucide-react';
import { WindowIsFullscreen } from '../wailsjs/runtime/runtime';
import { ProjectsView } from './views/ProjectsView';
import { InfrastructureView } from './views/InfrastructureView';
import { BackendServicesView } from './views/BackendServicesView';
import { MeshServicesView } from './views/MeshServicesView';
import { PluginInfrastructureView } from './views/PluginInfrastructureView';
import { ActivityView } from './views/ActivityView';
import { SettingsView } from './views/SettingsView';
import { LandingView } from './views/LandingView';
import { TopBar } from './components/TopBar';
import { CommandPalette } from './components/CommandPalette';
import { useToast } from './hooks/useToast';
import * as api from './lib/wails';
import { events } from './lib/wails';

function App() {
  const [activeView, setActiveView] = useState('home');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [breadcrumbSub, setBreadcrumbSub] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    if (typeof window.runtime?.WindowIsFullscreen !== 'function') return;
    const check = () => WindowIsFullscreen().then(setIsFullscreen).catch(() => setIsFullscreen(false));
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const handleNavigate = useCallback((view) => {
    setActiveView(view);
    setBreadcrumbSub(null);
  }, []);

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => !prev);
  }, []);

  const toast = useToast();

  // Command palette context – passed to every command action
  const paletteCtx = useMemo(() => ({
    navigate: handleNavigate,
    toggleSidebar,
    api,
    toast,
  }), [handleNavigate, toggleSidebar, toast]);

  // Cmd+B is handled by the native app menu (View > Toggle Sidebar); listen for the event from Go
  useEffect(() => {
    events.on('devkit:toggle-sidebar', () => setSidebarOpen((prev) => !prev));
    return () => events.off('devkit:toggle-sidebar');
  }, []);

  // Global shortcut: Cmd+K / Ctrl+K for command palette
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key?.toLowerCase() === 'k') {
        e.preventDefault();
        e.stopPropagation();
        setPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, []);

  const renderView = () => {
    switch (activeView) {
      case 'home':
        return <LandingView onNavigate={handleNavigate} />;
      case 'projects':
        return <ProjectsView />;
      case 'infrastructure':
        return <InfrastructureView />;
      case 'backend':
        return <BackendServicesView />;
      case 'mesh':
        return <MeshServicesView />;
      case 'plugins':
        return <PluginInfrastructureView />;
      case 'settings':
        return <SettingsView onBreadcrumbChange={setBreadcrumbSub} />;
      default:
        return <LandingView onNavigate={handleNavigate} />;
    }
  };

  return (
    <div className={`app ${sidebarOpen ? '' : 'app--sidebar-collapsed'} ${isFullscreen ? 'app--fullscreen' : ''}`}>
      <header className="app__titlebar" />
      <div className="app__body">
        <div className="app__body-row">
          <aside className="app__sidebar">
            <div className="app__sidebar-header">
              <button
                type="button"
                className="app__sidebar-brand"
                onClick={() => handleNavigate('home')}
                title="Go to Home"
              >
                <Layout size={24} style={{ color: 'var(--color-primary)' }} />
                <span className="app__sidebar-title">DevKit</span>
              </button>
              <button
                type="button"
                className="btn btn--ghost btn--icon"
                onClick={() => setSidebarOpen((prev) => !prev)}
                title={sidebarOpen ? "Collapse Sidebar (⌘B)" : "Expand Sidebar (⌘B)"}
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
                label="Backend"
                active={activeView === 'backend'}
                onClick={() => setActiveView('backend')}
              />
              <NavItem
                icon={<Network size={20} />}
                label="WabiSaby Mesh"
                active={activeView === 'mesh'}
                onClick={() => setActiveView('mesh')}
              />
              <NavItem
                icon={<Plug size={20} />}
                label="Plugin Infrastructure"
                active={activeView === 'plugins'}
                onClick={() => setActiveView('plugins')}
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
            <TopBar
              currentView={activeView}
              breadcrumbSub={breadcrumbSub}
              onNavigate={handleNavigate}
              onOpenPalette={() => setPaletteOpen(true)}
            />
            <div className="app__content">
              {activeView !== 'activity' && renderView()}
              <div style={{ display: activeView === 'activity' ? 'block' : 'none', height: '100%' }}>
                <ActivityView />
              </div>
            </div>
          </main>
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
      </div>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        ctx={paletteCtx}
      />
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
