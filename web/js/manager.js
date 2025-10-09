import { auth, db } from "./firebaseConfig.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import { 
  collection, getDocs, query, where, orderBy, limit, doc, getDoc, updateDoc, addDoc, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

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

// Load team members (accountants and other non-admin users)
async function loadTeamMembers() {
  try {
    const usersQuery = query(
      collection(db, "users"), 
      where("role", "in", ["accountant", "manager"])
    );
    const usersSnap = await getDocs(usersQuery);
    
    const tbody = document.querySelector("#teamTable tbody");
    tbody.innerHTML = "";
    
    let activeCount = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    usersSnap.forEach(docSnap => {
      const user = docSnap.data();
      const tr = document.createElement("tr");
      
      // Check if user was active today
      const lastLogin = user.lastLogin?.toDate();
      if (lastLogin && lastLogin >= today) {
        activeCount++;
      }
      
      tr.innerHTML = `
        <td>${user.firstName || ''} ${user.lastName || ''}</td>
        <td>${user.username}</td>
        <td>${user.role}</td>
        <td class="${user.active ? 'status-active' : 'status-inactive'}">
          ${user.active ? 'Active' : 'Inactive'}
        </td>
        <td>${lastLogin ? lastLogin.toLocaleDateString() : 'Never'}</td>
      `;
      tbody.appendChild(tr);
    });
    
    // Update stats
    document.getElementById("teamMemberCount").textContent = usersSnap.size;
    document.getElementById("activeUsersCount").textContent = activeCount;
    
  } catch (error) {
    console.error("Error loading team members:", error);
  }
}

// Load recent activity
async function loadRecentActivity() {
  try {
    const activityQuery = query(
      collection(db, "loginLogs"),
      orderBy("timestamp", "desc"),
      limit(10)
    );
    const activitySnap = await getDocs(activityQuery);
    
    const activityDiv = document.getElementById("recentActivity");
    activityDiv.innerHTML = "";
    
    for (const docSnap of activitySnap.docs) {
      const activity = docSnap.data();
      
      // Get user details
      let userName = activity.username || "Unknown";
      try {
        const userDoc = await getDoc(doc(db, "users", activity.uid));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          userName = `${userData.firstName || ''} ${userData.lastName || ''}`.trim() || userName;
        }
      } catch (e) {
        // Use username if user details not found
      }
      
      const activityItem = document.createElement("div");
      activityItem.className = `activity-item ${activity.success ? 'success' : 'failed'}`;
      
      const timestamp = activity.timestamp?.toDate().toLocaleString() || 'Unknown time';
      
      activityItem.innerHTML = `
        <div class="activity-details">
          <strong>${userName}</strong> 
          ${activity.success ? 'logged in successfully' : 'failed to log in'}
          ${activity.suspended ? ' (account suspended)' : ''}
        </div>
        <div class="activity-time">${timestamp}</div>
      `;
      
      activityDiv.appendChild(activityItem);
    }
    
  } catch (error) {
    console.error("Error loading recent activity:", error);
    document.getElementById("recentActivity").innerHTML = "<p>Error loading activity</p>";
  }
}

// Show password expiry report
// Process URL parameters for security questions (from first login flow)
async function processSecurityQuestionsFromURL() {
  const urlParams = new URLSearchParams(window.location.search);
  const question1 = urlParams.get('securityQuestion1');
  const answer1 = urlParams.get('securityAnswer1');
  const question2 = urlParams.get('securityQuestion2');
  const answer2 = urlParams.get('securityAnswer2');
  const question3 = urlParams.get('securityQuestion3');
  const answer3 = urlParams.get('securityAnswer3');

  // If all URL parameters are present, save them to Firestore
  if (question1 && answer1 && question2 && answer2 && question3 && answer3) {
    try {
      console.log('Found security questions in URL, saving to database...');
      
      // Generate salts and hash answers
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

      // Get current user and update their security questions
      if (auth.currentUser) {
        await updateDoc(doc(db, "users", auth.currentUser.uid), {
          securityQuestions: securityQuestions
        });
        
        console.log('Security questions saved successfully from URL parameters');
        
        // Clear URL parameters by redirecting to clean URL
        const cleanUrl = window.location.origin + window.location.pathname;
        window.history.replaceState({}, document.title, cleanUrl);
      }
    } catch (error) {
      console.error('Error saving security questions from URL:', error);
    }
  }
}

