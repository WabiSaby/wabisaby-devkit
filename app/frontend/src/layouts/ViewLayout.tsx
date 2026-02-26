import React from 'react';

export interface ViewLayoutProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  titleLevel?: 'h1' | 'h2';
  actions?: React.ReactNode;
  banner?: React.ReactNode;
  loading?: boolean;
  loadingContent?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

/**
 * Standard page layout: optional banner, header (title + subtitle + actions), and body.
 * Uses the same BEM classes as views (view, view__header, view__body) so existing CSS applies.
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
}: ViewLayoutProps) {
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
