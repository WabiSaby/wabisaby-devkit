// Card component

import { createStatusBadge, createOperationBadge } from './badge.js';
import { createIcon } from '../utils.js';

/**
 * Create project card
 */
export function createProjectCard(project, operationStatus = null) {
    const status = project.status || 'unknown';
    const isCloned = project.branch && project.branch !== '-';
    const opStatus = operationStatus || project.operationStatus || { type: null, running: false };
    
    const card = document.createElement('div');
    card.className = 'project-card animate-fade-in';
    card.id = `project-card-${project.name}`;
    
    // Header
    const header = document.createElement('div');
    header.className = 'card-header';
    header.innerHTML = `
        <div class="card-title">${project.name}</div>
    `;
    const statusBadge = createStatusBadge(status);
    statusBadge.id = `status-${project.name}`;
    header.appendChild(statusBadge);
    
    // Info
    const info = document.createElement('div');
    info.className = 'card-info';
    info.innerHTML = `
        <div class="card-info-item">
            <strong>Branch:</strong> <span id="branch-${project.name}">${project.branch || '-'}</span>
        </div>
        <div class="card-info-item">
            <strong>Commit:</strong> <span id="commit-${project.name}">${project.commit || '-'}</span>
        </div>
        <div class="card-info-item">
            <strong>Status:</strong> <span id="dirty-${project.name}">${getStatusText(status)}</span>
        </div>
    `;
    
    // Operation status
    if (opStatus.running) {
        const opBadge = document.createElement('div');
        opBadge.className = 'card-info-item operation-status';
        opBadge.appendChild(createOperationBadge(opStatus.type));
        info.appendChild(opBadge);
    }
    
    // Actions
    const actions = document.createElement('div');
    actions.className = 'card-actions';
    
    if (!isCloned) {
        const cloneBtn = createButton('Clone', 'btn-success', () => {
            if (window.cloneProject) window.cloneProject(project.name);
        });
        actions.appendChild(cloneBtn);
    } else {
        const updateBtn = createButton('Update', 'btn-primary', () => {
            if (window.updateProject) window.updateProject(project.name);
        }, opStatus.running);
        const testBtn = createButton('Test', 'btn-secondary', () => {
            if (window.testProject) window.testProject(project.name);
        }, opStatus.running);
        const buildBtn = createButton('Build', 'btn-secondary', () => {
            if (window.buildProject) window.buildProject(project.name);
        }, opStatus.running);
        const viewLogsBtn = createButton('View Logs', 'btn-info', () => {
            if (window.viewProjectLogs) window.viewProjectLogs(project.name);
        });
        viewLogsBtn.id = `view-logs-${project.name}`;
        viewLogsBtn.style.display = (opStatus.running ? 'inline-flex' : 'none');
        const openBtn = createButton('Open', 'btn-info', () => {
            if (window.openProjectInEditor) window.openProjectInEditor(project.name);
        }, opStatus.running);
        openBtn.title = 'Open in Cursor or VSCode';
        
        actions.appendChild(updateBtn);
        actions.appendChild(testBtn);
        actions.appendChild(buildBtn);
        actions.appendChild(viewLogsBtn);
        actions.appendChild(openBtn);
    }
    
    card.appendChild(header);
    card.appendChild(info);
    card.appendChild(actions);
    
    return card;
}

/**
 * Create service card
 */
export function createServiceCard(service) {
    const status = service.status || 'unknown';
    
    const card = document.createElement('div');
    card.className = 'service-card animate-fade-in';
    
    // Header
    const header = document.createElement('div');
    header.className = 'card-header';
    header.innerHTML = `<div class="card-title">${service.name}</div>`;
    const statusBadge = createStatusBadge(status);
    statusBadge.id = `service-status-${service.name}`;
    header.appendChild(statusBadge);
    
    // Info
    const info = document.createElement('div');
    info.className = 'card-info';
    info.innerHTML = `
        <div class="card-info-item"><strong>Port:</strong> ${service.port}</div>
        <div class="card-info-item"><strong>Status:</strong> ${getStatusText(status)}</div>
    `;
    
    // Actions
    const actions = document.createElement('div');
    actions.className = 'card-actions';
    
    const startBtn = createButton('Start', 'btn-success', () => {
        if (window.startService) window.startService(service.name);
    }, status === 'running');
    const stopBtn = createButton('Stop', 'btn-danger', () => {
        if (window.stopService) window.stopService(service.name);
    }, status === 'stopped');
    const refreshBtn = createButton('Refresh', 'btn-secondary', () => {
        if (window.checkService) window.checkService(service.name, service.port);
    });
    const logsBtn = createButton('View Logs', 'btn-info', () => {
        if (window.viewServiceLogs) window.viewServiceLogs(service.name);
    });
    
    actions.appendChild(startBtn);
    actions.appendChild(stopBtn);
    actions.appendChild(refreshBtn);
    actions.appendChild(logsBtn);
    
    card.appendChild(header);
    card.appendChild(info);
    card.appendChild(actions);
    
    return card;
}

/**
 * Create button element
 */
function createButton(text, className, onClick, disabled = false) {
    const btn = document.createElement('button');
    btn.className = `btn ${className}`;
    btn.textContent = text;
    btn.disabled = disabled;
    if (onClick) {
        btn.addEventListener('click', onClick);
    }
    return btn;
}

/**
 * Get status text
 */
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
