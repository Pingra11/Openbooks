import { auth, db } from "./firebaseConfig.js";
import { setChip } from './ui.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import { 
  collection, getDocs, query, where, orderBy, limit, doc, getDoc, updateDoc, addDoc, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

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

// Show/close modal
window.showModal = function(modalId) {
  document.getElementById(modalId).style.display = "block";
};

window.closeModal = function(modalId) {
  document.getElementById(modalId).style.display = "none";
};

// Update admin profile (navigate to change password or profile settings)
window.updateAdminProfile = function() {
  window.location.href = 'change-password.html';
};

// Initialize manager dashboard
onAuthStateChanged(auth, async (user) => {
  if (user) {
    const userDoc = await getDoc(doc(db, "users", user.uid));
    if (userDoc.exists()) {
      const userData = userDoc.data();
      currentUser = { uid: user.uid, ...userData };
      
      // Verify user is a manager
      if (userData.role === "manager") {
        // Update user chip
        const adminChip = document.getElementById('adminChip');
        if (adminChip) {
          setChip(adminChip, {
            displayName: `${userData.firstName || ''} ${userData.lastName || ''}`.trim() || userData.username,
            photoURL: userData.photoURL,
            firstName: userData.firstName,
            lastName: userData.lastName,
            username: userData.username
          });
        }
        
        // Update current date
        const currentDateDiv = document.getElementById('currentDate');
        if (currentDateDiv) {
          const now = new Date();
          const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
          currentDateDiv.textContent = now.toLocaleDateString('en-US', options);
        }
      } else {
        // Redirect if not a manager
        window.location.href = "index.html";
      }
    } else {
      window.location.href = "index.html";
    }
  } else {
    window.location.href = "index.html";
  }
});

