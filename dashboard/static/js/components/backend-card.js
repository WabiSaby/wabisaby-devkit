// Backend service card components

import { createStatusBadge } from './badge.js';
import { createIcon } from '../utils.js';

/**
 * Create a service group section with header and cards
 */
export function createServiceGroupSection(groupId, group) {
    const section = document.createElement('div');
    section.className = 'backend-service-group';
    section.id = `backend-group-${groupId}`;

    const header = document.createElement('div');
    header.className = 'backend-group-header';

    const title = document.createElement('h3');
    title.textContent = group.title;

    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'backend-group-actions';

    const startAllBtn = document.createElement('button');
    startAllBtn.type = 'button';
    startAllBtn.className = 'btn btn-success btn-sm';
    startAllBtn.setAttribute('data-action', 'backend:startGroup');
    startAllBtn.setAttribute('data-group', groupId);
    startAllBtn.textContent = 'Start All';

    const stopAllBtn = document.createElement('button');
    stopAllBtn.type = 'button';
    stopAllBtn.className = 'btn btn-danger btn-sm';
    stopAllBtn.setAttribute('data-action', 'backend:stopGroup');
    stopAllBtn.setAttribute('data-group', groupId);
    stopAllBtn.textContent = 'Stop All';

    actionsDiv.appendChild(startAllBtn);
    actionsDiv.appendChild(stopAllBtn);

    header.appendChild(title);
    header.appendChild(actionsDiv);

    const grid = document.createElement('div');
    grid.className = 'backend-services-grid';

    group.services.forEach(service => {
        grid.appendChild(createBackendServiceCard(service));
    });

    section.appendChild(header);
    section.appendChild(grid);

    return section;
}

/**
 * Create backend service card
 */
export function createBackendServiceCard(service) {
    const status = service.status || 'stopped';

    const card = document.createElement('div');
    card.className = 'backend-service-card animate-fade-in';
    card.id = `backend-service-${service.name}`;

    // Header with name and status
    const header = document.createElement('div');
    header.className = 'card-header';

    const titleDiv = document.createElement('div');
    titleDiv.className = 'card-title';
    titleDiv.textContent = service.name;

    const statusBadge = createStatusBadge(status);
    statusBadge.id = `backend-status-${service.name}`;

    header.appendChild(titleDiv);
    header.appendChild(statusBadge);

    // Info section
    const info = document.createElement('div');
    info.className = 'card-info card-meta';

    const metaRow = document.createElement('div');
    metaRow.className = 'card-meta-row';

    if (service.port) {
        const portSpan = document.createElement('span');
        portSpan.className = 'card-meta-item';
        portSpan.innerHTML = `Port <strong>${service.port}</strong>`;
        metaRow.appendChild(portSpan);
    }

    const statusSpan = document.createElement('span');
    statusSpan.className = 'card-meta-item';
    statusSpan.textContent = getStatusText(status);
    metaRow.appendChild(statusSpan);

    info.appendChild(metaRow);

    // Show error if present
    if (service.error) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'card-meta-row card-error';
        errorDiv.textContent = service.error;
        info.appendChild(errorDiv);
    }

    // Show PID if running
    if (service.pid && status === 'running') {
        const pidDiv = document.createElement('div');
        pidDiv.className = 'card-meta-row';
        pidDiv.innerHTML = `<span class="card-meta-item">PID <strong>${service.pid}</strong></span>`;
        info.appendChild(pidDiv);
    }

    // Actions
    const actions = document.createElement('div');
    actions.className = 'card-actions card-actions-split';

    const primary = document.createElement('div');
    primary.className = 'card-actions-primary';

    const startBtn = createActionButton('Start', 'btn btn-success', 'backend:start', { service: service.name }, status === 'running' || status === 'starting');
    const stopBtn = createActionButton('Stop', 'btn btn-danger', 'backend:stop', { service: service.name }, status === 'stopped' || status === 'stopping');

    primary.appendChild(startBtn);
    primary.appendChild(stopBtn);

    const secondary = document.createElement('div');
    secondary.className = 'card-actions-secondary';

    // Logs button
    const logsBtn = createActionButton('', 'btn btn-secondary btn-icon-only', 'backend:viewLogs', { service: service.name });
    logsBtn.setAttribute('aria-label', 'View logs');
    logsBtn.appendChild(createIcon('eye', 'icon icon-sm'));
    secondary.appendChild(logsBtn);

    // Health link (if available and running)
    if (service.healthUrl && status === 'running') {
        const healthLink = document.createElement('a');
        healthLink.href = service.healthUrl;
        healthLink.target = '_blank';
        healthLink.rel = 'noopener noreferrer';
        healthLink.className = 'btn btn-secondary btn-icon-only';
        healthLink.title = 'Health endpoint';
        healthLink.setAttribute('aria-label', 'Health endpoint');
        healthLink.appendChild(createIcon('heart', 'icon icon-sm'));
        secondary.appendChild(healthLink);
    }

    // Docs link (if available and running)
    if (service.docsUrl && status === 'running') {
        const docsLink = document.createElement('a');
        docsLink.href = service.docsUrl;
        docsLink.target = '_blank';
        docsLink.rel = 'noopener noreferrer';
        docsLink.className = 'btn btn-secondary btn-icon-only';
        docsLink.title = 'API Docs';
        docsLink.setAttribute('aria-label', 'API Docs');
        docsLink.appendChild(createIcon('book', 'icon icon-sm'));
        secondary.appendChild(docsLink);
    }

    actions.appendChild(primary);
    actions.appendChild(secondary);

    card.appendChild(header);
    card.appendChild(info);
    card.appendChild(actions);

    return card;
}

