// API communication functions

const API_BASE = '/api';

/**
 * Generic API request
 */
async function apiRequest(endpoint, options = {}) {
    const url = `${API_BASE}${endpoint}`;
    const config = {
        headers: {
            'Content-Type': 'application/json',
            ...options.headers
        },
        ...options
    };

    try {
        const response = await fetch(url, config);
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.message || `HTTP error! status: ${response.status}`);
        }
        
        return data;
    } catch (error) {
        console.error(`API request failed: ${endpoint}`, error);
        throw error;
    }
}

/**
 * Projects API
 */
export const projectsAPI = {
    list: () => apiRequest('/projects'),
    clone: (name) => apiRequest(`/projects/${name}/clone`, { method: 'POST' }),
    update: (name) => apiRequest(`/projects/${name}/update`, { method: 'POST' }),
    test: (name) => apiRequest(`/projects/${name}/test`, { method: 'POST' }),
    build: (name) => apiRequest(`/projects/${name}/build`, { method: 'POST' }),
    format: (name) => apiRequest(`/projects/${name}/format`, { method: 'POST' }),
    lint: (name) => apiRequest(`/projects/${name}/lint`, { method: 'POST' }),
    open: (name) => apiRequest(`/projects/${name}/open`, { method: 'POST' }),
    createTag: (name, body) => apiRequest(`/projects/${name}/tag`, {
        method: 'POST',
        body: JSON.stringify({ tag: body.tag, message: body.message || '', push: body.push || false })
    }),
    listTags: (name) => apiRequest(`/projects/${name}/tags`),
    getStream: (name, operation) => {
        return new EventSource(`${API_BASE}/projects/${name}/${operation}/stream`);
    },
    getBulkStream: (action) => {
        return new EventSource(`${API_BASE}/projects/bulk/${action}/stream`);
    }
};

/**
 * Services API
 */
export const servicesAPI = {
    list: () => apiRequest('/services'),
    start: (name) => apiRequest(`/services/${name}/start`, { method: 'POST' }),
    stop: (name) => apiRequest(`/services/${name}/stop`, { method: 'POST' }),
    startAll: () => apiRequest('/services/all/start', { method: 'POST' }),
    stopAll: () => apiRequest('/services/all/stop', { method: 'POST' }),
    getLogsStream: (name) => {
        return new EventSource(`${API_BASE}/services/${name}/logs/stream`);
    }
};

/**
 * Status API
 */
export const statusAPI = {
    check: () => apiRequest('/status')
};

/**
 * Submodule sync API
 */
export const submoduleAPI = {
    getSyncStatus: () => apiRequest('/submodule/sync-status'),
    sync: (body = {}) => apiRequest('/submodule/sync', {
        method: 'POST',
        body: JSON.stringify({ message: body.message || '' })
    })
};

/**
 * Backend (WabiSaby-Go) API
 */
export const backendAPI = {
    // Services
    listServices: () => apiRequest('/backend/services'),
    getHealth: (name) => apiRequest(`/backend/services/${name}/health`),
    startService: (name) => apiRequest(`/backend/services/${name}/start`, { method: 'POST' }),
    stopService: (name) => apiRequest(`/backend/services/${name}/stop`, { method: 'POST' }),
    startGroup: (group) => apiRequest(`/backend/services/group/${group}/start`, { method: 'POST' }),
    stopGroup: (group) => apiRequest(`/backend/services/group/${group}/stop`, { method: 'POST' }),
    getServiceLogsStream: (name) => new EventSource(`${API_BASE}/backend/services/${name}/logs/stream`),

    // Migrations
    getMigrationStatus: () => apiRequest('/backend/migrations'),
    migrateUp: () => apiRequest('/backend/migrations/up', { method: 'POST' }),
    migrateDown: () => apiRequest('/backend/migrations/down', { method: 'POST' }),
    getMigrationStream: (action) => new EventSource(`${API_BASE}/backend/migrations/${action}/stream`),

    // Environment
    getEnvStatus: () => apiRequest('/backend/env'),
    copyEnvExample: () => apiRequest('/backend/env/copy-example', { method: 'POST' }),
    validateEnv: () => apiRequest('/backend/env/validate')
};
