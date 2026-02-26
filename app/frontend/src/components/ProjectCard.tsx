import React from 'react';
import { Hammer, FlaskConical, Terminal, ExternalLink, Box, Tag, GitGraph, Github } from 'lucide-react';
import { BrowserOpenURL } from '../../wailsjs/runtime/runtime';

// GitHub Linguist-style colors per language (glassy, discrete tint)
const LANGUAGE_COLORS = {
    Go: '#00ADD8',
    TypeScript: '#3178C6',
    JavaScript: '#F7DF1E',
    Rust: '#DEA584',
    Python: '#3572A5',
    'Protocol Buffers': '#8B5CF6',
};

export function ProjectCard({ project, onAction }) {
    const statusLabel = project.status === 'clean' ? 'Clean' : project.status === 'dirty' ? 'Dirty' : 'Not cloned';
    const badgeMod = project.status === 'clean' ? 'badge--success' : project.status === 'dirty' ? 'badge--warning' : 'badge--muted';
    const langColor = project.language ? LANGUAGE_COLORS[project.language] ?? '#94a3b8' : null;

    return (
        <div className="card project-card">
            <div className="card__main">
                <div className="card__header">
                    <div className="card__icon-wrap" style={{ color: 'var(--color-primary)' }}>
                        <Box size={20} />
                    </div>
                    <div className={`badge ${badgeMod}`}>
                        <span className="badge__dot" />
                        <span>{statusLabel}</span>
                    </div>
                </div>
                <div className="project-card__title-row">
                    <h3 className="card__title">{project.name}</h3>
                    {project.language && (
                        <span
                            className="project-card__language"
                            title="Primary language"
                            style={{ ['--lang-color']: langColor } as React.CSSProperties}
                        >
                            <span className="project-card__language-dot" />
                            {project.language}
                        </span>
                    )}
                </div>
                <div className="project-card__meta">
                    <span className="card__meta">{project.branch || project.name}</span>
                </div>
            </div>
            <div className="card__footer">
                <div className="card__actions">
                    <ActionButton icon={<Hammer size={14} />} label="Build" onClick={() => onAction('build', project)} />
                    <ActionButton icon={<FlaskConical size={14} />} label="Test" onClick={() => onAction('test', project)} />
                    <ActionButton icon={<Terminal size={14} />} label="Logs" onClick={() => onAction('logs', project)} />
                </div>
                <div className="card__actions">
                    {project.repoUrl && (
                        <button
                            type="button"
                            className="btn btn--ghost btn--sm"
                            title="View on GitHub"
                            onClick={() => {
                                if (window.runtime?.BrowserOpenURL) {
                                    BrowserOpenURL(project.repoUrl);
                                } else {
                                    window.open(project.repoUrl, '_blank', 'noopener,noreferrer');
                                }
                            }}
                        >
                            <Github size={16} />
                        </button>
                    )}
                    <button type="button" onClick={() => onAction('graph', project)} className="btn btn--ghost btn--sm" title="Dependency Graph">
                        <GitGraph size={16} />
                    </button>
                    <button type="button" onClick={() => onAction('tags', project)} className="btn btn--ghost btn--sm" title="Tags">
                        <Tag size={16} />
                    </button>
                    <button type="button" onClick={() => onAction('open', project)} className="btn btn--ghost btn--sm" title="Open in Editor">
                        <ExternalLink size={16} />
                    </button>
                </div>
            </div>
        </div>
    );
}

function ActionButton({ icon, label, onClick }) {
    return (
        <button type="button" onClick={onClick} className="btn btn--ghost btn--sm">
            {icon}
            <span>{label}</span>
        </button>
    );
}
