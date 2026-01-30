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
    
    grid.innerHTML = '<div class="skeleton skeleton-placeholder"></div>';
    
    try {
        const result = await projectsAPI.list();
        
        if (result.success && result.data) {
            grid.innerHTML = '';
            if (result.data.length === 0) {
                grid.innerHTML = '<div class="empty-state">No projects configured. Add projects to the DevKit to see them here.</div>';
            } else {
                result.data.forEach(project => {
                    if (projectOperationStatus[project.name]) {
                        project.operationStatus = projectOperationStatus[project.name];
                    }
                    const card = createProjectCard(project, project.operationStatus);
                    grid.appendChild(card);
                });
            }
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
            <span class="operation-badge ${success ? 'status-ok' : 'status-error'} operation-badge-done">
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
    
    // Update buttons (disable by data-action when operation is running)
    const disableWhenRunning = ['project:test', 'project:build', 'project:update', 'project:open', 'project:createTag'];
    const buttons = card.querySelectorAll('.card-actions button[data-action]');
    buttons.forEach(btn => {
        if (disableWhenRunning.includes(btn.dataset.action)) {
            btn.disabled = opStatus.running;
        }
    });
    
    // Show view logs button
    const viewLogsBtn = document.getElementById(`view-logs-${projectName}`);
    if (viewLogsBtn) {
        const hasLogs = projectLogs[projectName] && projectLogs[projectName].length > 0;
        viewLogsBtn.style.display = (opStatus.running || hasLogs) ? 'flex' : 'none';
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

/**
 * Open create tag modal for a project
 */
export function openCreateTagModal(projectName, commit = '-') {
    const modal = document.getElementById('create-tag-modal');
    const titleEl = document.getElementById('create-tag-modal-title');
    const commitEl = document.getElementById('create-tag-commit');
    const tagInput = document.getElementById('create-tag-name');
    const messageInput = document.getElementById('create-tag-message');
    const pushCheckbox = document.getElementById('create-tag-push');
    const errorEl = document.getElementById('create-tag-error');

    if (!modal || !titleEl || !tagInput) return;

    modal.dataset.projectName = projectName;
    titleEl.textContent = `Create release tag – ${projectName}`;
    if (commitEl) commitEl.textContent = commit;
    tagInput.value = '';
    messageInput.value = '';
    if (pushCheckbox) pushCheckbox.checked = false;
    if (errorEl) { errorEl.textContent = ''; errorEl.classList.add('is-hidden'); }

    modalManager.show('create-tag-modal');
    tagInput.focus();

    loadProjectTags(projectName).then(tags => {
        const listEl = document.getElementById('create-tag-existing-list');
        if (listEl) {
            if (tags && tags.length > 0) {
                listEl.innerHTML = tags.map(t => `<span class="tag-pill">${t}</span>`).join(' ');
                listEl.classList.remove('is-hidden');
            } else {
                listEl.innerHTML = '';
                listEl.classList.add('is-hidden');
            }
        }
    }).catch(() => {});
}

/**
 * Load existing tags for a project
 */
export async function loadProjectTags(projectName) {
    const result = await projectsAPI.listTags(projectName);
    return (result.success && result.data && result.data.tags) ? result.data.tags : [];
}

/**
 * Create release tag (called from modal)
 */
export async function createReleaseTag(projectName, tagName, message, push) {
    const errorEl = document.getElementById('create-tag-error');
    const createBtn = document.getElementById('create-tag-submit');

    const showError = (msg) => {
        if (errorEl) {
            errorEl.textContent = msg;
            errorEl.classList.remove('is-hidden');
        }
        addLog(msg, 'error');
    };

    tagName = (tagName || '').trim();
    if (!tagName) {
        showError('Tag name is required.');
        return;
    }

    if (createBtn) createBtn.disabled = true;
    addLog(`Creating tag ${tagName} for ${projectName}...`, 'info');

    try {
        const result = await projectsAPI.createTag(projectName, { tag: tagName, message: (message || '').trim(), push: !!push });
        if (result.success) {
            addLog(result.message || `Tag ${tagName} created`, 'success');
            modalManager.hide('create-tag-modal');
            loadProjects();
        } else {
            showError(result.message || 'Failed to create tag');
        }
    } catch (error) {
        showError(error.message || 'Failed to create tag');
    } finally {
        if (createBtn) createBtn.disabled = false;
    }
}

/**
 * Submit create tag form (called from modal button)
 */
export function submitCreateTagForm() {
    const modal = document.getElementById('create-tag-modal');
    const tagInput = document.getElementById('create-tag-name');
    const messageInput = document.getElementById('create-tag-message');
    const pushCheckbox = document.getElementById('create-tag-push');
    if (!modal || !tagInput) return;
    const projectName = modal.dataset.projectName;
    if (!projectName) return;
    createReleaseTag(projectName, tagInput.value, messageInput?.value, pushCheckbox?.checked);
}

/**
 * Close create tag modal
 */
export function closeCreateTagModal() {
    modalManager.hide('create-tag-modal');
}
