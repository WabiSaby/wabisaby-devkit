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
import { GitHubAuthModal } from './components/GitHubAuthModal';
import { useToast } from './hooks/useToast';
import { PermissionsProvider, usePermissions } from './context/PermissionsContext';
import * as api from './lib/wails';
import { events } from './lib/wails';

// Data-driven navigation items. Each entry maps to a sidebar link and a view.
const NAV_ITEMS = [
  { viewId: 'projects',        label: 'Projects',              icon: Layout },
  { viewId: 'infrastructure',  label: 'Infrastructure',        icon: Boxes },
  { viewId: 'backend',         label: 'Backend',               icon: Server },
  { viewId: 'mesh',            label: 'WabiSaby Mesh',         icon: Network },
  { viewId: 'plugins',         label: 'Plugin Infrastructure', icon: Plug },
  { viewId: 'activity',        label: 'Activity',              icon: Activity },
];

function AppInner() {
  const [activeView, setActiveView] = useState('home');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [breadcrumbSub, setBreadcrumbSub] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const { canAccessView, permissions, loading } = usePermissions();
  const isAuthenticated = permissions?.connected;

  useEffect(() => {
    if (typeof window.runtime?.WindowIsFullscreen !== 'function') return;
    const check = () => WindowIsFullscreen().then(setIsFullscreen).catch(() => setIsFullscreen(false));
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const handleNavigate = useCallback((view) => {
    // Guard: redirect to home if user lacks access
    if (!canAccessView(view)) {
      setActiveView('home');
      setBreadcrumbSub(null);
      return;
    }
    setActiveView(view);
    setBreadcrumbSub(null);
  }, [canAccessView]);

  // Derive effective view: if the current view is no longer accessible, fall back to home.
  const effectiveView = useMemo(() => {
    if (activeView !== 'home' && activeView !== 'settings' && !canAccessView(activeView)) {
      return 'home';
    }
    return activeView;
  }, [activeView, canAccessView]);

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => !prev);
  }, []);

  const toast = useToast();

  // Filtered nav items based on permissions
  const visibleNavItems = useMemo(
    () => NAV_ITEMS.filter((item) => canAccessView(item.viewId)),
    [canAccessView],
  );

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
    switch (effectiveView) {
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
    <div className={`app ${sidebarOpen ? '' : 'app--sidebar-collapsed'} ${isFullscreen ? 'app--fullscreen' : ''} ${!isAuthenticated ? 'app--unauthenticated' : ''}`}>
      <header className="app__titlebar" />
      <div className="app__body">
        {/* GitHub Auth Modal - shown only when not authenticated */}
        <GitHubAuthModal isOpen={!loading && !isAuthenticated} />

        {/* Only show main UI when authenticated */}
        {!loading && isAuthenticated && (
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
                {visibleNavItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavItem
                      key={item.viewId}
                      icon={<Icon size={20} />}
                      label={item.label}
                      active={effectiveView === item.viewId}
                      onClick={() => setActiveView(item.viewId)}
                    />
                  );
                })}
              </nav>
              <div className="app__sidebar-footer">
                <NavItem
                  icon={<Settings size={20} />}
                  label="Settings"
                  active={effectiveView === 'settings'}
                  onClick={() => setActiveView('settings')}
                />
              </div>
            </aside>

            <main className="app__main">
              <TopBar
                currentView={effectiveView}
                breadcrumbSub={breadcrumbSub}
                onNavigate={handleNavigate}
                onOpenPalette={() => setPaletteOpen(true)}
              />
              <div className="app__content">
                {effectiveView !== 'activity' && renderView()}
                {canAccessView('activity') && (
                  <div style={{ display: effectiveView === 'activity' ? 'block' : 'none', height: '100%' }}>
                    <ActivityView />
                  </div>
                )}
              </div>
            </main>
          </div>
        )}

        {/* Footer always visible */}
        <footer className="app__statusbar">
          <div className="app__statusbar-left">
            <div className="status-item">
              {permissions?.connected ? (
                <>
                  <div className="status-indicator status-indicator--ready" />
                  <span>{permissions.username}</span>
                </>
              ) : (
                <>
                  <div className="status-indicator status-indicator--error" />
                  <span>Not connected</span>
                </>
              )}
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

      {/* Command palette - only available when authenticated */}
      {isAuthenticated && (
        <CommandPalette
          open={paletteOpen}
          onClose={() => setPaletteOpen(false)}
          ctx={paletteCtx}
        />
      )}
    </div>
  );
}

function App() {
  return (
    <PermissionsProvider>
      <AppInner />
    </PermissionsProvider>
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
