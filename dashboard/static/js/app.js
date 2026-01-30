// App bootstrap: action registry and event delegation

import { loadProjects, cloneProject, updateProject, testProject, buildProject, formatProject, lintProject, openProjectInEditor, viewProjectLogs, closeProjectLogsModal, openCreateTagModal, submitCreateTagForm, closeCreateTagModal, runBulkAction } from './projects.js';
import { loadServices, checkService, startService, stopService, startAllServices, stopAllServices, viewServiceLogs, refreshServiceLogs, toggleLogsPause, closeLogsModal, cleanupLogsModal } from './services.js';
import { loadBackendServices, startBackendService, stopBackendService, startBackendGroup, stopBackendGroup, viewBackendServiceLogs, refreshBackendServiceLogs, toggleBackendLogsPause, closeBackendLogsModal, cleanupBackendLogsModal, checkBackendHealth, loadMigrationStatus, runMigrationUp, runMigrationDown, closeMigrationModal, loadEnvStatus, copyEnvExample } from './backend.js';
import { addLog } from './logs.js';
import { submoduleAPI } from './api.js';
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
    if (el.dataset.group) payload.group = el.dataset.group;
    return payload;
}

/** When open, the menu is moved to body; we store its original parent to restore on close. */
let floatingDropdownWrap = null;

/**
 * Close all card dropdowns: move floating menu back into card and clear state.
 */
function closeAllCardDropdowns() {
    document.querySelectorAll('.card-actions-more.is-open').forEach((wrap) => {
        wrap.classList.remove('is-open');
        wrap.querySelector('[aria-expanded]')?.setAttribute('aria-expanded', 'false');
    });
    const floating = document.querySelector('.card-dropdown-menu-floating');
    if (floating && floatingDropdownWrap) {
        floatingDropdownWrap.appendChild(floating);
        floating.classList.remove('card-dropdown-menu-floating');
        floating.style.cssText = '';
        floatingDropdownWrap.classList.remove('is-open');
        floatingDropdownWrap.querySelector('[aria-expanded]')?.setAttribute('aria-expanded', 'false');
        floatingDropdownWrap = null;
    }
}

/**
 * Open dropdown as floating layer (append menu to body, position below trigger, high z-index).
 */
function openDropdownFloating(trigger, wrap) {
    const menu = wrap.querySelector('.card-dropdown-menu');
    if (!menu) return;
    const rect = trigger.getBoundingClientRect();
    const menuWidth = 180;
    document.body.appendChild(menu);
    menu.classList.add('card-dropdown-menu-floating');
    menu.style.position = 'fixed';
    menu.style.top = `${rect.bottom + 4}px`;
    menu.style.left = `${Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8)}px`;
    menu.style.right = 'auto';
    menu.style.marginTop = '0';
    wrap.classList.add('is-open');
    trigger.setAttribute('aria-expanded', 'true');
    floatingDropdownWrap = wrap;
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
            const wasOpen = floatingDropdownWrap === wrap;
            if (floatingDropdownWrap) closeAllCardDropdowns();
            if (wasOpen) {
                e.preventDefault();
                e.stopPropagation();
                return;
            }
            openDropdownFloating(trigger, wrap);
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
        loadBackendServices();
        loadMigrationStatus();
        loadEnvStatus();
        loadSyncStatus();
        addLog('Refreshed dashboard', 'success');
    });
    registerAction('dashboard:sync', async () => {
        try {
            const result = await submoduleAPI.sync();
            if (result.success) {
                addLog(result.message || 'Submodules synced to DevKit', 'success');
                loadSyncStatus();
                loadProjects();
            } else {
                addLog(result.message || 'Sync failed', 'error');
            }
        } catch (error) {
            addLog('Sync failed: ' + error.message, 'error');
        }
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
    registerAction('project:format', (p) => formatProject(p.project));
    registerAction('project:lint', (p) => lintProject(p.project));
    registerAction('project:open', (p) => openProjectInEditor(p.project));
    registerAction('project:viewLogs', (p) => viewProjectLogs(p.project));
    registerAction('project:createTag', (p) => openCreateTagModal(p.project, p.commit || '-'));
    registerAction('project:bulkFormat', () => runBulkAction('format'));
    registerAction('project:bulkLint', () => runBulkAction('lint'));
    registerAction('project:bulkTest', () => runBulkAction('test'));
    registerAction('project:bulkBuild', () => runBulkAction('build'));

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
        else if (p.modalId === 'backend-logs-modal') closeBackendLogsModal();
        else if (p.modalId === 'migration-modal') closeMigrationModal();
        else modalManager.hide(p.modalId);
    });

    // Logs modal actions
    registerAction('logs:pause', () => toggleLogsPause());
    registerAction('logs:refresh', () => refreshServiceLogs());

    // Create tag form
    registerAction('project:submitCreateTag', () => submitCreateTagForm());

    // Backend (WabiSaby-Go) service actions
    registerAction('backend:start', (p) => startBackendService(p.service));
    registerAction('backend:stop', (p) => stopBackendService(p.service));
    registerAction('backend:startGroup', (p) => startBackendGroup(p.group));
    registerAction('backend:stopGroup', (p) => stopBackendGroup(p.group));
    registerAction('backend:viewLogs', (p) => viewBackendServiceLogs(p.service));
    registerAction('backend:checkHealth', (p) => checkBackendHealth(p.service));

    // Backend logs modal actions
    registerAction('backend-logs:pause', () => toggleBackendLogsPause());
    registerAction('backend-logs:refresh', () => refreshBackendServiceLogs());

    // Migration actions
    registerAction('migration:up', () => runMigrationUp());
    registerAction('migration:down', () => runMigrationDown());

    // Environment actions
    registerAction('env:copyExample', () => copyEnvExample());
}

/**
 * Initialize the application.
 */
export function init() {
    registerAllActions();
    document.body.addEventListener('click', handleClick);

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.card-actions-more') && !e.target.closest('.card-dropdown-menu-floating')) {
            closeAllCardDropdowns();
        }
    });

    initUI();
    initModals();
    modalManager.setOnHide('logs-modal', cleanupLogsModal);
    modalManager.setOnHide('backend-logs-modal', cleanupBackendLogsModal);

    const refreshIconEl = document.getElementById('refresh-icon');
    if (refreshIconEl) {
        const icon = createIcon('refresh', 'icon icon-sm');
        icon.setAttribute('aria-hidden', 'true');
        refreshIconEl.replaceWith(icon);
    }

    loadProjects();
    loadServices();
    loadBackendServices();
    loadMigrationStatus();
    loadEnvStatus();
    loadSyncStatus();
    addLog('Dashboard initialized', 'success');
}

/**
 * Fetch submodule sync status and show/hide the sync banner.
 */
async function loadSyncStatus() {
    const banner = document.getElementById('sync-banner');
    if (!banner) return;
    try {
        const result = await submoduleAPI.getSyncStatus();
        if (result.success && result.data && result.data.needsSync && result.data.needsSync.length > 0) {
            banner.classList.remove('is-hidden');
        } else {
            banner.classList.add('is-hidden');
        }
    } catch {
        banner.classList.add('is-hidden');
    }
}
