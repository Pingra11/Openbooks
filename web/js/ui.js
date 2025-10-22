import { auth, db } from './firebaseConfig.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js';

export function byId(id) { return document.getElementById(id); }
export function setChip(el, { displayName, photoURL, username, firstName, lastName }) {
  el.innerHTML = "";
  
  if (photoURL) {
    const img = document.createElement("img");
    img.src = photoURL;
    img.width = 32;
    img.height = 32;
    img.style.borderRadius = "50%";
    img.style.objectFit = "cover";
    img.style.border = "2px solid rgba(255, 255, 255, 0.2)";
    img.onerror = function() {
      // Fallback to initials if image fails to load
      this.style.display = 'none';
      const initialsDiv = document.createElement("div");
      initialsDiv.style.cssText = `
        width: 32px; height: 32px; border-radius: 50%;
        background: var(--primary, #6366f1); color: white;
        display: flex; align-items: center; justify-content: center;
        font-weight: 600; font-size: 0.8rem; margin-right: 8px;
      `;
      const initials = `${firstName?.charAt(0) || ''}${lastName?.charAt(0) || ''}`.toUpperCase() || 
                      username?.charAt(0).toUpperCase() || 'U';
      initialsDiv.textContent = initials;
      el.insertBefore(initialsDiv, this.nextSibling);
    };
    el.appendChild(img);
  } else {
    // Create initials avatar as fallback
    const initialsDiv = document.createElement("div");
    initialsDiv.style.cssText = `
      width: 32px; height: 32px; border-radius: 50%;
      background: var(--primary, #6366f1); color: white;
      display: flex; align-items: center; justify-content: center;
      font-weight: 600; font-size: 0.8rem; margin-right: 8px;
    `;
    const initials = `${firstName?.charAt(0) || ''}${lastName?.charAt(0) || ''}`.toUpperCase() || 
                    username?.charAt(0).toUpperCase() || 'U';
    initialsDiv.textContent = initials;
    el.appendChild(initialsDiv);
  }
  
  const span = document.createElement("span");
  span.textContent = displayName || `${firstName || ''} ${lastName || ''}`.trim() || username || "User";
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

// Export functions for ES6 modules AND attach to window for backward compatibility
export function showModal(modalId) {
  window.modalManager.show(modalId);
}

export function closeModal(modalId) {
  window.modalManager.close(modalId);
}

export function closeAllModals() {
  window.modalManager.closeAll();
}

// Also attach to window for any legacy code
window.showModal = showModal;
window.closeModal = closeModal;
window.closeAllModals = closeAllModals;

// Navigate to appropriate dashboard based on user role
export async function navigateToDashboard() {
  try {
    const user = auth.currentUser;
    if (!user) {
      window.location.href = 'index.html';
      return;
    }

    const userDoc = await getDoc(doc(db, "users", user.uid));
    if (!userDoc.exists()) {
      window.location.href = 'index.html';
      return;
    }

    const userData = userDoc.data();
    const role = userData.role;

    // Navigate to correct dashboard based on role
    if (role === 'administrator') {
      window.location.href = 'admin.html';
    } else if (role === 'manager') {
      window.location.href = 'manager.html';
    } else if (role === 'accountant') {
      window.location.href = 'app.html';
    } else {
      // Unknown role, redirect to login
      window.location.href = 'index.html';
    }
  } catch (error) {
    console.error('Error navigating to dashboard:', error);
    window.location.href = 'index.html';
  }
}

// Attach to window for HTML onclick handlers
window.navigateToDashboard = navigateToDashboard;