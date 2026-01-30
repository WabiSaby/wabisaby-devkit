// Modal component – show/hide, Escape, focus trap, ARIA

/**
 * Get focusable elements inside a modal (buttons, links, inputs).
 */
function getFocusables(modal) {
    const selector = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    return Array.from(modal.querySelectorAll(selector)).filter(
        (el) => el.offsetParent !== null && !el.disabled
    );
}

/**
 * Modal manager
 */
class ModalManager {
    constructor() {
        this.modals = new Map();
        this.onHideCallbacks = new Map();
        this.visibleId = null;
        this.previousActiveElement = null;
    }

    register(id, element) {
        this.modals.set(id, element);
    }

    /**
     * Register a callback to run when this modal is hidden (e.g. close EventSource).
     */
    setOnHide(id, callback) {
        this.onHideCallbacks.set(id, callback);
    }

    /**
     * Return the id of the currently visible modal, or null.
     */
    getVisible() {
        return this.visibleId;
    }

    show(id) {
        const modal = this.modals.get(id);
        if (!modal) return;

        this.previousActiveElement = document.activeElement;
        modal.style.display = 'flex';
        modal.classList.add('show');
        modal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
        this.visibleId = id;

        const focusables = getFocusables(modal);
        if (focusables.length > 0) {
            focusables[0].focus();
        }
    }

    hide(id) {
        this.onHideCallbacks.get(id)?.();
        const modal = this.modals.get(id);
        if (modal) {
            modal.style.display = 'none';
            modal.classList.remove('show');
            modal.setAttribute('aria-hidden', 'true');
        }
        if (this.visibleId === id) {
            this.visibleId = null;
            document.body.style.overflow = '';
            if (this.previousActiveElement && typeof this.previousActiveElement.focus === 'function') {
                this.previousActiveElement.focus();
            }
        }
    }

    toggle(id) {
        const modal = this.modals.get(id);
        if (modal) {
            if (modal.style.display === 'flex') {
                this.hide(id);
            } else {
                this.show(id);
            }
        }
    }
}

export const modalManager = new ModalManager();

/**
 * Initialize modals: register, outside click, Escape key.
 */
export function initModals() {
    const modals = document.querySelectorAll('.modal');
    modals.forEach((modal) => {
        const id = modal.id;
        if (id) {
            modalManager.register(id, modal);
            modal.setAttribute('aria-hidden', 'true');

            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modalManager.hide(id);
                }
            });
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        const visibleId = modalManager.getVisible();
        if (visibleId) {
            e.preventDefault();
            modalManager.hide(visibleId);
        }
    });
}

/**
 * Create modal content structure (for dynamic modals).
 */
export function createModalContent(title, content, footer = null) {
    const header = document.createElement('div');
    header.className = 'modal-header';
    header.innerHTML = `<h2>${title}</h2><button type="button" class="modal-close" aria-label="Close">&times;</button>`;

    const body = document.createElement('div');
    body.className = 'modal-logs';
    if (typeof content === 'string') {
        body.textContent = content;
    } else {
        body.appendChild(content);
    }

    const footerEl = document.createElement('div');
    footerEl.className = 'modal-footer';
    if (footer) {
        footerEl.appendChild(footer);
    }

    return { header, body, footer: footerEl };
}
