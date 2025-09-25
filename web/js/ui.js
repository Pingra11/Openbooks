export function byId(id) { return document.getElementById(id); }
export function setChip(el, { displayName, photoURL, username }) {
  el.innerHTML = "";
  if (photoURL) {
    const img = document.createElement("img");
    img.src = photoURL;
    img.width = 32;
    img.height = 32;
    img.style.borderRadius = "50%";
    el.appendChild(img);
  }
  const span = document.createElement("span");
  span.textContent = displayName || username || "User";
  el.appendChild(span);
}

// Enhanced Modal Management System to Fix Overlapping Issues
class ModalManager {
  constructor() {
    this.activeModals = [];
    this.zIndexBase = 10000;
  }

  show(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;

    // If this modal is already open, just ensure it's properly displayed
    if (this.activeModals.includes(modalId)) {
      modal.style.display = "block";
      modal.classList.add('show');
      return;
    }

    // Close any existing modals first to prevent overlapping
    this.closeAll();

    // Add to active modals
    this.activeModals.push(modalId);
    
    // Set proper z-index
    modal.style.zIndex = this.zIndexBase + this.activeModals.length;
    
    // Show modal with animation
    modal.style.display = "block";
    requestAnimationFrame(() => {
      modal.classList.add('show');
    });

    // Add escape key handler
    this.addEscapeHandler(modalId);

    // Add backdrop click handler
    this.addBackdropHandler(modal, modalId);
  }

  close(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;

    // Remove from active modals
    this.activeModals = this.activeModals.filter(id => id !== modalId);

    // Hide with animation
    modal.classList.remove('show');
    
    setTimeout(() => {
      modal.style.display = "none";
    }, 300);

    // Remove event handlers
    this.removeEscapeHandler();
  }

  closeAll() {
    [...this.activeModals].forEach(modalId => {
      this.close(modalId);
    });
  }

  addEscapeHandler(modalId) {
    this.escapeHandler = (e) => {
      if (e.key === 'Escape') {
        this.close(modalId);
      }
    };
    document.addEventListener('keydown', this.escapeHandler);
  }

  removeEscapeHandler() {
    if (this.escapeHandler) {
      document.removeEventListener('keydown', this.escapeHandler);
      this.escapeHandler = null;
    }
  }

  addBackdropHandler(modal, modalId) {
    modal.onclick = (e) => {
      if (e.target === modal) {
        this.close(modalId);
      }
    };
  }
}

// Global modal manager instance
window.modalManager = new ModalManager();

// Enhanced modal management functions - Global access
window.showModal = function(modalId) {
  window.modalManager.show(modalId);
};

window.closeModal = function(modalId) {
  window.modalManager.close(modalId);
};

window.closeAllModals = function() {
  window.modalManager.closeAll();
};