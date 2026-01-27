// WabiSaby DevKit Dashboard
const projects = [
    { name: 'wabisaby-core', path: 'wabisaby-core' },
    { name: 'wabisaby-protos', path: 'wabisaby-protos' },
    { name: 'wabisaby-plugin-sdk-go', path: 'wabisaby-plugin-sdk-go' },
    { name: 'wabisaby-plugins', path: 'wabisaby-plugins' }
];

const services = [
    { name: 'PostgreSQL', port: 5432, url: 'http://localhost:5432' },
    { name: 'Redis', port: 6379, url: 'http://localhost:6379' },
    { name: 'MinIO', port: 9000, url: 'http://localhost:9000' },
    { name: 'Vault', port: 8200, url: 'http://localhost:8200' },
    { name: 'pgAdmin', port: 5050, url: 'http://localhost:5050' }
];

let theme = localStorage.getItem('theme') || 'light';
let projectOperationStatus = {}; // Track running operations per project
let projectLogs = {}; // Store logs for each project

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    loadProjects();
    loadServices();
    setupEventListeners();
    updatePollingButton();
    // Don't start polling by default - user can enable it if they want
});

function initTheme() {
    document.documentElement.setAttribute('data-theme', theme);
    updateThemeToggle();
}

function updateThemeToggle() {
    const toggle = document.getElementById('theme-toggle');
    toggle.textContent = theme === 'dark' ? 'Light Mode' : 'Dark Mode';
}

function setupEventListeners() {
    document.getElementById('refresh-btn').addEventListener('click', () => {
        loadProjects();
        loadServices();
        addLog('Refreshed dashboard', 'success');
    });

    document.getElementById('polling-toggle').addEventListener('click', () => {
        togglePolling();
    });

    document.getElementById('theme-toggle').addEventListener('click', () => {
        theme = theme === 'dark' ? 'light' : 'dark';
        localStorage.setItem('theme', theme);
        initTheme();
    });

    // Close modal when clicking outside
    const modal = document.getElementById('logs-modal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeLogsModal();
            }
        });
    }
}

async function loadProjects() {
    const grid = document.getElementById('projects-grid');
    grid.innerHTML = '';

    try {
        const response = await fetch('/api/projects');
        const result = await response.json();
        
        if (result.success && result.data) {
            result.data.forEach(project => {
                // Merge with existing operation status if available
                if (projectOperationStatus[project.name]) {
                    project.operationStatus = projectOperationStatus[project.name];
                }
                const card = createProjectCard(project);
                grid.appendChild(card);
            });
        } else {
            // Fallback to default projects if API fails
            projects.forEach(project => {
                if (projectOperationStatus[project.name]) {
                    project.operationStatus = projectOperationStatus[project.name];
                }
                const card = createProjectCard(project);
                grid.appendChild(card);
            });
        }
    } catch (error) {
        console.error('Failed to load projects:', error);
        // Fallback to default projects
        projects.forEach(project => {
            if (projectOperationStatus[project.name]) {
                project.operationStatus = projectOperationStatus[project.name];
            }
            const card = createProjectCard(project);
            grid.appendChild(card);
        });
    }
}

