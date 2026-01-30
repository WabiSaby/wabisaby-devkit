// Card component – presentational; buttons use data-action for delegated handling

import { createStatusBadge, createOperationBadge } from './badge.js';
import { createIcon } from '../utils.js';

/**
 * Create project card: primary "Open" + "Actions" dropdown (Update, Test, Build, Create tag, View logs)
 */
export function createProjectCard(project, operationStatus = null) {
    const status = project.status || 'unknown';
    const isCloned = project.branch && project.branch !== '-';
    const opStatus = operationStatus || project.operationStatus || { type: null, running: false };

    const card = document.createElement('div');
    card.className = 'project-card animate-fade-in';
    card.id = `project-card-${project.name}`;

    const header = document.createElement('div');
    header.className = 'card-header';
    header.innerHTML = `<div class="card-title">${project.name}</div>`;
    const statusBadge = createStatusBadge(status);
    statusBadge.id = `status-${project.name}`;
    header.appendChild(statusBadge);

    const info = document.createElement('div');
    info.className = 'card-info card-meta';
    info.innerHTML = `
        <div class="card-meta-row">
            <span class="card-meta-item"><strong>Branch</strong> ${project.branch || '–'}</span>
            <span class="card-meta-item"><strong>Status</strong> ${getStatusText(status)}</span>
        </div>
        <div class="card-meta-row card-meta-commit" title="${(project.commit || '').slice(0, 40)}">
            <span class="card-meta-commit-text">${project.commit ? project.commit.slice(0, 8) + (project.commit.length > 8 ? '…' : '') : '–'}</span>
        </div>
    `;

    if (isCloned) {
        const opRow = document.createElement('div');
        opRow.className = 'card-operation-row';
        const opStatusDiv = document.createElement('div');
        opStatusDiv.className = 'card-info-item operation-status';
        const viewLogsBtn = document.createElement('button');
        viewLogsBtn.type = 'button';
        viewLogsBtn.className = 'btn card-view-logs-btn';
        viewLogsBtn.setAttribute('data-action', 'project:viewLogs');
        viewLogsBtn.setAttribute('data-project', project.name);
        viewLogsBtn.id = `view-logs-${project.name}`;
        viewLogsBtn.setAttribute('aria-label', 'View logs');
        viewLogsBtn.title = 'View logs';
        viewLogsBtn.style.display = 'none';
        viewLogsBtn.appendChild(createIcon('eye', 'icon icon-sm'));
        opRow.appendChild(opStatusDiv);
        opRow.appendChild(viewLogsBtn);
        info.appendChild(opRow);
        if (opStatus.running) {
            opStatusDiv.appendChild(createOperationBadge(opStatus.type));
        }
    } else if (opStatus.running) {
        const opBadge = document.createElement('div');
        opBadge.className = 'card-info-item operation-status';
        opBadge.appendChild(createOperationBadge(opStatus.type));
        info.appendChild(opBadge);
    }

    const actions = document.createElement('div');
    actions.className = 'card-actions';

    if (!isCloned) {
        actions.appendChild(createActionButton('Clone project', 'btn btn-primary btn-block', 'project:clone', { project: project.name }));
    } else {
        actions.className = 'card-actions card-actions-split';
        const primary = document.createElement('div');
        primary.className = 'card-actions-primary';
        const openBtn = createActionButton('Open in editor', 'btn btn-primary', 'project:open', { project: project.name }, opStatus.running);
        openBtn.title = 'Open in Cursor or VS Code';
        openBtn.prepend(createIcon('folder', 'icon icon-sm'));
        primary.appendChild(openBtn);

        const moreWrap = document.createElement('div');
        moreWrap.className = 'card-actions-more';
        const moreBtn = document.createElement('button');
        moreBtn.type = 'button';
        moreBtn.className = 'btn btn-secondary btn-icon-only card-dropdown-trigger';
        moreBtn.setAttribute('data-action', 'dropdown:toggle');
        moreBtn.setAttribute('aria-label', 'More actions');
        moreBtn.setAttribute('aria-haspopup', 'true');
        moreBtn.setAttribute('aria-expanded', 'false');
        moreBtn.innerHTML = '<span aria-hidden="true">⋯</span>';

        const menu = document.createElement('div');
        menu.className = 'card-dropdown-menu';
        menu.setAttribute('role', 'menu');

        const menuItems = [
            { label: 'Update', action: 'project:update', icon: 'refresh', payload: { project: project.name } },
            { label: 'Run tests', action: 'project:test', icon: 'play', payload: { project: project.name } },
            { label: 'Build', action: 'project:build', icon: 'build', payload: { project: project.name } },
            { label: 'Format', action: 'project:format', icon: 'format', payload: { project: project.name } },
            { label: 'Lint', action: 'project:lint', icon: 'lint', payload: { project: project.name } },
            { label: 'Create release tag', action: 'project:createTag', icon: 'tag', payload: { project: project.name, commit: project.commit || '-' } }
        ];

        menuItems.forEach(({ label, action, icon, payload }) => {
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'card-dropdown-item';
            item.setAttribute('role', 'menuitem');
            item.dataset.action = action;
            if (payload.project) item.dataset.project = payload.project;
            if (payload.commit !== undefined) item.dataset.commit = payload.commit;
            item.innerHTML = `<span class="card-dropdown-item-icon" aria-hidden="true">${getIconSvg(icon)}</span><span>${label}</span>`;
            menu.appendChild(item);
        });

        moreWrap.appendChild(moreBtn);
        moreWrap.appendChild(menu);
        primary.appendChild(moreWrap);
        actions.appendChild(primary);
    }

    card.appendChild(header);
    card.appendChild(info);
    card.appendChild(actions);

    return card;
}

