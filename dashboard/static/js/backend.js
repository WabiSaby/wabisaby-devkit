// Backend (WabiSaby-Go) service management

import { backendAPI } from './api.js';
import { createBackendServiceCard, createServiceGroupSection, createMigrationPanel, createEnvPanel } from './components/backend-card.js';
import { addLog } from './logs.js';
import { modalManager } from './components/modal.js';

let currentBackendServiceName = null;
let backendEventSource = null;
let migrationEventSource = null;
let backendLogsPaused = false;

// Group display names
const GROUP_NAMES = {
    core: 'Core Services',
    coordinator: 'Network Coordinator',
    node: 'Storage Node'
};

/**
 * Load backend services grouped by config file
 */
export async function loadBackendServices() {
    const container = document.getElementById('backend-services-container');
    if (!container) return;

    container.innerHTML = '<div class="skeleton skeleton-placeholder"></div>';

    try {
        const result = await backendAPI.listServices();

        if (result.success && result.data) {
            container.innerHTML = '';

            // Group by config file
            const groups = {
                core: { title: GROUP_NAMES.core, services: [] },
                coordinator: { title: GROUP_NAMES.coordinator, services: [] },
                node: { title: GROUP_NAMES.node, services: [] }
            };

            result.data.forEach(service => {
                if (groups[service.group]) {
                    groups[service.group].services.push(service);
                }
            });

            // Render each group
            Object.entries(groups).forEach(([groupId, group]) => {
                if (group.services.length > 0) {
                    const section = createServiceGroupSection(groupId, group);
                    container.appendChild(section);
                }
            });

            if (container.children.length === 0) {
                container.innerHTML = '<div class="empty-state">No backend services configured.</div>';
            }
        }
    } catch (error) {
        console.error('Failed to load backend services:', error);
        addLog('Failed to load backend services', 'error');
        container.innerHTML = '<div class="log-entry error">Failed to load backend services</div>';
    }
}

/**
 * Start a backend service
 */
export async function startBackendService(name) {
    addLog(`Starting ${name}...`, 'info');

    // Update button states
    updateServiceButtons(name, true, false);

    try {
        const result = await backendAPI.startService(name);

        if (result.success) {
            addLog(`${name} started successfully`, 'success');
            setTimeout(() => loadBackendServices(), 1000);
        } else {
            addLog(`Failed to start ${name}: ${result.message}`, 'error');
            setTimeout(() => loadBackendServices(), 500);
        }
    } catch (error) {
        addLog(`Error starting ${name}: ${error.message}`, 'error');
        setTimeout(() => loadBackendServices(), 500);
    }
}

/**
 * Stop a backend service
 */
export async function stopBackendService(name) {
    addLog(`Stopping ${name}...`, 'info');

    // Update button states
    updateServiceButtons(name, false, true);

    try {
        const result = await backendAPI.stopService(name);

        if (result.success) {
            addLog(`${name} stopped successfully`, 'success');
            setTimeout(() => loadBackendServices(), 500);
        } else {
            addLog(`Failed to stop ${name}: ${result.message}`, 'error');
            setTimeout(() => loadBackendServices(), 500);
        }
    } catch (error) {
        addLog(`Error stopping ${name}: ${error.message}`, 'error');
        setTimeout(() => loadBackendServices(), 500);
    }
}

/**
 * Start all services in a group
 */
export async function startBackendGroup(group) {
    addLog(`Starting all ${GROUP_NAMES[group] || group} services...`, 'info');

    try {
        const result = await backendAPI.startGroup(group);

        if (result.success) {
            addLog(`All ${GROUP_NAMES[group] || group} services started`, 'success');
            setTimeout(() => loadBackendServices(), 2000);
        } else {
            addLog(`Failed to start group: ${result.message}`, 'error');
            setTimeout(() => loadBackendServices(), 1000);
        }
    } catch (error) {
        addLog(`Error starting group: ${error.message}`, 'error');
        setTimeout(() => loadBackendServices(), 1000);
    }
}

/**
 * Stop all services in a group
 */
export async function stopBackendGroup(group) {
    addLog(`Stopping all ${GROUP_NAMES[group] || group} services...`, 'info');

    try {
        const result = await backendAPI.stopGroup(group);

        if (result.success) {
            addLog(`All ${GROUP_NAMES[group] || group} services stopped`, 'success');
            setTimeout(() => loadBackendServices(), 1000);
        } else {
            addLog(`Failed to stop group: ${result.message}`, 'error');
            setTimeout(() => loadBackendServices(), 1000);
        }
    } catch (error) {
        addLog(`Error stopping group: ${error.message}`, 'error');
        setTimeout(() => loadBackendServices(), 1000);
    }
}

/**
 * Check backend service health and show result in modal
 */