function createProjectCard(project) {
    const status = project.status || 'unknown';
    const statusClass = status === 'clean' ? 'status-ok' : status === 'dirty' ? 'status-warning' : status === 'not-cloned' ? 'status-error' : 'status-info';
    const statusText = status === 'clean' ? 'Clean' : status === 'dirty' ? 'Dirty' : status === 'not-cloned' ? 'Not Cloned' : 'Unknown';
    const isCloned = project.branch && project.branch !== '-';
    const operationStatus = project.operationStatus || projectOperationStatus[project.name] || { type: null, running: false };
    
    const card = document.createElement('div');
    card.className = 'project-card';
    card.id = `project-card-${project.name}`;
    card.innerHTML = `
        <div class="card-header">
            <div class="card-title">${project.name}</div>
            <span class="status-badge ${statusClass}" id="status-${project.name}">${statusText}</span>
        </div>
        <div class="card-info">
            <div class="card-info-item">Branch: <span id="branch-${project.name}">${project.branch || '-'}</span></div>
            <div class="card-info-item">Commit: <span id="commit-${project.name}">${project.commit || '-'}</span></div>
            <div class="card-info-item">Status: <span id="dirty-${project.name}">${statusText}</span></div>
            ${operationStatus.running ? `
                <div class="card-info-item operation-status">
                    <span class="operation-badge ${operationStatus.type === 'test' ? 'operation-test' : 'operation-build'}">
                        ${operationStatus.type === 'test' ? 'Testing...' : 'Building...'}
                    </span>
                </div>
            ` : ''}
        </div>
        <div class="card-actions">
            ${!isCloned ? 
                `<button class="btn btn-success" onclick="cloneProject('${project.name}')">Clone</button>` :
                `<button class="btn btn-primary" onclick="updateProject('${project.name}')" ${operationStatus.running ? 'disabled' : ''}>Update</button>
                 <button class="btn btn-secondary" onclick="testProject('${project.name}')" ${operationStatus.running ? 'disabled' : ''}>Test</button>
                 <button class="btn btn-secondary" onclick="buildProject('${project.name}')" ${operationStatus.running ? 'disabled' : ''}>Build</button>
                 <button class="btn btn-info" onclick="viewProjectLogs('${project.name}')" ${operationStatus.running ? '' : 'style="display:none;"'} id="view-logs-${project.name}">View Logs</button>
                 <button class="btn btn-info" onclick="openProjectInEditor('${project.name}')" title="Open in Cursor or VSCode" ${operationStatus.running ? 'disabled' : ''}>Open</button>`
            }
        </div>
    `;
    return card;
}

async function loadServices() {
    const grid = document.getElementById('services-grid');
    grid.innerHTML = '';

    try {
        const response = await fetch('/api/services');
        const result = await response.json();
        
        if (result.success && result.data) {
            result.data.forEach(service => {
                const card = createServiceCard(service);
                grid.appendChild(card);
            });
        } else {
            // Fallback to default services if API fails
            services.forEach(service => {
                const card = createServiceCard(service);
                grid.appendChild(card);
            });
        }
    } catch (error) {
        console.error('Failed to load services:', error);
        // Fallback to default services
        services.forEach(service => {
            const card = createServiceCard(service);
            grid.appendChild(card);
        });
    }
}

function createServiceCard(service) {
    const status = service.status || 'unknown';
    const statusClass = status === 'running' ? 'status-ok' : status === 'stopped' ? 'status-error' : 'status-info';
    const statusText = status === 'running' ? 'Running' : status === 'stopped' ? 'Stopped' : 'Unknown';
    
    const card = document.createElement('div');
    card.className = 'service-card';
    card.innerHTML = `
        <div class="card-header">
            <div class="card-title">${service.name}</div>
            <span class="status-badge ${statusClass}" id="service-status-${service.name}">${statusText}</span>
        </div>
        <div class="card-info">
            <div class="card-info-item">Port: ${service.port}</div>
            <div class="card-info-item">Status: ${statusText}</div>
        </div>
        <div class="card-actions">
            <button class="btn btn-success" onclick="startService('${service.name}')" ${status === 'running' ? 'disabled' : ''}>Start</button>
            <button class="btn btn-danger" onclick="stopService('${service.name}')" ${status === 'stopped' ? 'disabled' : ''}>Stop</button>
            <button class="btn btn-secondary" onclick="checkService('${service.name}', ${service.port})">Refresh</button>
            <button class="btn btn-info" onclick="viewServiceLogs('${service.name}')">View Logs</button>
        </div>
    `;
    
    return card;
}