window.showPasswordExpiryReport = async function() {
  try {
    const modal = document.getElementById("passwordExpiryModal");
    const content = document.getElementById("passwordExpiryContent");
    
    content.innerHTML = "Loading...";
    modal.style.display = "block";
    
    // Get all users and check password expiry
    const usersSnap = await getDocs(collection(db, "users"));
    const expiringPasswords = [];
    const expiredPasswords = [];
    
    const now = new Date();
    const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    
    usersSnap.forEach(docSnap => {
      const user = docSnap.data();
      if (user.role !== "administrator") { // Only show non-admin users for manager
        const passwordExpiry = user.passwordExpiry?.toDate();
        
        if (passwordExpiry) {
          if (passwordExpiry < now) {
            expiredPasswords.push({...user, expiry: passwordExpiry});
          } else if (passwordExpiry < threeDaysFromNow) {
            expiringPasswords.push({...user, expiry: passwordExpiry});
          }
        }
      }
    });
    
    let html = "<h3>Password Status Report</h3>";
    
    if (expiredPasswords.length > 0) {
      html += "<h4 style='color: #ff6b6b;'>Expired Passwords</h4>";
      html += "<table><tr><th>Name</th><th>Username</th><th>Expired Date</th></tr>";
      expiredPasswords.forEach(user => {
        html += `<tr><td>${user.firstName || ''} ${user.lastName || ''}</td><td>${user.username}</td><td>${user.expiry.toLocaleDateString()}</td></tr>`;
      });
      html += "</table>";
    }
    
    if (expiringPasswords.length > 0) {
      html += "<h4 style='color: #ffa500;'>Expiring Soon (Next 3 Days)</h4>";
      html += "<table><tr><th>Name</th><th>Username</th><th>Expires</th></tr>";
      expiringPasswords.forEach(user => {
        html += `<tr><td>${user.firstName || ''} ${user.lastName || ''}</td><td>${user.username}</td><td>${user.expiry.toLocaleDateString()}</td></tr>`;
      });
      html += "</table>";
    }
    
    if (expiredPasswords.length === 0 && expiringPasswords.length === 0) {
      html += "<p style='color: #4caf50;'>All passwords are current. No action needed.</p>";
    }
    
    content.innerHTML = html;
    
  } catch (error) {
    console.error("Error loading password expiry report:", error);
    document.getElementById("passwordExpiryContent").innerHTML = "Error loading report";
  }
};

// Show login report
window.showLoginReport = async function() {
  try {
    const modal = document.getElementById("loginReportModal");
    const content = document.getElementById("loginReportContent");
    
    content.innerHTML = "Loading...";
    modal.style.display = "block";
    
    // Get login logs for the last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const logsQuery = query(
      collection(db, "loginLogs"),
      orderBy("timestamp", "desc"),
      limit(100)
    );
    const logsSnap = await getDocs(logsQuery);
    
    let html = "<h3>Login Activity Report (Last 30 Days)</h3>";
    html += "<table><tr><th>User</th><th>Success</th><th>Date/Time</th><th>Attempts</th></tr>";
    
    for (const docSnap of logsSnap.docs) {
      const log = docSnap.data();
      const timestamp = log.timestamp?.toDate();
      
      if (timestamp && timestamp >= thirtyDaysAgo) {
        let userName = log.username || "Unknown";
        try {
          const userDoc = await getDoc(doc(db, "users", log.uid));
          if (userDoc.exists()) {
            const userData = userDoc.data();
            if (userData.role !== "administrator") { // Only show non-admin for manager
              userName = `${userData.firstName || ''} ${userData.lastName || ''}`.trim() || userName;
              
              html += `
                <tr class="${log.success ? 'success-row' : 'failed-row'}">
                  <td>${userName}</td>
                  <td>${log.success ? '✓' : '✗'}</td>
                  <td>${timestamp.toLocaleString()}</td>
                  <td>${log.attempts || 1}</td>
                </tr>
              `;
            }
          }
        } catch (e) {
          // Skip if can't get user details
        }
      }
    }
    
    html += "</table>";
    content.innerHTML = html;
    
  } catch (error) {
    console.error("Error loading login report:", error);
    document.getElementById("loginReportContent").innerHTML = "Error loading report";
  }
};

// Close modal
window.closeModal = function(modalId) {
  document.getElementById(modalId).style.display = "none";
};

// Initialize manager dashboard
onAuthStateChanged(auth, async (user) => {
  if (user) {
    // Verify user is a manager
    const userDoc = await getDoc(doc(db, "users", user.uid));
    if (userDoc.exists() && userDoc.data().role === "manager") {
      // Process security questions from URL parameters first
      await processSecurityQuestionsFromURL();
      
      loadTeamMembers();
      loadRecentActivity();
    } else {
      // Redirect if not a manager
      window.location.href = "index.html";
    }
  } else {
    window.location.href = "index.html";
  }
});

// System Settings functionality for managers
let currentUser = null;

// Initialize current user on auth state change
onAuthStateChanged(auth, (user) => {
  if (user) {
    currentUser = user;
  }
});

// System Settings functionality for managers
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

    // Firebase functions are already imported at the top of the file

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
