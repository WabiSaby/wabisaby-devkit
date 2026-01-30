// App bootstrap: action registry and event delegation

import { loadProjects, cloneProject, updateProject, testProject, buildProject, openProjectInEditor, viewProjectLogs, closeProjectLogsModal, openCreateTagModal, submitCreateTagForm, closeCreateTagModal } from './projects.js';
import { loadServices, checkService, startService, stopService, startAllServices, stopAllServices, viewServiceLogs, refreshServiceLogs, toggleLogsPause, closeLogsModal, cleanupLogsModal } from './services.js';
import { addLog } from './logs.js';
import { initUI, themeManager, pollingManager } from './ui.js';
import { initModals, modalManager } from './components/modal.js';
import { createIcon } from './utils.js';

const actions = new Map();

/**
 * Register an action handler.
 * @param {string} actionKey - e.g. 'project:test', 'service:start', 'modal:close'
 * @param {(payload: object) => void} handler
 */
export function registerAction(actionKey, handler) {
    actions.set(actionKey, handler);
}

/**
 * Dispatch an action with payload (used by delegated click handler).
 * @param {string} actionKey
 * @param {object} payload - e.g. { project: 'wabisaby-go', modalId: 'logs-modal' }
 */
export function dispatch(actionKey, payload = {}) {
    const handler = actions.get(actionKey);
    if (handler) {
        handler(payload);
    } else {
        console.warn(`Unknown action: ${actionKey}`);
    }
}

/**
 * Build payload from a button/element with data-* attributes.
 */
function getPayloadFromElement(el) {
    const payload = {};
    if (el.dataset.project) payload.project = el.dataset.project;
    if (el.dataset.service) payload.service = el.dataset.service;
    if (el.dataset.port !== undefined) payload.port = el.dataset.port;
    if (el.dataset.modalId) payload.modalId = el.dataset.modalId;
    if (el.dataset.commit !== undefined) payload.commit = el.dataset.commit;
    return payload;
}

/**
 * Close all card dropdowns (used after action or click outside).
 */
function closeAllCardDropdowns() {
    document.querySelectorAll('.card-actions-more.is-open').forEach((wrap) => {
        wrap.classList.remove('is-open');
        wrap.querySelector('[aria-expanded]')?.setAttribute('aria-expanded', 'false');
    });
}

/**
 * Single delegated click listener for data-action.
 */
function handleClick(e) {
    const trigger = e.target.closest('[data-action]');
    if (!trigger || trigger.disabled) return;

    const actionKey = trigger.dataset.action;
    if (!actionKey) return;

    if (actionKey === 'dropdown:toggle') {
        const wrap = trigger.closest('.card-actions-more');
        if (wrap) {
            wrap.classList.toggle('is-open');
            trigger.setAttribute('aria-expanded', wrap.classList.contains('is-open'));
        }
        e.preventDefault();
        e.stopPropagation();
        return;
    }

    e.preventDefault();
    const payload = getPayloadFromElement(trigger);
    dispatch(actionKey, payload);
    closeAllCardDropdowns();
}

/**
 * Register all app actions (project, service, modal, dashboard).
 */
function registerAllActions() {
    // Dashboard
    registerAction('dashboard:refresh', () => {
        loadProjects();
        loadServices();
        addLog('Refreshed dashboard', 'success');
    });
    registerAction('dashboard:polling', () => {
        const enabled = pollingManager.toggle(() => {
            loadProjects();
            loadServices();
        });
        addLog(enabled ? 'Auto-refresh enabled' : 'Auto-refresh disabled', enabled ? 'success' : 'info');
    });
    registerAction('dashboard:theme', () => themeManager.toggle());

    // Project actions
    registerAction('project:clone', (p) => cloneProject(p.project));
    registerAction('project:update', (p) => updateProject(p.project));
    registerAction('project:test', (p) => testProject(p.project));
    registerAction('project:build', (p) => buildProject(p.project));
    registerAction('project:open', (p) => openProjectInEditor(p.project));
    registerAction('project:viewLogs', (p) => viewProjectLogs(p.project));
    registerAction('project:createTag', (p) => openCreateTagModal(p.project, p.commit || '-'));

    // Service actions
    registerAction('service:start', (p) => startService(p.service));
    registerAction('service:stop', (p) => stopService(p.service));
    registerAction('service:startAll', () => startAllServices());
    registerAction('service:stopAll', () => stopAllServices());
    registerAction('service:check', (p) => checkService(p.service, p.port));
    registerAction('service:viewLogs', (p) => viewServiceLogs(p.service));

    // Modal actions (use specific close so e.g. logs modal cleans up EventSource)
    registerAction('modal:close', (p) => {
        if (!p.modalId) return;
        if (p.modalId === 'logs-modal') closeLogsModal();
        else if (p.modalId === 'project-logs-modal') closeProjectLogsModal();
        else if (p.modalId === 'create-tag-modal') closeCreateTagModal();
        else modalManager.hide(p.modalId);
    });

    // Logs modal actions
    registerAction('logs:pause', () => toggleLogsPause());
    registerAction('logs:refresh', () => refreshServiceLogs());

    // Create tag form
    registerAction('project:submitCreateTag', () => submitCreateTagForm());
}

/**
 * Initialize the application.
 */
export function init() {
    registerAllActions();
    document.body.addEventListener('click', handleClick);

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.card-actions-more')) {
            closeAllCardDropdowns();
        }
    });

    initUI();
    initModals();
    modalManager.setOnHide('logs-modal', cleanupLogsModal);

    const refreshIconEl = document.getElementById('refresh-icon');
    if (refreshIconEl) {
        const icon = createIcon('refresh', 'icon icon-sm');
        icon.setAttribute('aria-hidden', 'true');
        refreshIconEl.replaceWith(icon);
    }

    loadProjects();
    loadServices();
    addLog('Dashboard initialized', 'success');
}