export async function checkBackendHealth(serviceName) {
    const titleEl = document.getElementById('health-modal-title');
    const contentEl = document.getElementById('health-modal-content');
    if (!titleEl || !contentEl) return;

    titleEl.textContent = `Health check — ${serviceName}`;
    contentEl.innerHTML = '<div class="health-result-loading">Checking…</div>';
    modalManager.show('health-modal');

    try {
        const result = await backendAPI.getHealth(serviceName);
        const d = result?.data || {};
        const ok = d.ok === true;
        const statusCode = d.statusCode ?? 0;
        const status = d.status || '';
        const body = d.body ?? '';
        const err = d.error || '';

        let html = `<div class="health-result-status ${ok ? 'health-ok' : 'health-fail'}">`;
        html += `<span class="health-result-badge">${ok ? 'OK' : 'Unhealthy'}</span>`;
        html += statusCode ? ` <span class="health-result-code">${statusCode} ${status}</span>` : '';
        if (err) html += ` <span class="health-result-error">${escapeHtml(err)}</span>`;
        html += '</div>';
        if (body) {
            html += '<pre class="health-result-body">' + escapeHtml(body) + '</pre>';
        }
        contentEl.innerHTML = html;
    } catch (error) {
        contentEl.innerHTML = `<div class="health-result-status health-fail"><span class="health-result-error">${escapeHtml(error.message)}</span></div>`;
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Update service button states
 */
function updateServiceButtons(name, startDisabled, stopDisabled) {
    const card = document.getElementById(`backend-service-${name}`);
    if (!card) return;

    const startBtn = card.querySelector('[data-action="backend:start"]');
    const stopBtn = card.querySelector('[data-action="backend:stop"]');

    if (startBtn) startBtn.disabled = startDisabled;
    if (stopBtn) stopBtn.disabled = stopDisabled;
}

/**
 * View backend service logs
 */
export function viewBackendServiceLogs(serviceName) {
    currentBackendServiceName = serviceName;
    const modal = document.getElementById('backend-logs-modal');
    const modalTitle = document.getElementById('backend-logs-modal-title');
    const logsContent = document.getElementById('backend-logs-content');
    const connectionStatus = document.getElementById('backend-connection-status');

    if (!modal || !modalTitle || !logsContent) return;

    modalTitle.textContent = `${serviceName} Logs`;
    logsContent.textContent = 'Connecting...';
    modalManager.show('backend-logs-modal');

    // Close any existing connection
    if (backendEventSource) {
        backendEventSource.close();
        backendEventSource = null;
    }

    // Update connection status
    if (connectionStatus) {
        connectionStatus.textContent = 'Connecting...';
        connectionStatus.className = 'connection-status connecting';
    }

    // Create EventSource connection
    backendEventSource = backendAPI.getServiceLogsStream(serviceName);
    backendLogsPaused = false;

    // Reset pause button
    const pauseBtn = document.getElementById('backend-pause-logs-btn');
    if (pauseBtn) {
        pauseBtn.textContent = 'Pause';
    }

    // Handle incoming log messages
    backendEventSource.onmessage = (event) => {
        if (!backendLogsPaused) {
            if (logsContent.textContent === 'Connecting...' || logsContent.textContent === '') {
                logsContent.textContent = event.data;
            } else {
                logsContent.textContent += '\n' + event.data;
            }
            logsContent.scrollTop = logsContent.scrollHeight;
        }

        if (connectionStatus) {
            connectionStatus.textContent = 'Connected';
            connectionStatus.className = 'connection-status connected';
        }
    };

    // Handle connection opened
    backendEventSource.onopen = () => {
        if (logsContent.textContent === 'Connecting...') {
            logsContent.textContent = '';
        }

        if (connectionStatus) {
            connectionStatus.textContent = 'Connected';
            connectionStatus.className = 'connection-status connected';
        }
    };

    // Handle connection errors
    backendEventSource.onerror = () => {
        if (backendEventSource.readyState === EventSource.CLOSED) {
            if (connectionStatus) {
                connectionStatus.textContent = 'Disconnected';
                connectionStatus.className = 'connection-status disconnected';
            }

            if (logsContent.textContent === 'Connecting...' || logsContent.textContent === '') {
                logsContent.textContent = 'Connection closed. Service may not be running.';
            }
        } else {
            if (connectionStatus) {
                connectionStatus.textContent = 'Error';
                connectionStatus.className = 'connection-status error';
            }

            if (logsContent.textContent === 'Connecting...' || logsContent.textContent === '') {
                logsContent.textContent = 'Error connecting to log stream.';
            }
        }
    };
}

/**
 * Refresh backend service logs
 */
export function refreshBackendServiceLogs() {
    if (currentBackendServiceName) {
        viewBackendServiceLogs(currentBackendServiceName);
    }
}

/**
 * Toggle backend logs pause
 */
export function toggleBackendLogsPause() {
    backendLogsPaused = !backendLogsPaused;
    const pauseBtn = document.getElementById('backend-pause-logs-btn');
    if (pauseBtn) {
        pauseBtn.textContent = backendLogsPaused ? 'Resume' : 'Pause';
    }
}

/**
 * Cleanup backend logs modal
 */
export function cleanupBackendLogsModal() {
    if (backendEventSource) {
        backendEventSource.close();
        backendEventSource = null;
    }
    currentBackendServiceName = null;
    backendLogsPaused = false;
}

/**
 * Close backend logs modal
 */
export function closeBackendLogsModal() {
    modalManager.hide('backend-logs-modal');
}

// --- Migration functions ---

/**
 * Load migration status
 */
export async function loadMigrationStatus() {
    const container = document.getElementById('migration-status');
    if (!container) return;

    container.innerHTML = '<span class="status-loading">Loading...</span>';

    try {
        const result = await backendAPI.getMigrationStatus();

        if (result.success && result.data) {
            container.innerHTML = '';
            container.appendChild(createMigrationPanel(result.data));
        } else {
            container.innerHTML = '<span class="status-error">Failed to load migration status</span>';
        }
    } catch (error) {
        console.error('Failed to load migration status:', error);
        container.innerHTML = '<span class="status-error">Error loading migration status</span>';
    }
}

/**
 * Run migrations up
 */
export async function runMigrationUp() {
    addLog('Running migrations up...', 'info');

    const modal = document.getElementById('migration-modal');
    const modalTitle = document.getElementById('migration-modal-title');
    const output = document.getElementById('migration-output');

    if (modal && modalTitle && output) {
        modalTitle.textContent = 'Migration Up';
        output.textContent = 'Starting migration...';
        modalManager.show('migration-modal');
    }

    try {
        // Use streaming endpoint
        if (migrationEventSource) {
            migrationEventSource.close();
        }

        migrationEventSource = backendAPI.getMigrationStream('up');

        migrationEventSource.onmessage = (event) => {
            if (output) {
                if (output.textContent === 'Starting migration...') {
                    output.textContent = event.data;
                } else {
                    output.textContent += '\n' + event.data;
                }
                output.scrollTop = output.scrollHeight;
            }
        };

        migrationEventSource.onerror = () => {
            migrationEventSource.close();
            migrationEventSource = null;
            loadMigrationStatus();
        };

    } catch (error) {
        addLog(`Migration error: ${error.message}`, 'error');
        if (output) {
            output.textContent += '\n[Error] ' + error.message;
        }
    }
}

/**
 * Run migrations down
 */
export async function runMigrationDown() {
    addLog('Rolling back migration...', 'info');

    const modal = document.getElementById('migration-modal');
    const modalTitle = document.getElementById('migration-modal-title');
    const output = document.getElementById('migration-output');

    if (modal && modalTitle && output) {
        modalTitle.textContent = 'Migration Down';
        output.textContent = 'Starting rollback...';
        modalManager.show('migration-modal');
    }

    try {
        if (migrationEventSource) {
            migrationEventSource.close();
        }

        migrationEventSource = backendAPI.getMigrationStream('down');

        migrationEventSource.onmessage = (event) => {
            if (output) {
                if (output.textContent === 'Starting rollback...') {
                    output.textContent = event.data;
                } else {
                    output.textContent += '\n' + event.data;
                }
                output.scrollTop = output.scrollHeight;
            }
        };

        migrationEventSource.onerror = () => {
            migrationEventSource.close();
            migrationEventSource = null;
            loadMigrationStatus();
        };

    } catch (error) {
        addLog(`Migration error: ${error.message}`, 'error');
        if (output) {
            output.textContent += '\n[Error] ' + error.message;
        }
    }
}

/**
 * Close migration modal
 */
export function closeMigrationModal() {
    if (migrationEventSource) {
        migrationEventSource.close();
        migrationEventSource = null;
    }
    modalManager.hide('migration-modal');
}

// --- Environment functions ---

/**
 * Load environment status
 */
export async function loadEnvStatus() {
    const container = document.getElementById('env-status');
    if (!container) return;

    container.innerHTML = '<span class="status-loading">Loading...</span>';

    try {
        const result = await backendAPI.getEnvStatus();

        if (result.success && result.data) {
            container.innerHTML = '';
            container.appendChild(createEnvPanel(result.data));

            // Update copy button visibility
            const copyBtn = document.getElementById('copy-env-btn');
            if (copyBtn) {
                copyBtn.disabled = result.data.hasEnvFile || !result.data.hasExample;
            }
        } else {
            container.innerHTML = '<span class="status-error">Failed to load env status</span>';
        }
    } catch (error) {
        console.error('Failed to load env status:', error);
        container.innerHTML = '<span class="status-error">Error loading env status</span>';
    }
}

/**
 * Copy env.example to .env
 */
export async function copyEnvExample() {
    addLog('Copying env.example to .env...', 'info');

    try {
        const result = await backendAPI.copyEnvExample();

        if (result.success) {
            addLog('Copied env.example to .env', 'success');
            loadEnvStatus();
        } else {
            addLog(`Failed: ${result.message}`, 'error');
        }
    } catch (error) {
        addLog(`Error: ${error.message}`, 'error');
    }
}