/**
 * Create migration status panel
 */
export function createMigrationPanel(status) {
    const panel = document.createElement('div');
    panel.className = 'migration-status-content';

    // Current version info
    const versionDiv = document.createElement('div');
    versionDiv.className = 'migration-version';

    if (status.error) {
        versionDiv.innerHTML = `<span class="migration-error">${status.error}</span>`;
    } else {
        versionDiv.innerHTML = `
            <span class="migration-label">Current version:</span>
            <span class="migration-value">${status.currentVersion || 0}</span>
            ${status.dirty ? '<span class="migration-dirty">DIRTY</span>' : ''}
        `;
    }

    panel.appendChild(versionDiv);

    // Migration list
    if (status.migrations && status.migrations.length > 0) {
        const list = document.createElement('div');
        list.className = 'migration-list';

        status.migrations.forEach(migration => {
            const item = document.createElement('div');
            item.className = `migration-item ${migration.applied ? 'applied' : 'pending'}`;
            item.innerHTML = `
                <span class="migration-check">${migration.applied ? '&check;' : '&bull;'}</span>
                <span class="migration-name">${String(migration.version).padStart(6, '0')}_${migration.name}</span>
            `;
            list.appendChild(item);
        });

        panel.appendChild(list);
    }

    return panel;
}

/**
 * Create environment status panel
 */
export function createEnvPanel(status) {
    const panel = document.createElement('div');
    panel.className = 'env-status-content';

    // File status
    const fileStatus = document.createElement('div');
    fileStatus.className = 'env-file-status';

    const envFileSpan = document.createElement('span');
    envFileSpan.className = status.hasEnvFile ? 'env-present' : 'env-missing';
    envFileSpan.innerHTML = status.hasEnvFile
        ? '<span class="env-check">&check;</span> .env file exists'
        : '<span class="env-cross">&times;</span> .env file missing';
    fileStatus.appendChild(envFileSpan);

    if (!status.hasEnvFile && status.hasExample) {
        const hintSpan = document.createElement('span');
        hintSpan.className = 'env-hint';
        hintSpan.textContent = '(env.example available)';
        fileStatus.appendChild(hintSpan);
    }

    panel.appendChild(fileStatus);

    // Required variables
    if (status.requiredVars && status.requiredVars.length > 0) {
        const reqSection = document.createElement('div');
        reqSection.className = 'env-section';

        const reqTitle = document.createElement('div');
        reqTitle.className = 'env-section-title';
        reqTitle.textContent = 'Required Variables';
        reqSection.appendChild(reqTitle);

        const reqList = document.createElement('div');
        reqList.className = 'env-var-list';

        status.requiredVars.forEach(v => {
            const item = document.createElement('div');
            item.className = `env-var-item ${v.isSet ? 'set' : 'unset'}`;
            item.innerHTML = `
                <span class="env-var-status">${v.isSet ? '&check;' : '&times;'}</span>
                <span class="env-var-name">${v.name}</span>
            `;
            reqList.appendChild(item);
        });

        reqSection.appendChild(reqList);
        panel.appendChild(reqSection);
    }

    // Optional variables (collapsed by default)
    if (status.optionalVars && status.optionalVars.length > 0) {
        const optSection = document.createElement('details');
        optSection.className = 'env-section env-optional';

        const optSummary = document.createElement('summary');
        optSummary.className = 'env-section-title';
        optSummary.textContent = `Optional Variables (${status.optionalVars.filter(v => v.isSet).length}/${status.optionalVars.length} set)`;
        optSection.appendChild(optSummary);

        const optList = document.createElement('div');
        optList.className = 'env-var-list';

        status.optionalVars.forEach(v => {
            const item = document.createElement('div');
            item.className = `env-var-item ${v.isSet ? 'set' : 'unset'}`;
            item.innerHTML = `
                <span class="env-var-status">${v.isSet ? '&check;' : '&bull;'}</span>
                <span class="env-var-name">${v.name}</span>
            `;
            optList.appendChild(item);
        });

        optSection.appendChild(optList);
        panel.appendChild(optSection);
    }

    return panel;
}

/**
 * Create a button that triggers an action via delegation
 */
function createActionButton(text, className, actionKey, payload, disabled = false) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = className;
    if (text) btn.textContent = text;
    btn.dataset.action = actionKey;
    if (payload.service) btn.dataset.service = payload.service;
    if (payload.group) btn.dataset.group = payload.group;
    btn.disabled = disabled;
    return btn;
}

function getStatusText(status) {
    const textMap = {
        'running': 'Running',
        'stopped': 'Stopped',
        'starting': 'Starting...',
        'stopping': 'Stopping...',
        'error': 'Error',
        'unknown': 'Unknown'
    };
    return textMap[status] || 'Unknown';
}
