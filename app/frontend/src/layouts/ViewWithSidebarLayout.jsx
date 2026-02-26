import React from 'react';

/**
 * Layout for views with a left sidebar (e.g. Settings): sidebar nav + content area with its own header/body.
 * Uses BEM: view view--has-sidebar, view__sidebar, view__content-area, etc.
 *
 * @param {string} sidebarTitle - Title shown in the sidebar
 * @param {Array<{ id: string, label: string, icon: React.ReactNode, count?: number }>} sidebarNav - Tab/nav items
 * @param {string} activeNavId - Currently active nav item id
 * @param {(id: string) => void} onNavSelect - Called when a nav item is selected
 * @param {React.ReactNode} sidebarFooter - Content in the sidebar footer (e.g. Refresh button)
 * @param {string|React.ReactNode} contentTitle - Title in the content area header
 * @param {string|React.ReactNode} [contentSubtitle] - Subtitle in the content area header
 * @param {React.ReactNode} children - Main content (rendered in view__body inside content area)
 * @param {string} [contentKey] - Optional key for the content-area div (e.g. activeTab for remount on tab change)
 * @param {string} [viewClassName] - Modifier class on view root (e.g. 'view--settings' for animations)
 */
export function ViewWithSidebarLayout({
  sidebarTitle,
  sidebarNav,
  activeNavId,
  onNavSelect,
  sidebarFooter,
  contentTitle,
  contentSubtitle,
  children,
  contentKey,
  viewClassName = '',
}) {
  const viewClass = ['view', 'view--has-sidebar', viewClassName].filter(Boolean).join(' ');

  return (
    <div className={viewClass}>
      <div className="view__sidebar">
        <h2 className="view__sidebar-title">{sidebarTitle}</h2>
        <nav className="view__sidebar-nav">
          {sidebarNav.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavSelect(item.id)}
              className={`nav-item ${activeNavId === item.id ? 'nav-item--active' : ''}`}
            >
              {item.icon}
              <span>{item.label}</span>
              {item.count > 0 && <span className="badge badge--warning ml-auto">{item.count}</span>}
            </button>
          ))}
        </nav>
        <div className="view__sidebar-footer">{sidebarFooter}</div>
      </div>

      <div className="view__content-area" key={contentKey}>
        <div className="view__header">
          <div className="view__title-group">
            <h2 className="view__title">{contentTitle}</h2>
            {contentSubtitle != null && <p className="view__subtitle">{contentSubtitle}</p>}
          </div>
        </div>
        <div className="view__body">{children}</div>
      </div>
    </div>
  );
}