function getIconSvg(name) {
    const icons = {
        refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M3 21v-5h5"/>',
        play: '<path d="M8 5v14l11-7z" fill="currentColor"/>',
        build: '<path d="M11.414 10l-7.383 7.418a2.091 2.091 0 0 0 0 2.967 2.11 2.11 0 0 0 2.976 0l7.407-7.385"/><path d="M18.121 15.293l2.586-2.586a1 1 0 0 0 0-1.414l-7.586-7.586a1 1 0 0 0-1.414 0l-2.586 2.586a1 1 0 0 0 0 1.414l7.586 7.586a1 1 0 0 0 1.414 0"/>',
        format: '<path d="M4 6h16"/><path d="M4 12h10"/><path d="M4 18h7"/>',
        lint: '<path d="M9 12l2 2 4-4"/><path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"/>',
        tag: '<path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z"/><path d="M7 7h.01"/>',
        eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>'
    };
    const path = icons[name] || '';
    return `<svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">${path}</svg>`;
}

/**
 * Create service card: primary Start/Stop + compact secondary (Refresh, Logs)
 */
export function createServiceCard(service) {
    const status = service.status || 'unknown';

    const card = document.createElement('div');
    card.className = 'service-card animate-fade-in';

    const header = document.createElement('div');
    header.className = 'card-header';
    header.innerHTML = `<div class="card-title">${service.name}</div>`;
    const statusBadge = createStatusBadge(status);
    statusBadge.id = `service-status-${service.name}`;
    header.appendChild(statusBadge);

    const info = document.createElement('div');
    info.className = 'card-info card-meta';
    info.innerHTML = `
        <div class="card-meta-row">
            <span class="card-meta-item">Port <strong>${service.port}</strong></span>
            <span class="card-meta-item">${getStatusText(status)}</span>
        </div>
    `;

    const actions = document.createElement('div');
    actions.className = 'card-actions card-actions-split';

    const primary = document.createElement('div');
    primary.className = 'card-actions-primary';

    const startBtn = createActionButton('Start', 'btn btn-success', 'service:start', { service: service.name }, status === 'running');
    const stopBtn = createActionButton('Stop', 'btn btn-danger', 'service:stop', { service: service.name }, status === 'stopped');
    primary.appendChild(startBtn);
    primary.appendChild(stopBtn);

    const secondary = document.createElement('div');
    secondary.className = 'card-actions-secondary';
    const refreshBtn = createActionButton('', 'btn btn-secondary btn-icon-only', 'service:check', { service: service.name, port: service.port });
    refreshBtn.setAttribute('aria-label', 'Refresh status');
    refreshBtn.appendChild(createIcon('refresh', 'icon icon-sm'));
    const logsBtn = createActionButton('', 'btn btn-secondary btn-icon-only', 'service:viewLogs', { service: service.name });
    logsBtn.setAttribute('aria-label', 'View logs');
    logsBtn.appendChild(createIcon('eye', 'icon icon-sm'));
    secondary.appendChild(refreshBtn);
    secondary.appendChild(logsBtn);
    if (service.url) {
        const openLink = document.createElement('a');
        openLink.href = service.url;
        openLink.target = '_blank';
        openLink.rel = 'noopener noreferrer';
        openLink.className = 'btn btn-secondary btn-icon-only';
        openLink.setAttribute('aria-label', `Open ${service.name} UI`);
        openLink.title = `Open ${service.name} (${service.url})`;
        openLink.appendChild(createIcon('externalLink', 'icon icon-sm'));
        secondary.appendChild(openLink);
    }

    actions.appendChild(primary);
    actions.appendChild(secondary);

    card.appendChild(header);
    card.appendChild(info);
    card.appendChild(actions);

    return card;
}

/**
 * Create a button that triggers an action via delegation (data-action + data-project / data-service).
 */
function createActionButton(text, className, actionKey, payload, disabled = false) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = className;
    btn.textContent = text;
    btn.dataset.action = actionKey;
    if (payload.project) btn.dataset.project = payload.project;
    if (payload.service) btn.dataset.service = payload.service;
    if (payload.port !== undefined) btn.dataset.port = String(payload.port);
    if (payload.commit !== undefined) btn.dataset.commit = payload.commit;
    btn.disabled = disabled;
    return btn;
}

function getStatusText(status) {
    const textMap = {
        'clean': 'Clean',
        'dirty': 'Dirty',
        'not-cloned': 'Not Cloned',
        'running': 'Running',
        'stopped': 'Stopped',
        'unknown': 'Unknown'
    };
    return textMap[status] || 'Unknown';
}