// System Settings functionality for managers
window.showSystemSettings = async function() {
  try {
    await loadSecurityQuestions();
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
      
      if (securityQuestions.question1) {
        document.getElementById("securityQuestion1").value = securityQuestions.question1.question || "";
      }
      if (securityQuestions.question2) {
        document.getElementById("securityQuestion2").value = securityQuestions.question2.question || "";
      }
      if (securityQuestions.question3) {
        document.getElementById("securityQuestion3").value = securityQuestions.question3.question || "";
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

    const question1 = document.getElementById("securityQuestion1").value;
    const answer1 = document.getElementById("securityAnswer1").value.trim();
    const question2 = document.getElementById("securityQuestion2").value;
    const answer2 = document.getElementById("securityAnswer2").value.trim();
    const question3 = document.getElementById("securityQuestion3").value;
    const answer3 = document.getElementById("securityAnswer3").value.trim();

    if (!question1 || !answer1 || !question2 || !answer2 || !question3 || !answer3) {
      alert("Please fill in all security questions and answers");
      return;
    }

    if (question1 === question2 || question1 === question3 || question2 === question3) {
      alert("Please select different questions for each security question");
      return;
    }

    const salt1 = generateSalt();
    const salt2 = generateSalt();
    const salt3 = generateSalt();
    
    const hashedAnswer1 = await hashSecurityAnswer(answer1, salt1);
    const hashedAnswer2 = await hashSecurityAnswer(answer2, salt2);
    const hashedAnswer3 = await hashSecurityAnswer(answer3, salt3);
    
    const securityQuestions = {
      question1: { question: question1, answerHash: hashedAnswer1, salt: salt1 },
      question2: { question: question2, answerHash: hashedAnswer2, salt: salt2 },
      question3: { question: question3, answerHash: hashedAnswer3, salt: salt3 },
      lastUpdated: serverTimestamp()
    };

    await updateDoc(doc(db, "users", currentUser.uid), {
      securityQuestions: securityQuestions
    });

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

// Help system
window.showHelp = function() {
  showModal('helpModal');
  showHelpTopic('overview');
};

window.closeHelpModal = function() {
  closeModal('helpModal');
};

window.showHelpTopic = function(topic) {
  const content = document.getElementById('helpContent');
  
  const topics = {
    overview: {
      title: 'System Overview',
      content: `
        <h3>Welcome to OpenBooks</h3>
        <p>OpenBooks is a comprehensive accounting system designed to help you manage your financial records.</p>
        <h4>Your Role: Manager</h4>
        <p>As a Manager, you have access to:</p>
        <ul>
          <li>View Chart of Accounts (read-only)</li>
          <li>Create and post Journal Entries</li>
          <li>View Account Ledgers</li>
          <li>Generate Financial Reports</li>
        </ul>
        <p>Note: Only Administrators can add, edit, or deactivate accounts.</p>
      `
    },
    accounts: {
      title: 'Chart of Accounts',
      content: `
        <h3>Chart of Accounts</h3>
        <p>The Chart of Accounts displays all accounts in the system organized by type.</p>
        <h4>What You Can Do:</h4>
        <ul>
          <li>View all accounts and their details</li>
          <li>Search and filter accounts</li>
          <li>View account balances</li>
          <li>Navigate to account ledgers</li>
        </ul>
        <p><strong>Note:</strong> As a Manager, you cannot add, edit, or deactivate accounts. Contact an Administrator for these actions.</p>
      `
    },
    journal: {
      title: 'Journal Entries',
      content: `
        <h3>Journal Entries</h3>
        <p>Record financial transactions using double-entry bookkeeping.</p>
        <h4>Creating Entries:</h4>
        <ul>
          <li>Click "New Entry" to create a journal entry</li>
          <li>Add description and date</li>
          <li>Add line items (debits and credits must balance)</li>
          <li>Save as draft or post immediately</li>
        </ul>
        <h4>Posting Entries:</h4>
        <p>Posted entries update account balances and cannot be edited. Review carefully before posting.</p>
      `
    },
    ledger: {
      title: 'Account Ledger',
      content: `
        <h3>Account Ledger</h3>
        <p>View detailed transaction history for any account.</p>
        <h4>Features:</h4>
        <ul>
          <li>Select an account to view its ledger</li>
          <li>See all transactions affecting that account</li>
          <li>View running balances</li>
          <li>Click journal entry numbers to view full entries</li>
        </ul>
      `
    },
    reports: {
      title: 'Financial Reports',
      content: `
        <h3>Financial Reports</h3>
        <p>Generate comprehensive financial statements.</p>
        <h4>Available Reports:</h4>
        <ul>
          <li><strong>Trial Balance:</strong> Verify debits equal credits</li>
          <li><strong>Balance Sheet:</strong> Assets, Liabilities, and Equity</li>
          <li><strong>Income Statement:</strong> Revenue and Expenses</li>
          <li><strong>Retained Earnings:</strong> Equity changes over time</li>
        </ul>
        <p>All reports can be filtered by date and printed.</p>
      `
    },
    roles: {
      title: 'User Roles',
      content: `
        <h3>User Roles & Permissions</h3>
        <h4>Administrator</h4>
        <ul>
          <li>Full system access</li>
          <li>User management</li>
          <li>Add/edit/deactivate accounts</li>
          <li>All accounting features</li>
          <li>View event logs</li>
        </ul>
        <h4>Manager (Your Role)</h4>
        <ul>
          <li>View accounts (read-only)</li>
          <li>Create and post journal entries</li>
          <li>View ledgers and reports</li>
        </ul>
        <h4>Accountant</h4>
        <ul>
          <li>Same permissions as Manager</li>
          <li>View accounts (read-only)</li>
          <li>Create and post journal entries</li>
          <li>View ledgers and reports</li>
        </ul>
      `
    }
  };
  
  const topicData = topics[topic] || topics.overview;
  content.innerHTML = `<h3>${topicData.title}</h3>${topicData.content}`;
};

// Dashboard functionality for Manager view
let currentPage = 1;
const usersPerPage = 10;
let allUsers = [];
let filteredUsers = [];

// Load system statistics
async function loadSystemStats() {
  try {
    const usersSnap = await getDocs(collection(db, "users"));
    const totalUsers = usersSnap.size;
    
    let activeUsers = 0;
    let suspendedUsers = 0;
    
    usersSnap.forEach(doc => {
      const user = doc.data();
      if (user.active) activeUsers++;
      if (user.suspended) suspendedUsers++;
    });
    
    const requestsQuery = query(collection(db, "userRequests"), where("status", "==", "pending"));
    const requestsSnap = await getDocs(requestsQuery);
    const pendingRequests = requestsSnap.size;
    
    const totalUsersEl = document.getElementById("totalUsers");
    const activeUsersEl = document.getElementById("activeUsers");
    const pendingRequestsEl = document.getElementById("pendingRequests");
    const suspendedUsersEl = document.getElementById("suspendedUsers");
    
    if (totalUsersEl) totalUsersEl.textContent = totalUsers;
    if (activeUsersEl) activeUsersEl.textContent = activeUsers;
    if (pendingRequestsEl) pendingRequestsEl.textContent = pendingRequests;
    if (suspendedUsersEl) suspendedUsersEl.textContent = suspendedUsers;
    
  } catch (error) {
    console.error("Error loading system stats:", error);
  }
}

// Load user requests (view-only)
async function loadUserRequests() {
  try {
    const requestsQuery = query(collection(db, "userRequests"), where("status", "==", "pending"));
    const requestsSnap = await getDocs(requestsQuery);
    
    const tbody = document.querySelector("#requestsTable tbody");
    if (!tbody) return;
    
    tbody.innerHTML = "";
    
    requestsSnap.forEach(docSnap => {
      const request = docSnap.data();
      const tr = document.createElement("tr");
      
      tr.innerHTML = `
        <td>${request.firstName} ${request.lastName}</td>
        <td>${request.requestedRole}</td>
      `;
      tbody.appendChild(tr);
    });
    
  } catch (error) {
    console.error("Error loading user requests:", error);
  }
}

// Load users for the dashboard
async function loadUsers() {
  try {
    const usersSnap = await getDocs(query(collection(db, "users"), orderBy("createdAt", "desc")));
    
    allUsers = [];
    usersSnap.forEach(doc => {
      allUsers.push({ id: doc.id, ...doc.data() });
    });
    
    applyFilters();
    
  } catch (error) {
    console.error("Error loading users:", error);
  }
}

// Apply search and filters
function applyFilters() {
  const searchTerm = document.getElementById("userSearchInput")?.value.toLowerCase() || "";
  const roleFilter = document.getElementById("roleFilter")?.value || "";
  const statusFilter = document.getElementById("statusFilter")?.value || "";
  
  filteredUsers = allUsers.filter(user => {
    const matchesSearch = !searchTerm || 
      user.firstName?.toLowerCase().includes(searchTerm) ||
      user.lastName?.toLowerCase().includes(searchTerm) ||
      user.email?.toLowerCase().includes(searchTerm) ||
      user.username?.toLowerCase().includes(searchTerm);
    
    const matchesRole = !roleFilter || user.role === roleFilter;
    
    let matchesStatus = true;
    if (statusFilter === "active") matchesStatus = user.active && !user.suspended;
    else if (statusFilter === "inactive") matchesStatus = !user.active;
    else if (statusFilter === "suspended") matchesStatus = user.suspended;
    
    return matchesSearch && matchesRole && matchesStatus;
  });
  
  currentPage = 1;
  displayUsers();
}

// Display users with pagination
function displayUsers() {
  const tbody = document.querySelector("#usersTable tbody");
  const emptyState = document.getElementById("emptyState");
  
  if (!tbody) return;
  
  tbody.innerHTML = "";
  
  const startIndex = (currentPage - 1) * usersPerPage;
  const endIndex = startIndex + usersPerPage;
  const pageUsers = filteredUsers.slice(startIndex, endIndex);
  
  if (pageUsers.length === 0) {
    if (emptyState) emptyState.style.display = "block";
    tbody.closest(".table-container").style.display = "none";
  } else {
    if (emptyState) emptyState.style.display = "none";
    tbody.closest(".table-container").style.display = "block";
    
    pageUsers.forEach(user => {
      const tr = document.createElement("tr");
      
      const displayName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username;
      const status = user.suspended ? "Suspended" : (user.active ? "Active" : "Inactive");
      const statusClass = user.suspended ? "suspended" : (user.active ? "active" : "inactive");
      const lastLogin = user.lastLogin?.toDate().toLocaleDateString() || "Never";
      const created = user.createdAt?.toDate().toLocaleDateString() || "Unknown";
      
      tr.innerHTML = `
        <td>${displayName}</td>
        <td>${user.role}</td>
        <td><span class="status-badge ${statusClass}">${status}</span></td>
        <td>${lastLogin}</td>
        <td>${created}</td>
      `;
      tbody.appendChild(tr);
    });
  }
  
  updatePagination();
}

// Update pagination controls
function updatePagination() {
  const totalPages = Math.ceil(filteredUsers.length / usersPerPage);
  const pageInfo = document.getElementById("pageInfo");
  const prevBtn = document.getElementById("prevPage");
  const nextBtn = document.getElementById("nextPage");
  
  if (pageInfo) pageInfo.textContent = `Page ${currentPage} of ${totalPages || 1}`;
  if (prevBtn) prevBtn.disabled = currentPage === 1;
  if (nextBtn) nextBtn.disabled = currentPage >= totalPages;
}

// Change page
window.changePage = function(direction) {
  currentPage += direction;
  displayUsers();
};

// Load recent activity
async function loadRecentActivity() {
  try {
    const activityList = document.getElementById("recentActivity");
    if (!activityList) return;
    
    const logsQuery = query(collection(db, "adminActions"), orderBy("timestamp", "desc"), limit(10));
    const logsSnap = await getDocs(logsQuery);
    
    if (logsSnap.empty) {
      activityList.innerHTML = "<p>No recent activity</p>";
      return;
    }
    
    let html = "";
    logsSnap.forEach(doc => {
      const activity = doc.data();
      const timestamp = activity.timestamp?.toDate().toLocaleString() || "Unknown";
      html += `<div class="activity-item">${activity.details || activity.action} - ${timestamp}</div>`;
    });
    
    activityList.innerHTML = html;
    
  } catch (error) {
    console.error("Error loading recent activity:", error);
  }
}

// Report functions
window.showUserReport = async function() {
  try {
    const modal = document.getElementById("userReportModal");
    const content = document.getElementById("userReportContent");
    
    content.innerHTML = "Loading...";
    showModal("userReportModal");
    
    const usersSnap = await getDocs(collection(db, "users"));
    
    let html = "<h3>Complete User Report</h3>";
    html += `<p>Total Users: ${usersSnap.size}</p>`;
    html += "<table class='modern-table'><thead><tr><th>User</th><th>Role</th><th>Status</th><th>Created</th></tr></thead><tbody>";
    
    usersSnap.forEach(doc => {
      const user = doc.data();
      const displayName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username;
      const status = user.suspended ? "Suspended" : (user.active ? "Active" : "Inactive");
      const created = user.createdAt?.toDate().toLocaleDateString() || "Unknown";
      
      html += `<tr><td>${displayName}</td><td>${user.role}</td><td>${status}</td><td>${created}</td></tr>`;
    });
    
    html += "</tbody></table>";
    content.innerHTML = html;
    
  } catch (error) {
    console.error("Error generating user report:", error);
    alert("Error generating user report: " + error.message);
  }
};

window.showPasswordExpiryReport = async function() {
  try {
    const modal = document.getElementById("passwordExpiryModal");
    const content = document.getElementById("passwordExpiryContent");
    
    content.innerHTML = "Loading...";
    showModal("passwordExpiryModal");
    
    const usersSnap = await getDocs(collection(db, "users"));
    const expiringPasswords = [];
    const expiredPasswords = [];
    
    usersSnap.forEach(doc => {
      const user = doc.data();
      const passwordSetDate = user.passwordSetDate?.toDate();
      
      if (passwordSetDate) {
        const daysSinceSet = Math.floor((Date.now() - passwordSetDate.getTime()) / (1000 * 60 * 60 * 24));
        const daysUntilExpiry = 90 - daysSinceSet;
        
        const displayName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username;
        
        if (daysUntilExpiry < 0) {
          expiredPasswords.push({ name: displayName, days: Math.abs(daysUntilExpiry) });
        } else if (daysUntilExpiry <= 14) {
          expiringPasswords.push({ name: displayName, days: daysUntilExpiry });
        }
      }
    });
    
    let html = "<h3>Password Expiry Report</h3>";
    
    if (expiredPasswords.length > 0) {
      html += "<h4>Expired Passwords</h4>";
      html += "<ul>";
      expiredPasswords.forEach(item => {
        html += `<li>${item.name} - Expired ${item.days} days ago</li>`;
      });
      html += "</ul>";
    }
    
    if (expiringPasswords.length > 0) {
      html += "<h4>Expiring Soon</h4>";
      html += "<ul>";
      expiringPasswords.forEach(item => {
        html += `<li>${item.name} - Expires in ${item.days} days</li>`;
      });
      html += "</ul>";
    }
    
    if (expiredPasswords.length === 0 && expiringPasswords.length === 0) {
      html += "<p>No passwords expiring soon.</p>";
    }
    
    content.innerHTML = html;
    
  } catch (error) {
    console.error("Error generating password expiry report:", error);
    alert("Error generating password expiry report: " + error.message);
  }
};

window.showLoginReport = async function() {
  try {
    const modal = document.getElementById("loginReportModal");
    const content = document.getElementById("loginReportContent");
    
    content.innerHTML = "Loading...";
    showModal("loginReportModal");
    
    const logsQuery = query(
      collection(db, "loginLogs"),
      orderBy("timestamp", "desc"),
      limit(50)
    );
    const logsSnap = await getDocs(logsQuery);
    
    let html = "<h3>Login Activity Report</h3>";
    html += "<table class='modern-table'><thead><tr><th>User</th><th>Time</th><th>Status</th></tr></thead><tbody>";
    
    logsSnap.forEach(doc => {
      const log = doc.data();
      const timestamp = log.timestamp?.toDate().toLocaleString() || "Unknown";
      const status = log.success ? "Success" : "Failed";
      
      html += `<tr><td>${log.username}</td><td>${timestamp}</td><td>${status}</td></tr>`;
    });
    
    html += "</tbody></table>";
    content.innerHTML = html;
    
  } catch (error) {
    console.error("Error generating login report:", error);
    alert("Error generating login report: " + error.message);
  }
};

window.showSecurityReport = async function() {
  try {
    const modal = document.getElementById("securityReportModal");
    const content = document.getElementById("securityReportContent");
    
    content.innerHTML = "Loading...";
    showModal("securityReportModal");
    
    const usersSnap = await getDocs(collection(db, "users"));
    const logsQuery = query(collection(db, "loginLogs"), where("success", "==", false), limit(50));
    const logsSnap = await getDocs(logsQuery);
    
    let html = "<h3>Security Report</h3>";
    html += `<p>Total Failed Logins: ${logsSnap.size}</p>`;
    html += `<p>Suspended Users: ${[...usersSnap.docs].filter(d => d.data().suspended).length}</p>`;
    
    if (logsSnap.size > 0) {
      html += "<h4>Recent Failed Logins</h4>";
      html += "<table class='modern-table'><thead><tr><th>User</th><th>Time</th></tr></thead><tbody>";
      
      logsSnap.forEach(doc => {
        const log = doc.data();
        const timestamp = log.timestamp?.toDate().toLocaleString() || "Unknown";
        html += `<tr><td>${log.username}</td><td>${timestamp}</td></tr>`;
      });
      
      html += "</tbody></table>";
    }
    
    content.innerHTML = html;
    
  } catch (error) {
    console.error("Error generating security report:", error);
    alert("Error generating security report: " + error.message);
  }
};

window.showEmailTool = async function() {
  try {
    console.log("Opening email tool...");
    showModal("emailModal");
    alert("Email tool - This feature requires admin configuration");
  } catch (error) {
    console.error("Error opening email tool:", error);
    alert("Error opening email tool: " + error.message);
  }
};

window.exportData = function() {
  alert("Data export functionality - This feature generates CSV/Excel reports of users and logs");
};

// Initialize dashboard when page loads
if (document.getElementById("totalUsers")) {
  loadSystemStats();
  loadUsers();
  loadUserRequests();
  loadRecentActivity();
  
  // Setup search and filter event listeners
  document.getElementById("userSearchInput")?.addEventListener("input", applyFilters);
  document.getElementById("roleFilter")?.addEventListener("change", applyFilters);
  document.getElementById("statusFilter")?.addEventListener("change", applyFilters);
}
