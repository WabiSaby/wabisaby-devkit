// UI utilities and helpers

/** Sun icon SVG for "switch to light" (shown in dark mode) */
const ICON_SUN = `<svg class="theme-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>`;
/** Moon icon SVG for "switch to dark" (shown in light mode) */
const ICON_MOON = `<svg class="theme-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;

/**
 * Theme management: respects system preference when no choice is saved.
 */
class ThemeManager {
    constructor() {
        this.mediaQuery = typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)');
    }

    getStoredTheme() {
        const t = localStorage.getItem('theme');
        return t === 'dark' || t === 'light' ? t : null;
    }

    getPreferredTheme() {
        const stored = this.getStoredTheme();
        if (stored) return stored;
        if (this.mediaQuery && this.mediaQuery.matches) return 'dark';
        return 'light';
    }

    get theme() {
        return this.getPreferredTheme();
    }

    set theme(value) {
        if (value === 'dark' || value === 'light') {
            localStorage.setItem('theme', value);
        }
    }

    init() {
        const theme = this.getPreferredTheme();
        document.documentElement.setAttribute('data-theme', theme);
        this.updateToggle();
        this._listenSystemTheme();
    }

    _listenSystemTheme() {
        if (!this.mediaQuery) return;
        this.mediaQuery.addEventListener('change', () => {
            if (this.getStoredTheme() !== null) return;
            const theme = this.mediaQuery.matches ? 'dark' : 'light';
            document.documentElement.setAttribute('data-theme', theme);
            this.updateToggle();
        });
    }

    toggle() {
        const next = this.getPreferredTheme() === 'dark' ? 'light' : 'dark';
        this.theme = next;
        document.documentElement.setAttribute('data-theme', next);
        this.updateToggle();
    }

    updateToggle() {
        const toggle = document.getElementById('theme-toggle');
        if (!toggle) return;
        const isDark = this.getPreferredTheme() === 'dark';
        toggle.innerHTML = isDark ? ICON_SUN : ICON_MOON;
        toggle.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
        toggle.title = isDark ? 'Switch to light mode' : 'Switch to dark mode';
        toggle.setAttribute('data-theme-current', isDark ? 'dark' : 'light');
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
