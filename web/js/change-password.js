import { auth, db } from "./firebaseConfig.js";
import { signInWithEmailAndPassword, updatePassword, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import { doc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import { byId } from "./ui.js";
import { validatePasswordWithHistory, storePasswordInHistory } from "./password-history.js";

let userInfo = null;

// Check if user is required to change password
document.addEventListener("DOMContentLoaded", () => {
  const passwordChangeData = sessionStorage.getItem('passwordChangeRequired');
  
  if (!passwordChangeData) {
    // No password change required, redirect to login
    window.location.href = "index.html";
    return;
  }
  
  userInfo = JSON.parse(passwordChangeData);
  
  // Display user info
  const userInfoDiv = byId("userInfo");
  userInfoDiv.innerHTML = `
    <div class="info-box">
      <strong>Welcome, ${userInfo.firstName} ${userInfo.lastName}!</strong><br>
      Username: ${userInfo.username}<br>
      Email: ${userInfo.email}<br>
      Role: ${userInfo.role.charAt(0).toUpperCase() + userInfo.role.slice(1)}
    </div>
  `;
});

// Password validation is now handled by password-history.js module

// Handle password change form submission
const changePasswordForm = byId("changePasswordForm");
if (changePasswordForm) {
  changePasswordForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    
    const errorDiv = byId("passwordError");
    const successDiv = byId("passwordSuccess");
    errorDiv.textContent = "";
    successDiv.textContent = "";
    
    const currentPassword = byId("currentPassword").value;
    const newPassword = byId("newPassword").value;
    const confirmPassword = byId("confirmPassword").value;
    
    // Validate new password (including history check)
    const passwordValidation = await validatePasswordWithHistory(userInfo.uid, newPassword);
    if (!passwordValidation.valid) {
      errorDiv.textContent = passwordValidation.errors.join(". ");
      return;
    }
    
    // Check if passwords match
    if (newPassword !== confirmPassword) {
      errorDiv.textContent = "New passwords do not match";
      return;
    }
    
    // Check if new password is different from current
    if (currentPassword === newPassword) {
      errorDiv.textContent = "New password must be different from current password";
      return;
    }
    
    try {
      // First, authenticate with current password
      await signInWithEmailAndPassword(auth, userInfo.email, currentPassword);
      
      // Update password in Firebase Auth
      const user = auth.currentUser;
      await updatePassword(user, newPassword);
      
      // Store password in history for future validation
      await storePasswordInHistory(userInfo.uid, newPassword, 'user');
      
      // Update user record to mark password as changed
      await updateDoc(doc(db, "users", userInfo.uid), {
        passwordChanged: true,
        passwordLastChanged: serverTimestamp()
      });
      
      // Clear session storage
      sessionStorage.removeItem('passwordChangeRequired');
      
      successDiv.textContent = "Password changed successfully! Redirecting...";
      
      // Redirect to appropriate dashboard after 2 seconds
      setTimeout(() => {
        switch(userInfo.role) {
          case "administrator":
            location.href = "admin.html";
            break;
          case "manager":
            location.href = "manager.html";
            break;
          default:
            location.href = "app.html";
        }
      }, 2000);
      
    } catch (error) {
      console.error("Error changing password:", error);
      
      if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        errorDiv.textContent = "Current password is incorrect";
      } else {
        errorDiv.textContent = "Error changing password: " + error.message;
      }
    }
  });
}

// Prevent back navigation
window.addEventListener('beforeunload', (e) => {
  // User is trying to leave - clear session data
  sessionStorage.removeItem('passwordChangeRequired');
});

// Handle auth state changes
onAuthStateChanged(auth, (user) => {
  if (!user && userInfo) {
    // User signed out, redirect to login
    window.location.href = "index.html";
  }
});