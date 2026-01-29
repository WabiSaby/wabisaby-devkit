// Log management

import { formatTime } from './utils.js';

/**
 * Log manager
 */
class LogManager {
    constructor() {
        this.logs = [];
        this.maxLogs = 50;
    }

    /**
     * Add log entry
     */
    add(message, type = 'info') {
        const entry = {
            message,
            type,
            timestamp: new Date(),
            id: Date.now() + Math.random()
        };
        
        this.logs.unshift(entry);
        
        // Keep only last N entries
        if (this.logs.length > this.maxLogs) {
            this.logs = this.logs.slice(0, this.maxLogs);
        }
        
        this.render();
        return entry;
    }

    /**
     * Clear logs
     */
    clear() {
        this.logs = [];
        this.render();
    }

    /**
     * Render logs to container
     */
    render() {
        const container = document.getElementById('logs-container');
        if (!container) return;
        
        container.innerHTML = '';
        
        if (this.logs.length === 0) {
            container.innerHTML = '<div class="log-entry">No activity yet</div>';
            return;
        }
        
        this.logs.forEach(entry => {
            const logEl = document.createElement('div');
            logEl.className = `log-entry ${entry.type}`;
            logEl.textContent = `[${formatTime(entry.timestamp)}] ${entry.message}`;
            container.appendChild(logEl);
        });
    }
}

export const logManager = new LogManager();

/**
 * Add log (convenience function)
 */
export function addLog(message, type = 'info') {
    return logManager.add(message, type);
}
