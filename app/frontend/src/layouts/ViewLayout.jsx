import React from 'react';

/**
 * Standard page layout: optional banner, header (title + subtitle + actions), and body.
 * Uses the same BEM classes as views (view, view__header, view__body) so existing CSS applies.
 *
 * @param {string|React.ReactNode} title - Page title
 * @param {string|React.ReactNode} [subtitle] - Optional subtitle below title
 * @param {'h1'|'h2'} [titleLevel='h2'] - Heading level for accessibility
 * @param {React.ReactNode} [actions] - Optional actions (e.g. Refresh button) in the header
 * @param {React.ReactNode} [banner] - Optional banner rendered above the header (e.g. submodule warning)
 * @param {boolean} [loading] - When true and loadingContent is set, render loadingContent instead of body
 * @param {React.ReactNode} [loadingContent] - Shown when loading is true (e.g. view__loading)
 * @param {React.ReactNode} children - Main content (rendered in view__body when not loading)
 * @param {string} [className] - Extra class(es) for the view root
 */
export function ViewLayout({
  title,
  subtitle,
  titleLevel = 'h2',
  actions,
  banner,
  loading,
  loadingContent,
  children,
  className = '',
}) {
  const TitleTag = titleLevel;
  const viewClass = ['view', className].filter(Boolean).join(' ');
  const showLoading = loading && loadingContent != null;

  return (
    <div className={viewClass}>
      {banner}
      <div className="view__header">
        <div className="view__title-group">
          <TitleTag className="view__title">{title}</TitleTag>
          {subtitle != null && <p className="view__subtitle">{subtitle}</p>}
        </div>
        {actions != null && <div className="view__actions">{actions}</div>}
      </div>
      {showLoading ? loadingContent : <div className="view__body">{children}</div>}
    </div>
  );
}
