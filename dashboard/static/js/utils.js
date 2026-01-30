// Utility functions

/**
 * Load SVG icon from assets
 */
export async function loadIcon(name) {
    try {
        const response = await fetch(`/assets/icons/${name}.svg`);
        if (response.ok) {
            return await response.text();
        }
    } catch (error) {
        console.warn(`Failed to load icon ${name}:`, error);
    }
    return null;
}

/**
 * Create SVG icon element
 */
export function createIcon(name, className = 'icon') {
    const icon = document.createElement('span');
    icon.className = className;
    icon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${getIconPath(name)}</svg>`;
    return icon;
}

/**
 * Get icon path data (inline SVG paths for common icons)
 */
function getIconPath(name) {
    const icons = {
        refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M3 21v-5h5"/>',
        play: '<path d="M8 5v14l11-7z" fill="currentColor"/>',
        stop: '<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/>',
        check: '<path d="M20 6L9 17l-5-5"/>',
        x: '<path d="M18 6L6 18"/><path d="M6 6l12 12"/>',
        eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
        folder: '<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/>',
        'git-branch': '<path d="M6 3v12"/><path d="M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/><path d="M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/><path d="M6 9a3 3 0 1 1 0 6"/><path d="M15 6a9 9 0 0 0-9 9"/>',
        build: '<path d="M11.414 10l-7.383 7.418a2.091 2.091 0 0 0 0 2.967 2.11 2.11 0 0 0 2.976 0l7.407-7.385"/><path d="M18.121 15.293l2.586-2.586a1 1 0 0 0 0-1.414l-7.586-7.586a1 1 0 0 0-1.414 0l-2.586 2.586a1 1 0 0 0 0 1.414l7.586 7.586a1 1 0 0 0 1.414 0"/>',
        tag: '<path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z"/><path d="M7 7h.01"/>'
    };
    return icons[name] || '';
}

/**
 * Format time string
 */
export function formatTime(date = new Date()) {
    return date.toLocaleTimeString();
}

/**
 * Debounce function
 */
export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Throttle function
 */
export function throttle(func, limit) {
    let inThrottle;
    return function(...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}
