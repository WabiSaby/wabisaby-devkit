// Modal component

/**
 * Modal manager
 */
class ModalManager {
    constructor() {
        this.modals = new Map();
    }

    /**
     * Register a modal
     */
    register(id, element) {
        this.modals.set(id, element);
    }

    /**
     * Show modal
     */
    show(id) {
        const modal = this.modals.get(id);
        if (modal) {
            modal.style.display = 'flex';
            modal.classList.add('show');
            document.body.style.overflow = 'hidden';
        }
    }

    /**
     * Hide modal
     */
    hide(id) {
        const modal = this.modals.get(id);
        if (modal) {
            modal.style.display = 'none';
            modal.classList.remove('show');
            document.body.style.overflow = '';
        }
    }

    /**
     * Toggle modal
     */
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
 * Initialize modals
 */
export function initModals() {
    const modals = document.querySelectorAll('.modal');
    modals.forEach(modal => {
        const id = modal.id;
        if (id) {
            modalManager.register(id, modal);
            
            // Close on outside click
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modalManager.hide(id);
                }
            });
        }
    });
}

/**
 * Create modal content structure
 */
export function createModalContent(title, content, footer = null) {
    const header = document.createElement('div');
    header.className = 'modal-header';
    header.innerHTML = `<h2>${title}</h2><button class="modal-close">&times;</button>`;
    
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
