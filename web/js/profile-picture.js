/**
 * Profile Picture Management System
 * Handles profile picture upload, storage, and display functionality
 */

import { byId } from "./ui.js";

// Initialize profile picture functionality
export function initializeProfilePictureUpload() {
  const profileInput = byId('profilePicture');
  if (!profileInput) return;
  
  profileInput.addEventListener('change', handleProfilePictureSelect);
}

// Handle profile picture file selection
function handleProfilePictureSelect(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  // Validate file
  const validationResult = validateProfilePicture(file);
  if (!validationResult.valid) {
    alert(validationResult.error);
    event.target.value = '';
    return;
  }
  
  // Display preview
  displayProfilePreview(file);
}

// Validate profile picture file
function validateProfilePicture(file) {
  const maxSize = 5 * 1024 * 1024; // 5MB
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  
  if (!allowedTypes.includes(file.type)) {
    return {
      valid: false,
      error: 'Please select a valid image file (JPG, PNG, GIF, or WebP)'
    };
  }
  
  if (file.size > maxSize) {
    return {
      valid: false,
      error: 'Image file size must be less than 5MB'
    };
  }
  
  return { valid: true };
}

// Display profile picture preview
function displayProfilePreview(file) {
  const preview = byId('profilePreview');
  const previewImg = byId('profilePreviewImg');
  const uploadText = preview.querySelector('.upload-text');
  const clearBtn = byId('clearPhotoBtn');
  
  const reader = new FileReader();
  reader.onload = function(e) {
    previewImg.src = e.target.result;
    previewImg.style.display = 'block';
    uploadText.style.display = 'none';
    clearBtn.style.display = 'inline-block';
    
    // Store the base64 data for form submission
    preview.dataset.profilePictureData = e.target.result;
  };
  reader.readAsDataURL(file);
}

// Clear profile picture selection
window.clearProfilePicture = function() {
  const profileInput = byId('profilePicture');
  const preview = byId('profilePreview');
  const previewImg = byId('profilePreviewImg');
  const uploadText = preview.querySelector('.upload-text');
  const clearBtn = byId('clearPhotoBtn');
  
  // Clear file input
  profileInput.value = '';
  
  // Reset preview
  previewImg.style.display = 'none';
  previewImg.src = '';
  uploadText.style.display = 'block';
  clearBtn.style.display = 'none';
  
  // Remove stored data
  delete preview.dataset.profilePictureData;
};

// Get current profile picture data (base64)
export function getProfilePictureData() {
  const preview = byId('profilePreview');
  return preview ? preview.dataset.profilePictureData : null;
}

// Set profile picture from URL (for editing existing users)
export function setProfilePicture(photoURL) {
  if (!photoURL) return;
  
  const preview = byId('profilePreview');
  const previewImg = byId('profilePreviewImg');
  const uploadText = preview.querySelector('.upload-text');
  const clearBtn = byId('clearPhotoBtn');
  
  if (preview && previewImg) {
    previewImg.src = photoURL;
    previewImg.style.display = 'block';
    uploadText.style.display = 'none';
    clearBtn.style.display = 'inline-block';
    
    // Store the URL for form submission
    preview.dataset.profilePictureData = photoURL;
  }
}

// Create profile picture display element
export function createProfilePictureElement(photoURL, firstName, lastName, size = 32) {
  const container = document.createElement('div');
  container.className = 'user-profile-picture';
  container.style.cssText = `
    width: ${size}px;
    height: ${size}px;
    border-radius: 50%;
    overflow: hidden;
    display: inline-block;
    vertical-align: middle;
    margin-right: 8px;
  `;
  
  if (photoURL) {
    const img = document.createElement('img');
    img.src = photoURL;
    img.style.cssText = `
      width: 100%;
      height: 100%;
      object-fit: cover;
      border-radius: 50%;
    `;
    img.onerror = function() {
      // Fallback to initials if image fails to load
      container.innerHTML = createInitialsAvatar(firstName, lastName);
    };
    container.appendChild(img);
  } else {
    container.innerHTML = createInitialsAvatar(firstName, lastName);
  }
  
  return container;
}

// Create initials avatar fallback
function createInitialsAvatar(firstName, lastName) {
  const initials = `${firstName?.charAt(0) || ''}${lastName?.charAt(0) || ''}`.toUpperCase();
  return `
    <div style="
      width: 100%;
      height: 100%;
      background: var(--primary, #6366f1);
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: 600;
      font-size: 0.8rem;
    ">
      ${initials}
    </div>
  `;
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', initializeProfilePictureUpload);

// Also initialize if already loaded
if (document.readyState !== 'loading') {
  initializeProfilePictureUpload();
}