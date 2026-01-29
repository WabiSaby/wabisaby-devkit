// Project management

import { projectsAPI } from './api.js';
import { createProjectCard } from './components/card.js';
import { addLog } from './logs.js';
import { modalManager } from './components/modal.js';

// State
export const projectOperationStatus = {};
export const projectLogs = {};
const projectEventSources = {};

/**
 * Load projects
 */
export async function loadProjects() {
    const grid = document.getElementById('projects-grid');
    if (!grid) return;
    
    grid.innerHTML = '<div class="skeleton" style="height: 200px;"></div>';
    
    try {
        const result = await projectsAPI.list();
        
        if (result.success && result.data) {
            grid.innerHTML = '';
            result.data.forEach(project => {
                // Merge with existing operation status
                if (projectOperationStatus[project.name]) {
                    project.operationStatus = projectOperationStatus[project.name];
                }
                const card = createProjectCard(project, project.operationStatus);
                grid.appendChild(card);
            });
        }
    } catch (error) {
        console.error('Failed to load projects:', error);
        addLog('Failed to load projects', 'error');
        grid.innerHTML = '<div class="log-entry error">Failed to load projects</div>';
    }
}

/**
 * Clone project
 */
export async function cloneProject(projectName) {
    addLog(`Cloning ${projectName}...`, 'info');
    try {
        const result = await projectsAPI.clone(projectName);
        
        if (result.success) {
            addLog(result.message || `${projectName} cloned successfully`, 'success');
            setTimeout(() => loadProjects(), 500);
        } else {
            addLog(`Failed to clone ${projectName}: ${result.message}`, 'error');
        }
    } catch (error) {
        addLog(`Error cloning ${projectName}: ${error.message}`, 'error');
    }
}

/**
 * Update project
 */
export async function updateProject(projectName) {
    addLog(`Updating ${projectName}...`, 'info');
    try {
        const result = await projectsAPI.update(projectName);
        
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

/**
 * Test project
 */
export async function testProject(projectName) {
    try {
        const result = await projectsAPI.test(projectName);
        
        if (result.success) {
            // Initialize operation status
            projectOperationStatus[projectName] = { type: 'test', running: true };
            projectLogs[projectName] = [];
            
            // Update UI
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

/**
 * Build project
 */
export async function buildProject(projectName) {
    try {
        const result = await projectsAPI.build(projectName);
        
        if (result.success) {
            // Initialize operation status
            projectOperationStatus[projectName] = { type: 'build', running: true };
            projectLogs[projectName] = [];
            
            // Update UI
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

/**
 * Open project in editor
 */
export async function openProjectInEditor(projectName) {
    addLog(`Opening ${projectName} in editor...`, 'info');
    try {
        const result = await projectsAPI.open(projectName);
        
        if (result.success) {
            addLog(result.message || `${projectName} opened in editor`, 'success');
        } else {
            addLog(`Failed to open ${projectName}: ${result.message}`, 'error');
        }
    } catch (error) {
        addLog(`Error opening ${projectName}: ${error.message}`, 'error');
    }
}

/**
 * Start project operation stream
 */
function startProjectOperationStream(projectName, operationType) {
    // Close any existing connection
    if (projectEventSources[projectName]) {
        projectEventSources[projectName].close();
        delete projectEventSources[projectName];
    }
    
    // Initialize logs array
    if (!projectLogs[projectName]) {
        projectLogs[projectName] = [];
    }
    
    // Create EventSource connection
    const eventSource = projectsAPI.getStream(projectName, operationType);
    projectEventSources[projectName] = eventSource;
    
    // Handle incoming log messages
    eventSource.onmessage = (event) => {
        const line = event.data;
        projectLogs[projectName].push(line);
        
        // If logs modal is open, update it
        const modal = document.getElementById('project-logs-modal');
        if (modal && modal.style.display === 'flex') {
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
    eventSource.onerror = () => {
        if (eventSource.readyState === EventSource.CLOSED) {
            projectOperationStatus[projectName].running = false;
            updateProjectCardOperationStatus(projectName);
            delete projectEventSources[projectName];
        }
    };
}

/**
 * Update project card operation status
 */
export function updateProjectCardOperationStatus(projectName) {
    const card = document.getElementById(`project-card-${projectName}`);
    if (!card) {
        loadProjects();
        return;
    }
    
    const opStatus = projectOperationStatus[projectName] || { type: null, running: false, completed: false };
    
    // Update operation status badge
    let statusBadge = card.querySelector('.operation-status');
    if (opStatus.running) {
        if (!statusBadge) {
            const cardInfo = card.querySelector('.card-info');
            statusBadge = document.createElement('div');
            statusBadge.className = 'card-info-item operation-status';
            cardInfo.appendChild(statusBadge);
        }
        import('./components/badge.js').then(({ createOperationBadge }) => {
            statusBadge.innerHTML = '';
            statusBadge.appendChild(createOperationBadge(opStatus.type));
        });
    } else if (opStatus.completed) {
        if (!statusBadge) {
            const cardInfo = card.querySelector('.card-info');
            statusBadge = document.createElement('div');
            statusBadge.className = 'card-info-item operation-status';
            cardInfo.appendChild(statusBadge);
        }
        const success = projectLogs[projectName]?.some(log => log.includes('[COMPLETE]') && log.includes('successfully'));
        statusBadge.innerHTML = `
            <span class="operation-badge ${success ? 'status-ok' : 'status-error'}" style="animation: none;">
                ${opStatus.type === 'test' ? 'Test' : 'Build'} ${success ? 'Completed' : 'Failed'}
            </span>
        `;
        setTimeout(() => {
            if (statusBadge && statusBadge.parentNode) {
                statusBadge.remove();
            }
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
        const onclick = btn.getAttribute('onclick') || btn.onclick?.toString() || '';
        if (onclick.includes('testProject') || onclick.includes('buildProject') || 
            onclick.includes('updateProject') || onclick.includes('openProjectInEditor')) {
            btn.disabled = opStatus.running;
        }
    });
    
    // Show view logs button
    const viewLogsBtn = document.getElementById(`view-logs-${projectName}`);
    if (viewLogsBtn) {
        const hasLogs = projectLogs[projectName] && projectLogs[projectName].length > 0;
        viewLogsBtn.style.display = (opStatus.running || hasLogs) ? 'inline-flex' : 'none';
    }
}

/**
 * View project logs
 */
export function viewProjectLogs(projectName) {
    const modal = document.getElementById('project-logs-modal');
    const modalTitle = document.getElementById('project-logs-modal-title');
    const logsContent = document.getElementById('project-logs-content');
    
    if (!modal || !modalTitle || !logsContent) return;
    
    const opStatus = projectOperationStatus[projectName] || { type: null, running: false };
    const operationType = opStatus.type === 'test' ? 'Test' : opStatus.type === 'build' ? 'Build' : 'Operation';
    
    modalTitle.textContent = `${projectName} - ${operationType} Logs`;
    modalManager.show('project-logs-modal');
    
    // Display existing logs
    if (projectLogs[projectName] && projectLogs[projectName].length > 0) {
        logsContent.textContent = projectLogs[projectName].join('\n');
        logsContent.scrollTop = logsContent.scrollHeight;
    } else {
        logsContent.textContent = 'No logs yet. Waiting for output...';
    }
    
    // If operation is running and we don't have a stream, start it
    if (opStatus.running && !projectEventSources[projectName]) {
        startProjectOperationStream(projectName, opStatus.type);
    }
}

/**
 * Close project logs modal
 */
export function closeProjectLogsModal() {
    modalManager.hide('project-logs-modal');
}
