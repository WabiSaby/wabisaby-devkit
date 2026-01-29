// UI utilities and helpers

/**
 * Theme management
 */
class ThemeManager {
    constructor() {
        this.theme = localStorage.getItem('theme') || 'light';
    }

    init() {
        document.documentElement.setAttribute('data-theme', this.theme);
        this.updateToggle();
    }

    toggle() {
        this.theme = this.theme === 'dark' ? 'light' : 'dark';
        localStorage.setItem('theme', this.theme);
        this.init();
    }

    updateToggle() {
        const toggle = document.getElementById('theme-toggle');
        if (toggle) {
            toggle.textContent = this.theme === 'dark' ? 'Light Mode' : 'Dark Mode';
        }
    }
}

export const themeManager = new ThemeManager();

/**
 * Polling manager
 */
class PollingManager {
    constructor() {
        this.interval = null;
        this.enabled = false;
        this.callbacks = [];
    }

    start(callback, interval = 30000) {
        if (this.enabled && !this.interval) {
            this.callbacks.push(callback);
            this.interval = setInterval(() => {
                this.callbacks.forEach(cb => cb());
            }, interval);
        }
    }

    stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
        this.callbacks = [];
    }

    toggle(callback, interval = 30000) {
        this.enabled = !this.enabled;
        if (this.enabled) {
            this.start(callback, interval);
        } else {
            this.stop();
        }
        this.updateButton();
        return this.enabled;
    }

    updateButton() {
        const btn = document.getElementById('polling-toggle');
        if (btn) {
            btn.textContent = this.enabled ? 'Disable Auto-refresh' : 'Enable Auto-refresh';
        }
    }
}

export const pollingManager = new PollingManager();

/**
 * Initialize UI
 */
export function initUI() {
    themeManager.init();
    pollingManager.updateButton();
}
