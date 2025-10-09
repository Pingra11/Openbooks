// Accountant dashboard functionality
import { db, auth } from './firebaseConfig.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js';
import { 
  doc, 
  getDoc, 
  updateDoc, 
  addDoc, 
  collection, 
  serverTimestamp 
} from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js';

let currentUser = null;

// Security answer hashing function using Web Crypto API
async function hashSecurityAnswer(answer, salt) {
  const encoder = new TextEncoder();
  const data = encoder.encode(answer.toLowerCase().trim() + salt);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Generate a random salt for security answer hashing
function generateSalt() {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
  // Wait for auth state to initialize
  onAuthStateChanged(auth, (user) => {
    if (user) {
      currentUser = user;
      console.log("Accountant user logged in:", user.uid);
    } else {
      // Redirect to login if not authenticated
      window.location.href = '/';
    }
  });
});

// System Settings functionality for accountants
window.showSystemSettings = async function() {
  try {
    // Load current user's security questions if they exist
    await loadSecurityQuestions();
    
    // Show the settings modal
    showModal("systemSettingsModal");
    
  } catch (error) {
    console.error("Error loading system settings:", error);
    alert("Error loading system settings: " + error.message);
  }
};

// Load user's existing security questions
async function loadSecurityQuestions() {
  try {
    if (!currentUser || !currentUser.uid) {
      console.warn("No current user found");
      return;
    }

    const userDoc = await getDoc(doc(db, "users", currentUser.uid));
    if (userDoc.exists()) {
      const userData = userDoc.data();
      const securityQuestions = userData.securityQuestions || {};
      
      // Populate the form fields with existing data (questions only, answers are hashed)
      if (securityQuestions.question1) {
        document.getElementById("securityQuestion1").value = securityQuestions.question1.question || "";
        // Don't populate answer field - answers are hashed and cannot be displayed
      }
      if (securityQuestions.question2) {
        document.getElementById("securityQuestion2").value = securityQuestions.question2.question || "";
        // Don't populate answer field - answers are hashed and cannot be displayed
      }
      if (securityQuestions.question3) {
        document.getElementById("securityQuestion3").value = securityQuestions.question3.question || "";
        // Don't populate answer field - answers are hashed and cannot be displayed
      }
    }
  } catch (error) {
    console.error("Error loading security questions:", error);
  }
}

// Save security questions
window.saveSecurityQuestions = async function(event) {
  event.preventDefault();
  
  try {
    if (!currentUser || !currentUser.uid) {
      alert("You must be logged in to save security questions");
      return;
    }

    // Get form values
    const question1 = document.getElementById("securityQuestion1").value;
    const answer1 = document.getElementById("securityAnswer1").value.trim();
    const question2 = document.getElementById("securityQuestion2").value;
    const answer2 = document.getElementById("securityAnswer2").value.trim();
    const question3 = document.getElementById("securityQuestion3").value;
    const answer3 = document.getElementById("securityAnswer3").value.trim();

    // Validate that all fields are filled
    if (!question1 || !answer1 || !question2 || !answer2 || !question3 || !answer3) {
      alert("Please fill in all security questions and answers");
      return;
    }

    // Validate that all questions are different
    if (question1 === question2 || question1 === question3 || question2 === question3) {
      alert("Please select different questions for each security question");
      return;
    }

    // Prepare security questions data with hashed answers
    const salt1 = generateSalt();
    const salt2 = generateSalt();
    const salt3 = generateSalt();
    
    const hashedAnswer1 = await hashSecurityAnswer(answer1, salt1);
    const hashedAnswer2 = await hashSecurityAnswer(answer2, salt2);
    const hashedAnswer3 = await hashSecurityAnswer(answer3, salt3);
    
    const securityQuestions = {
      question1: {
        question: question1,
        answerHash: hashedAnswer1,
        salt: salt1
      },
      question2: {
        question: question2,
        answerHash: hashedAnswer2,
        salt: salt2
      },
      question3: {
        question: question3,
        answerHash: hashedAnswer3,
        salt: salt3
      },
      lastUpdated: serverTimestamp()
    };

    // Update user document with security questions
    await updateDoc(doc(db, "users", currentUser.uid), {
      securityQuestions: securityQuestions
    });

    // Log the action
    await addDoc(collection(db, "adminActions"), {
      adminUid: currentUser.uid,
      action: "security_questions_updated",
      details: "User updated their security questions",
      timestamp: serverTimestamp()
    });

    alert("Security questions saved successfully!");
    closeModal("systemSettingsModal");
    
  } catch (error) {
    console.error("Error saving security questions:", error);
    alert("Error saving security questions: " + error.message);
  }
};