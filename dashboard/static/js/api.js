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
    open: (name) => apiRequest(`/projects/${name}/open`, { method: 'POST' }),
    createTag: (name, body) => apiRequest(`/projects/${name}/tag`, {
        method: 'POST',
        body: JSON.stringify({ tag: body.tag, message: body.message || '', push: body.push || false })
    }),
    listTags: (name) => apiRequest(`/projects/${name}/tags`),
    getStream: (name, operation) => {
        return new EventSource(`${API_BASE}/projects/${name}/${operation}/stream`);
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
