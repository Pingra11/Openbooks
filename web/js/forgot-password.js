/**
 * Enhanced Forgot Password System with Security Questions
 * Implements user ID verification, security questions, and secure password reset
 */

import { auth, db } from "./firebaseConfig.js";
import { byId, showModal, closeModal } from "./ui.js";
import {
  updatePassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import {
  collection, query, where, getDocs, updateDoc, doc, addDoc, 
  serverTimestamp, getDoc
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import { validatePasswordWithHistory, storePasswordInHistory } from "./password-history.js";

// Security questions pool
const SECURITY_QUESTIONS = [
  "What was the name of your first pet?",
  "In which city were you born?",
  "What is your mother's maiden name?",
  "What was the name of your elementary school?",
  "What was your childhood nickname?",
  "What is the name of the street you grew up on?",
  "What was your favorite childhood toy?",
  "What is your favorite movie?",
  "What was the make of your first car?",
  "What is your favorite food?"
];

let currentUser = null;
let selectedQuestions = [];

// Password validation is now handled by password-history.js module

// Security answer hashing function (same as admin.js for consistency)
async function hashSecurityAnswer(answer, salt) {
  const encoder = new TextEncoder();
  const data = encoder.encode(answer.toLowerCase().trim() + salt);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Password history checking is now handled by password-history.js module

// Update forgot password button to use modal instead of prompt
function initializeForgotPassword() {
  const forgotBtn = byId("forgotBtn");
  if (forgotBtn) {
    // Remove existing listeners
    forgotBtn.replaceWith(forgotBtn.cloneNode(true));
    const newForgotBtn = byId("forgotBtn");
    
    newForgotBtn.addEventListener("click", () => {
      showModal("forgotPasswordModal");
      resetForgotPasswordFlow();
    });
  }
}

// Reset the forgot password flow to step 1
function resetForgotPasswordFlow() {
  // Hide all steps
  document.querySelectorAll('.forgot-step').forEach(step => step.style.display = 'none');
  
  // Show step 1
  byId('forgotStep1').style.display = 'block';
  
  // Clear all fields
  byId('forgotEmail').value = '';
  byId('forgotUserID').value = '';
  byId('newForgotPassword').value = '';
  byId('confirmForgotPassword').value = '';
  
  // Clear result messages
  byId('verificationResult').innerHTML = '';
  byId('securityResult').innerHTML = '';
  byId('resetResult').innerHTML = '';
  
  currentUser = null;
  selectedQuestions = [];
}

// Step 1: Verify user account with email and user ID
window.verifyUserAccount = async function() {
  const email = byId('forgotEmail').value.trim();
  const userID = byId('forgotUserID').value.trim();
  const resultDiv = byId('verificationResult');
  
  if (!email || !userID) {
    resultDiv.innerHTML = '<p class="error">Please provide both email and User ID</p>';
    return;
  }
  
  try {
    resultDiv.innerHTML = '<p>Verifying account...</p>';
    
    // Find user by email and verify user ID matches
    const usersQuery = query(collection(db, "users"), where("email", "==", email));
    const userSnapshot = await getDocs(usersQuery);
    
    if (userSnapshot.empty) {
      resultDiv.innerHTML = '<p class="error">No account found with this email address</p>';
      return;
    }
    
    const userDoc = userSnapshot.docs[0];
    const userData = userDoc.data();
    
    // Check if user ID matches (assuming we store a userID field)
    if (userData.userID !== userID && userData.username !== userID) {
      resultDiv.innerHTML = '<p class="error">User ID does not match our records</p>';
      return;
    }
    
    // Check if account is active
    if (!userData.active) {
      resultDiv.innerHTML = '<p class="error">Account is deactivated. Contact administrator</p>';
      return;
    }
    
    // Check if user has security questions set up
    // Check if security questions exist (stored as object with question1, question2, question3)
    const securityQuestionsObj = userData.securityQuestions || {};
    
    // Check for both old format (plain text answers) and new format (hashed answers)
    const hasQuestion1 = securityQuestionsObj.question1 && (securityQuestionsObj.question1.question || securityQuestionsObj.question1.answerHash || securityQuestionsObj.question1.answer);
    const hasQuestion2 = securityQuestionsObj.question2 && (securityQuestionsObj.question2.question || securityQuestionsObj.question2.answerHash || securityQuestionsObj.question2.answer);
    const hasQuestion3 = securityQuestionsObj.question3 && (securityQuestionsObj.question3.question || securityQuestionsObj.question3.answerHash || securityQuestionsObj.question3.answer);
    
    if (!hasQuestion1 || !hasQuestion2 || !hasQuestion3) {
      resultDiv.innerHTML = '<p class="error">No security questions found. Contact administrator for password reset</p>';
      return;
    }
    
    currentUser = {
      uid: userDoc.id,
      email: email,
      userData: userData
    };
    
    // Move to step 2
    resultDiv.innerHTML = '<p class="success">✅ Account verified successfully!</p>';
    setTimeout(() => {
      byId('forgotStep1').style.display = 'none';
      byId('forgotStep2').style.display = 'block';
      loadSecurityQuestions();
    }, 1500);
    
  } catch (error) {
    console.error('Error verifying account:', error);
    resultDiv.innerHTML = '<p class="error">Error verifying account. Please try again</p>';
  }
};

// Load and display security questions
function loadSecurityQuestions() {
  if (!currentUser) return;
  
  const container = byId('securityQuestionsContainer');
  const securityQuestionsObj = currentUser.userData.securityQuestions || {};
  
  // Convert object to array format for consistent processing
  const questions = [];
  
  if (securityQuestionsObj.question1) questions.push(securityQuestionsObj.question1);
  if (securityQuestionsObj.question2) questions.push(securityQuestionsObj.question2);
  if (securityQuestionsObj.question3) questions.push(securityQuestionsObj.question3);
  
  let html = '';
  questions.forEach((q, index) => {
    html += `
      <div class="field-group">
        <label>${q.question}</label>
        <input type="text" id="securityAnswer${index}" required />
      </div>
    `;
  });
  
  container.innerHTML = html;
  selectedQuestions = questions;
}

// Step 2: Verify security question answers using secure hashing
window.verifySecurityAnswers = async function() {
  const resultDiv = byId('securityResult');
  
  if (!currentUser || selectedQuestions.length === 0) {
    resultDiv.innerHTML = '<p class="error">Error: No security questions loaded</p>';
    return;
  }
  
  try {
    resultDiv.innerHTML = '<p>Verifying answers...</p>';
    
    // Check all answers - handle both old format (plain text) and new format (hashed)
    let allCorrect = true;
    for (let i = 0; i < selectedQuestions.length; i++) {
      const userAnswer = byId(`securityAnswer${i}`).value.trim();
      const question = selectedQuestions[i];
      
      // Check if this is old format (plain text answer) or new format (hashed)
      if (question.answerHash && question.salt) {
        // New format - use hashing
        const storedHash = question.answerHash;
        const salt = question.salt;
        const userAnswerHash = await hashSecurityAnswer(userAnswer, salt);
        
        if (userAnswerHash !== storedHash) {
          allCorrect = false;
          break;
        }
      } else if (question.answer) {
        // Old format - direct comparison (case insensitive)
        if (userAnswer.toLowerCase().trim() !== question.answer.toLowerCase().trim()) {
          allCorrect = false;
          break;
        }
      } else {
        console.error('Question has neither answerHash nor answer:', question);
        allCorrect = false;
        break;
      }
    }
    
    if (!allCorrect) {
      resultDiv.innerHTML = '<p class="error">Security answers do not match our records</p>';
      return;
    }
    
    // Answers correct, move to step 3
    resultDiv.innerHTML = '<p class="success">✅ Security questions verified!</p>';
    setTimeout(() => {
      byId('forgotStep2').style.display = 'none';
      byId('forgotStep3').style.display = 'block';
    }, 1500);
    
  } catch (error) {
    console.error('Error verifying security answers:', error);
    resultDiv.innerHTML = '<p class="error">Error verifying answers. Please try again</p>';
  }
};

// Step 3: Send password reset email (simplified)
window.resetPassword = async function() {
  const newPassword = byId('newForgotPassword').value;
  const confirmPassword = byId('confirmForgotPassword').value;
  const resultDiv = byId('resetResult');
  
  if (!currentUser) {
    resultDiv.innerHTML = '<p class="error">Error: User session lost</p>';
    return;
  }
  
  // Validate passwords match
  if (newPassword !== confirmPassword) {
    resultDiv.innerHTML = '<p class="error">Passwords do not match</p>';
    return;
  }
  
  // Basic password validation (no history check since user will set via email)
  if (newPassword.length < 8) {
    resultDiv.innerHTML = '<p class="error">Password must be at least 8 characters long</p>';
    return;
  }
  
  if (!/^[A-Za-z]/.test(newPassword)) {
    resultDiv.innerHTML = '<p class="error">Password must start with a letter</p>';
    return;
  }
  
  if (!/\d/.test(newPassword) || !/[^A-Za-z0-9]/.test(newPassword)) {
    resultDiv.innerHTML = '<p class="error">Password must contain at least one number and one special character</p>';
    return;
  }
  
  try {
    resultDiv.innerHTML = '<p>Sending password reset email...</p>';
    
    // SIMPLIFIED: Just send password reset email - no password history storage
    // The user will set their password through Firebase's secure reset flow
    try {
      await sendPasswordResetEmail(auth, currentUser.email);
      
      // Log the password reset attempt
      await addDoc(collection(db, "loginLogs"), {
        uid: currentUser.uid,
        username: currentUser.userData.username || currentUser.email,
        action: "password_reset_via_security_questions",
        timestamp: serverTimestamp(),
        success: true
      });
      
      resultDiv.innerHTML = `
        <div class="success">
          <h4>✅ Password Reset Email Sent!</h4>
          <p>A secure password reset link has been sent to <strong>${currentUser.email}</strong></p>
          <p>Check your email and follow the link to set your new password.</p>
          <p><strong>Note:</strong> You can set any password you want in the reset email (the password you entered here was just for validation).</p>
        </div>
      `;
      
    } catch (emailError) {
      // If email sending fails (e.g., auth mismatch), provide alternative
      console.error('Email reset failed:', emailError);
      
      resultDiv.innerHTML = `
        <div class="warning">
          <h4>⚠️ Email Reset Unavailable</h4>
          <p>We couldn't send a reset email to <strong>${currentUser.email}</strong></p>
          <p><strong>Please contact an administrator</strong> to manually reset your password.</p>
          <p>Your security questions were verified successfully.</p>
        </div>
      `;
      
      // Log the failed attempt with details
      await addDoc(collection(db, "loginLogs"), {
        uid: currentUser.uid,
        username: currentUser.userData.username || currentUser.email,
        action: "password_reset_failed_email_mismatch",
        timestamp: serverTimestamp(),
        success: false,
        error: emailError.code || emailError.message
      });
    }
    
    // Auto-close after 8 seconds
    setTimeout(() => {
      closeModal('forgotPasswordModal');
    }, 8000);
    
  } catch (error) {
    console.error('Error resetting password:', error);
    resultDiv.innerHTML = '<p class="error">Error resetting password. Please try again or contact administrator</p>';
  }
};

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', initializeForgotPassword);

// Also initialize if already loaded
if (document.readyState === 'loading') {
  // Wait for DOMContentLoaded
} else {
  initializeForgotPassword();
}