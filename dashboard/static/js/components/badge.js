// Badge component

import { createIcon } from '../utils.js';

/**
 * Create status badge
 */
export function createStatusBadge(status, text = null) {
    const badge = document.createElement('span');
    badge.className = `status-badge status-${getStatusClass(status)}`;
    
    const statusText = text || getStatusText(status);
    badge.textContent = statusText;
    
    // Add icon if available
    const icon = getStatusIcon(status);
    if (icon) {
        const iconEl = createIcon(icon, 'icon icon-sm');
        badge.insertBefore(iconEl, badge.firstChild);
    }
    
    return badge;
}

/**
 * Create operation badge
 */
export function createOperationBadge(type, text = null) {
    const badge = document.createElement('span');
    badge.className = `operation-badge operation-${type}`;
    
    const badgeText = text || (type === 'test' ? 'Testing...' : 'Building...');
    badge.textContent = badgeText;
    
    return badge;
}

/**
 * Get status class name
 */
function getStatusClass(status) {
    const statusMap = {
        'clean': 'ok',
        'dirty': 'warning',
        'not-cloned': 'error',
        'running': 'ok',
        'stopped': 'error',
        'unknown': 'info'
    };
    return statusMap[status] || 'info';
}

/**
 * Get status text
 */
function getStatusText(status) {
    const textMap = {
        'clean': 'Clean',
        'dirty': 'Dirty',
        'not-cloned': 'Not Cloned',
        'running': 'Running',
        'stopped': 'Stopped',
        'unknown': 'Unknown'
    };
    return textMap[status] || 'Unknown';
}

/**
 * Get status icon name
 */
function getStatusIcon(status) {
    const iconMap = {
        'clean': 'check',
        'dirty': 'x',
        'not-cloned': 'folder',
        'running': 'play',
        'stopped': 'stop'
    };
    return iconMap[status] || null;
}
