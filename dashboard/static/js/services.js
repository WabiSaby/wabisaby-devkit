// Service management

import { servicesAPI } from './api.js';
import { createServiceCard } from './components/card.js';
import { addLog } from './logs.js';
import { modalManager } from './components/modal.js';

let currentServiceName = null;
let eventSource = null;
let logsPaused = false;

/**
 * Load services
 */
export async function loadServices() {
    const grid = document.getElementById('services-grid');
    if (!grid) return;
    
    grid.innerHTML = '<div class="skeleton skeleton-placeholder"></div>';
    
    try {
        const result = await servicesAPI.list();
        
        if (result.success && result.data) {
            grid.innerHTML = '';
            if (result.data.length === 0) {
                grid.innerHTML = '<div class="empty-state">No infrastructure services configured.</div>';
            } else {
                result.data.forEach(service => {
                    const card = createServiceCard(service);
                    grid.appendChild(card);
                });
            }
        }
    } catch (error) {
        console.error('Failed to load infrastructure:', error);
        addLog('Failed to load infrastructure', 'error');
        grid.innerHTML = '<div class="log-entry error">Failed to load infrastructure</div>';
    }
}

/**
 * Check service status
 */
export async function checkService(name, port) {
    const badge = document.getElementById(`service-status-${name}`);
    if (!badge) {
        console.warn(`Service status badge not found for ${name}`);
        return;
    }
    
    badge.textContent = 'Checking...';
    badge.className = 'status-badge status-info';
    
    try {
        const result = await servicesAPI.list();
        
        if (result.success && result.data) {
            const service = result.data.find(s => s.name === name);
            if (service) {
                const status = service.status || 'unknown';
                badge.textContent = status === 'running' ? 'Running' : status === 'stopped' ? 'Stopped' : 'Unknown';
                badge.className = `status-badge status-${status === 'running' ? 'ok' : status === 'stopped' ? 'error' : 'info'}`;
                
                // Update buttons
                const card = badge.closest('.service-card');
                if (card) {
                    const startBtn = card.querySelector('button:has-text("Start")') || 
                                   Array.from(card.querySelectorAll('button')).find(b => b.textContent.includes('Start'));
                    const stopBtn = card.querySelector('button:has-text("Stop")') || 
                                  Array.from(card.querySelectorAll('button')).find(b => b.textContent.includes('Stop'));
                    if (startBtn) startBtn.disabled = status === 'running';
                    if (stopBtn) stopBtn.disabled = status === 'stopped';
                }
            }
        }
    } catch (error) {
        console.error('Failed to check service:', error);
        badge.textContent = 'Error';
        badge.className = 'status-badge status-error';
    }
}

/**
 * Start service
 */
export async function startService(name) {
    addLog(`Starting ${name}...`, 'info');
    try {
        const result = await servicesAPI.start(name);
        
        if (result.success) {
            addLog(`${name} started successfully`, 'success');
            setTimeout(() => loadServices(), 1000);
        } else {
            addLog(`Failed to start ${name}: ${result.message}`, 'error');
        }
    } catch (error) {
        addLog(`Error starting ${name}: ${error.message}`, 'error');
    }
}

/**
 * Stop service
 */
export async function stopService(name) {
    addLog(`Stopping ${name}...`, 'info');
    try {
        const result = await servicesAPI.stop(name);
        
        if (result.success) {
            addLog(`${name} stopped successfully`, 'success');
            setTimeout(() => loadServices(), 500);
        } else {
            addLog(`Failed to stop ${name}: ${result.message}`, 'error');
        }
    } catch (error) {
        addLog(`Error stopping ${name}: ${error.message}`, 'error');
    }
}

/**
 * Start all services
 */
export async function startAllServices() {
    addLog('Starting all services...', 'info');
    try {
        const result = await servicesAPI.startAll();
        
        if (result.success) {
            addLog('All services started successfully', 'success');
            setTimeout(() => loadServices(), 2000);
        } else {
            addLog(`Failed to start services: ${result.message}`, 'error');
        }
    } catch (error) {
        addLog(`Error starting services: ${error.message}`, 'error');
    }
}

/**
 * Stop all services
 */
export async function stopAllServices() {
    addLog('Stopping all services...', 'info');
    try {
        const result = await servicesAPI.stopAll();
        
        if (result.success) {
            addLog('All services stopped successfully', 'success');
            setTimeout(() => loadServices(), 1000);
        } else {
            addLog(`Failed to stop services: ${result.message}`, 'error');
        }
    } catch (error) {
        addLog(`Error stopping services: ${error.message}`, 'error');
    }
}

/**
 * View service logs
 */
export function viewServiceLogs(serviceName) {
    currentServiceName = serviceName;
    const modal = document.getElementById('logs-modal');
    const modalTitle = document.getElementById('logs-modal-title');
    const logsContent = document.getElementById('logs-content');
    const connectionStatus = document.getElementById('connection-status');
    
    if (!modal || !modalTitle || !logsContent) return;
    
    modalTitle.textContent = `${serviceName} Logs`;
    logsContent.textContent = 'Connecting...';
    modalManager.show('logs-modal');
    
    // Close any existing connection
    if (eventSource) {
        eventSource.close();
        eventSource = null;
    }
    
    // Update connection status
    if (connectionStatus) {
        connectionStatus.textContent = 'Connecting...';
        connectionStatus.className = 'connection-status connecting';
    }
    
    // Create EventSource connection
    eventSource = servicesAPI.getLogsStream(serviceName);
    logsPaused = false;
    
    // Reset pause button
    const pauseBtn = document.getElementById('pause-logs-btn');
    if (pauseBtn) {
        pauseBtn.textContent = 'Pause';
    }
    
    // Handle incoming log messages
    eventSource.onmessage = (event) => {
        if (!logsPaused) {
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
    eventSource.onopen = () => {
        if (logsContent.textContent === 'Connecting...') {
            logsContent.textContent = '';
        }
        
        if (connectionStatus) {
            connectionStatus.textContent = 'Connected';
            connectionStatus.className = 'connection-status connected';
        }
    };
    
    // Handle connection errors
    eventSource.onerror = () => {
        if (eventSource.readyState === EventSource.CLOSED) {
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
 * Refresh service logs
 */
export function refreshServiceLogs() {
    if (currentServiceName) {
        viewServiceLogs(currentServiceName);
    }
}

/**
 * Toggle logs pause
 */
export function toggleLogsPause() {
    logsPaused = !logsPaused;
    const pauseBtn = document.getElementById('pause-logs-btn');
    if (pauseBtn) {
        pauseBtn.textContent = logsPaused ? 'Resume' : 'Pause';
    }
}

/**
 * Cleanup when logs modal is closed (EventSource, state). Used by modal manager on hide.
 */
export function cleanupLogsModal() {
    if (eventSource) {
        eventSource.close();
        eventSource = null;
    }
    currentServiceName = null;
    logsPaused = false;
}

/**
 * Close logs modal (hide + cleanup).
 */
export function closeLogsModal() {
    modalManager.hide('logs-modal');
}