async function checkService(name, port) {
    const badge = document.getElementById(`service-status-${name}`);
    if (!badge) {
        console.warn(`Service status badge not found for ${name}`);
        return;
    }
    
    badge.textContent = 'Checking...';
    badge.className = 'status-badge status-info';
    
    try {
        const response = await fetch('/api/services');
        const result = await response.json();
        
        if (result.success && result.data) {
            const service = result.data.find(s => s.name === name);
            if (service) {
                const status = service.status || 'unknown';
                badge.textContent = status === 'running' ? 'Running' : status === 'stopped' ? 'Stopped' : 'Unknown';
                badge.className = status === 'running' ? 'status-badge status-ok' : status === 'stopped' ? 'status-badge status-error' : 'status-badge status-info';
                
                // Update buttons
                const card = badge.closest('.service-card');
                if (card) {
                    const startBtn = card.querySelector('button[onclick*="startService"]');
                    const stopBtn = card.querySelector('button[onclick*="stopService"]');
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

async function startService(name) {
    addLog(`Starting ${name}...`, 'info');
    try {
        const response = await fetch(`/api/services/${name}/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const result = await response.json();
        
        if (result.success) {
            addLog(`${name} started successfully`, 'success');
            // Small delay to let Docker start the container
            setTimeout(() => {
                loadServices(); // Reload to update all cards
            }, 1000);
        } else {
            addLog(`Failed to start ${name}: ${result.message}`, 'error');
        }
    } catch (error) {
        addLog(`Error starting ${name}: ${error.message}`, 'error');
    }
}

async function stopService(name) {
    addLog(`Stopping ${name}...`, 'info');
    try {
        const response = await fetch(`/api/services/${name}/stop`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const result = await response.json();
        
        if (result.success) {
            addLog(`${name} stopped successfully`, 'success');
            // Small delay to let Docker stop the container
            setTimeout(() => {
                loadServices(); // Reload to update all cards
            }, 500);
        } else {
            addLog(`Failed to stop ${name}: ${result.message}`, 'error');
        }
    } catch (error) {
        addLog(`Error stopping ${name}: ${error.message}`, 'error');
    }
}

async function startAllServices() {
    addLog('Starting all services...', 'info');
    try {
        const response = await fetch('/api/services/all/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const result = await response.json();
        
        if (result.success) {
            addLog('All services started successfully', 'success');
            setTimeout(() => {
                loadServices();
            }, 2000);
        } else {
            addLog(`Failed to start services: ${result.message}`, 'error');
        }
    } catch (error) {
        addLog(`Error starting services: ${error.message}`, 'error');
    }
}

async function stopAllServices() {
    addLog('Stopping all services...', 'info');
    try {
        const response = await fetch('/api/services/all/stop', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const result = await response.json();
        
        if (result.success) {
            addLog('All services stopped successfully', 'success');
            setTimeout(() => {
                loadServices();
            }, 1000);
        } else {
            addLog(`Failed to stop services: ${result.message}`, 'error');
        }
    } catch (error) {
        addLog(`Error stopping services: ${error.message}`, 'error');
    }
}

async function updateProject(projectName) {
    addLog(`Updating ${projectName}...`, 'info');
    try {
        const response = await fetch(`/api/projects/${projectName}/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const result = await response.json();
        
        if (result.success) {
            addLog(`${projectName} updated successfully`, 'success');
            loadProjects();
        } else {
            addLog(`Failed to update ${projectName}: ${result.message}`, 'error');
        }
    } catch (error) {
        addLog(`Error updating ${projectName}: ${error.message}`, 'error');
    }
}

async function testProject(projectName) {
    // Don't add to recent activity - this is a build/test operation
    // Start the operation (non-blocking)
    try {
        const response = await fetch(`/api/projects/${projectName}/test`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const result = await response.json();
        
        if (result.success) {
            // Initialize operation status
            projectOperationStatus[projectName] = { type: 'test', running: true };
            projectLogs[projectName] = [];
            
            // Update UI to show running status
            updateProjectCardOperationStatus(projectName);
            
            // Start streaming logs
            startProjectOperationStream(projectName, 'test');
        } else {
            addLog(`Failed to start tests for ${projectName}: ${result.message}`, 'error');
        }
    } catch (error) {
        addLog(`Error starting tests for ${projectName}: ${error.message}`, 'error');
    }
}

async function buildProject(projectName) {
    // Don't add to recent activity - this is a build/test operation
    // Start the operation (non-blocking)
    try {
        const response = await fetch(`/api/projects/${projectName}/build`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const result = await response.json();
        
        if (result.success) {
            // Initialize operation status
            projectOperationStatus[projectName] = { type: 'build', running: true };
            projectLogs[projectName] = [];
            
            // Update UI to show running status
            updateProjectCardOperationStatus(projectName);
            
            // Start streaming logs
            startProjectOperationStream(projectName, 'build');
        } else {
            addLog(`Failed to start build for ${projectName}: ${result.message}`, 'error');
        }
    } catch (error) {
        addLog(`Error starting build for ${projectName}: ${error.message}`, 'error');
    }
}

async function cloneProject(projectName) {
    addLog(`Cloning ${projectName}...`, 'info');
    try {
        const response = await fetch(`/api/projects/${projectName}/clone`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const result = await response.json();
        
        if (result.success) {
            addLog(result.message || `${projectName} cloned successfully`, 'success');
            // Reload projects to update the UI
            setTimeout(() => {
                loadProjects();
            }, 500);
        } else {
            addLog(`Failed to clone ${projectName}: ${result.message}`, 'error');
        }
    } catch (error) {
        addLog(`Error cloning ${projectName}: ${error.message}`, 'error');
    }
}

async function openProjectInEditor(projectName) {
    addLog(`Opening ${projectName} in editor...`, 'info');
    try {
        const response = await fetch(`/api/projects/${projectName}/open`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const result = await response.json();
        
        if (result.success) {
            addLog(result.message || `${projectName} opened in editor`, 'success');
        } else {
            addLog(`Failed to open ${projectName}: ${result.message}`, 'error');
        }
    } catch (error) {
        addLog(`Error opening ${projectName}: ${error.message}`, 'error');
    }
}

function addLog(message, type = 'info') {
    const container = document.getElementById('logs-container');
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    container.insertBefore(entry, container.firstChild);
    
    // Keep only last 50 entries
    while (container.children.length > 50) {
        container.removeChild(container.lastChild);
    }
}

let pollingInterval = null;
let pollingEnabled = false;

function startPolling() {
    // Only poll if enabled (user can toggle)
    if (pollingEnabled && !pollingInterval) {
        // Poll for updates every 30 seconds (less aggressive)
        pollingInterval = setInterval(() => {
            loadProjects();
            loadServices();
        }, 30000);
    }
}

function stopPolling() {
    if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
    }
}

function togglePolling() {
    pollingEnabled = !pollingEnabled;
    if (pollingEnabled) {
        startPolling();
        addLog('Auto-refresh enabled', 'success');
    } else {
        stopPolling();
        addLog('Auto-refresh disabled', 'info');
    }
    updatePollingButton();
}

function updatePollingButton() {
    const btn = document.getElementById('polling-toggle');
    if (btn) {
        btn.textContent = pollingEnabled ? 'Disable Auto-refresh' : 'Enable Auto-refresh';
        btn.className = pollingEnabled ? 'btn btn-secondary' : 'btn btn-secondary';
    }
}

let currentServiceName = null;
let eventSource = null;
let logsPaused = false;

async function viewServiceLogs(serviceName) {
    currentServiceName = serviceName;
    const modal = document.getElementById('logs-modal');
    const modalTitle = document.getElementById('logs-modal-title');
    const logsContent = document.getElementById('logs-content');
    const connectionStatus = document.getElementById('connection-status');
    
    modalTitle.textContent = `${serviceName} Logs`;
    logsContent.textContent = 'Connecting...';
    modal.style.display = 'flex';
    
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
    eventSource = new EventSource(`/api/services/${serviceName}/logs/stream`);
    logsPaused = false;
    
    // Reset pause button
    const pauseBtn = document.getElementById('pause-logs-btn');
    if (pauseBtn) {
        pauseBtn.textContent = 'Pause';
    }
    
    // Handle incoming log messages
    eventSource.onmessage = (event) => {
        if (!logsPaused) {
            const logsContent = document.getElementById('logs-content');
            // Append new line
            if (logsContent.textContent === 'Connecting...' || logsContent.textContent === '') {
                logsContent.textContent = event.data;
            } else {
                logsContent.textContent += '\n' + event.data;
            }
            // Auto-scroll to bottom
            logsContent.scrollTop = logsContent.scrollHeight;
        }
        
        // Update connection status to connected
        if (connectionStatus) {
            connectionStatus.textContent = 'Connected';
            connectionStatus.className = 'connection-status connected';
        }
    };
    
    // Handle connection opened
    eventSource.onopen = () => {
        const logsContent = document.getElementById('logs-content');
        if (logsContent.textContent === 'Connecting...') {
            logsContent.textContent = '';
        }
        
        if (connectionStatus) {
            connectionStatus.textContent = 'Connected';
            connectionStatus.className = 'connection-status connected';
        }
    };
    
    // Handle connection errors
    eventSource.onerror = (error) => {
        const logsContent = document.getElementById('logs-content');
        const connectionStatus = document.getElementById('connection-status');
        
        if (eventSource.readyState === EventSource.CLOSED) {
            // Connection closed
            if (connectionStatus) {
                connectionStatus.textContent = 'Disconnected';
                connectionStatus.className = 'connection-status disconnected';
            }
            
            if (logsContent.textContent === 'Connecting...' || logsContent.textContent === '') {
                logsContent.textContent = 'Connection closed. Service may not be running.';
            }
        } else {
            // Connection error
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

function refreshServiceLogs() {
    // For SSE, refresh means reconnect
    if (currentServiceName) {
        viewServiceLogs(currentServiceName);
    }
}

function toggleLogsPause() {
    logsPaused = !logsPaused;
    const pauseBtn = document.getElementById('pause-logs-btn');
    if (pauseBtn) {
        pauseBtn.textContent = logsPaused ? 'Resume' : 'Pause';
    }
}

function closeLogsModal() {
    const modal = document.getElementById('logs-modal');
    modal.style.display = 'none';
    
    // Close EventSource connection
    if (eventSource) {
        eventSource.close();
        eventSource = null;
    }
    
    currentServiceName = null;
    logsPaused = false;
}

let projectEventSources = {}; // Track event sources per project
let currentProjectLogs = null;

function startProjectOperationStream(projectName, operationType) {
    // Close any existing connection for this project
    if (projectEventSources[projectName]) {
        projectEventSources[projectName].close();
        delete projectEventSources[projectName];
    }
    
    // Initialize logs array if needed
    if (!projectLogs[projectName]) {
        projectLogs[projectName] = [];
    }
    
    // Create EventSource connection
    const eventSource = new EventSource(`/api/projects/${projectName}/${operationType}/stream`);
    projectEventSources[projectName] = eventSource;
    
    // Handle incoming log messages
    eventSource.onmessage = (event) => {
        const line = event.data;
        projectLogs[projectName].push(line);
        
        // If logs modal is open for this project, update it
        if (currentProjectLogs === projectName) {
            const logsContent = document.getElementById('project-logs-content');
            if (logsContent) {
                if (logsContent.textContent === 'Connecting...' || logsContent.textContent === '') {
                    logsContent.textContent = line;
                } else {
                    logsContent.textContent += '\n' + line;
                }
                logsContent.scrollTop = logsContent.scrollHeight;
            }
        }
        
        // Check if operation completed
        if (line.includes('[COMPLETE]')) {
            projectOperationStatus[projectName].running = false;
            projectOperationStatus[projectName].completed = true;
            updateProjectCardOperationStatus(projectName);
            eventSource.close();
            delete projectEventSources[projectName];
        }
    };
    
    // Handle connection errors
    eventSource.onerror = (error) => {
        if (eventSource.readyState === EventSource.CLOSED) {
            projectOperationStatus[projectName].running = false;
            updateProjectCardOperationStatus(projectName);
            delete projectEventSources[projectName];
        }
    };
}

function updateProjectCardOperationStatus(projectName) {
    const card = document.getElementById(`project-card-${projectName}`);
    if (!card) {
        // Card might not be loaded yet, reload projects
        loadProjects();
        return;
    }
    
    const operationStatus = projectOperationStatus[projectName] || { type: null, running: false, completed: false };
    
    // Update operation status badge
    let statusBadge = card.querySelector('.operation-status');
    if (operationStatus.running) {
        if (!statusBadge) {
            const cardInfo = card.querySelector('.card-info');
            statusBadge = document.createElement('div');
            statusBadge.className = 'card-info-item operation-status';
            cardInfo.appendChild(statusBadge);
        }
        statusBadge.innerHTML = `
            <span class="operation-badge ${operationStatus.type === 'test' ? 'operation-test' : 'operation-build'}">
                ${operationStatus.type === 'test' ? 'Testing...' : 'Building...'}
            </span>
        `;
    } else if (operationStatus.completed) {
        // Show completed status briefly, then remove
        if (!statusBadge) {
            const cardInfo = card.querySelector('.card-info');
            statusBadge = document.createElement('div');
            statusBadge.className = 'card-info-item operation-status';
            cardInfo.appendChild(statusBadge);
        }
        const success = projectLogs[projectName] && projectLogs[projectName].some(log => log.includes('[COMPLETE]') && log.includes('successfully'));
        statusBadge.innerHTML = `
            <span class="operation-badge ${success ? 'status-ok' : 'status-error'}" style="animation: none;">
                ${operationStatus.type === 'test' ? 'Test' : 'Build'} ${success ? 'Completed' : 'Failed'}
            </span>
        `;
        // Remove status badge after 3 seconds
        setTimeout(() => {
            if (statusBadge && statusBadge.parentNode) {
                statusBadge.remove();
            }
            // Clear completed flag
            if (projectOperationStatus[projectName]) {
                projectOperationStatus[projectName].completed = false;
            }
        }, 3000);
    } else {
        if (statusBadge) {
            statusBadge.remove();
        }
    }
    
    // Update buttons
    const buttons = card.querySelectorAll('.card-actions button');
    buttons.forEach(btn => {
        if (btn.onclick && (btn.onclick.toString().includes('testProject') || 
            btn.onclick.toString().includes('buildProject') ||
            btn.onclick.toString().includes('updateProject') ||
            btn.onclick.toString().includes('openProjectInEditor'))) {
            btn.disabled = operationStatus.running;
        }
    });
    
    // Show view logs button if operation is running or has logs
    const viewLogsBtn = document.getElementById(`view-logs-${projectName}`);
    if (viewLogsBtn) {
        const hasLogs = projectLogs[projectName] && projectLogs[projectName].length > 0;
        viewLogsBtn.style.display = (operationStatus.running || hasLogs) ? 'inline-block' : 'none';
    }
}

function viewProjectLogs(projectName) {
    currentProjectLogs = projectName;
    const modal = document.getElementById('project-logs-modal');
    const modalTitle = document.getElementById('project-logs-modal-title');
    const logsContent = document.getElementById('project-logs-content');
    
    const operationStatus = projectOperationStatus[projectName] || { type: null, running: false };
    const operationType = operationStatus.type === 'test' ? 'Test' : operationStatus.type === 'build' ? 'Build' : 'Operation';
    
    modalTitle.textContent = `${projectName} - ${operationType} Logs`;
    modal.style.display = 'flex';
    
    // Display existing logs
    if (projectLogs[projectName] && projectLogs[projectName].length > 0) {
        logsContent.textContent = projectLogs[projectName].join('\n');
        logsContent.scrollTop = logsContent.scrollHeight;
    } else {
        logsContent.textContent = 'No logs yet. Waiting for output...';
    }
    
    // If operation is running and we don't have a stream, start it
    if (operationStatus.running && !projectEventSources[projectName]) {
        startProjectOperationStream(projectName, operationStatus.type);
    }
}

function closeProjectLogsModal() {
    const modal = document.getElementById('project-logs-modal');
    modal.style.display = 'none';
    currentProjectLogs = null;
}

// Make functions available globally
window.updateProject = updateProject;
window.testProject = testProject;
window.buildProject = buildProject;
window.checkService = checkService;
window.startService = startService;
window.stopService = stopService;
window.startAllServices = startAllServices;
window.stopAllServices = stopAllServices;
window.togglePolling = togglePolling;
window.viewServiceLogs = viewServiceLogs;
window.closeLogsModal = closeLogsModal;
window.refreshServiceLogs = refreshServiceLogs;
window.toggleLogsPause = toggleLogsPause;
window.openProjectInEditor = openProjectInEditor;
window.cloneProject = cloneProject;
window.viewProjectLogs = viewProjectLogs;
window.closeProjectLogsModal = closeProjectLogsModal;
