// Main entry point

import { loadProjects, cloneProject, updateProject, testProject, buildProject, openProjectInEditor, viewProjectLogs, closeProjectLogsModal } from './projects.js';
import { loadServices, checkService, startService, stopService, startAllServices, stopAllServices, viewServiceLogs, refreshServiceLogs, toggleLogsPause, closeLogsModal } from './services.js';
import { addLog } from './logs.js';
import { initUI, themeManager, pollingManager } from './ui.js';
import { initModals } from './components/modal.js';

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    // Initialize UI
    initUI();
    initModals();
    
    // Load initial data
    loadProjects();
    loadServices();
    
    // Setup event listeners
    setupEventListeners();
    
    // Initial log
    addLog('Dashboard initialized', 'success');
});

/**
 * Setup event listeners
 */
function setupEventListeners() {
    // Refresh button
    const refreshBtn = document.getElementById('refresh-btn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            loadProjects();
            loadServices();
            addLog('Refreshed dashboard', 'success');
        });
    }
    
    // Polling toggle
    const pollingToggle = document.getElementById('polling-toggle');
    if (pollingToggle) {
        pollingToggle.addEventListener('click', () => {
            const enabled = pollingManager.toggle(() => {
                loadProjects();
                loadServices();
            });
            addLog(enabled ? 'Auto-refresh enabled' : 'Auto-refresh disabled', enabled ? 'success' : 'info');
        });
    }
    
    // Theme toggle
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            themeManager.toggle();
        });
    }
    
    // Modal close buttons
    const modalCloses = document.querySelectorAll('.modal-close');
    modalCloses.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const modal = e.target.closest('.modal');
            if (modal) {
                if (modal.id === 'logs-modal') {
                    closeLogsModal();
                } else if (modal.id === 'project-logs-modal') {
                    closeProjectLogsModal();
                }
            }
        });
    });
}

// Make functions available globally for onclick handlers
window.updateProject = updateProject;
window.testProject = testProject;
window.buildProject = buildProject;
window.checkService = checkService;
window.startService = startService;
window.stopService = stopService;
window.startAllServices = startAllServices;
window.stopAllServices = stopAllServices;
window.togglePolling = () => {
    const enabled = pollingManager.toggle(() => {
        loadProjects();
        loadServices();
    });
    addLog(enabled ? 'Auto-refresh enabled' : 'Auto-refresh disabled', enabled ? 'success' : 'info');
};
window.viewServiceLogs = viewServiceLogs;
window.closeLogsModal = closeLogsModal;
window.refreshServiceLogs = refreshServiceLogs;
window.toggleLogsPause = toggleLogsPause;
window.openProjectInEditor = openProjectInEditor;
window.cloneProject = cloneProject;
window.viewProjectLogs = viewProjectLogs;
window.closeProjectLogsModal = closeProjectLogsModal;
