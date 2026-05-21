import { db, auth } from './firebaseConfig.js';
import { setChip } from './ui.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js';
import { 
  doc, 
  getDoc, 
  updateDoc, 
  addDoc, 
  collection, 
  serverTimestamp,
  getDocs,
  query,
  where,
  orderBy,
  limit
} from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js';
import { loadFinancialRatios, loadImportantMessages } from "./financial-ratios.js";

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

// Update admin profile (navigate to change password or profile settings)
window.updateAdminProfile = function() {
  window.location.href = 'change-password.html';
};

// Initialize accountant dashboard
onAuthStateChanged(auth, async (user) => {
  if (user) {
    const userDoc = await getDoc(doc(db, "users", user.uid));
    if (userDoc.exists()) {
      const userData = userDoc.data();
      currentUser = { uid: user.uid, ...userData };
      
      // Verify user is an accountant
      if (userData.role === "accountant") {
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
        
        // Load financial ratios and important messages
        await Promise.all([
          loadFinancialRatios(),
          loadImportantMessages('accountant')
        ]);
      } else {
        // Redirect if not an accountant
        window.location.href = "index.html";
      }
    } else {
      window.location.href = "index.html";
    }
  } else {
    window.location.href = "index.html";
  }
});

// System Settings functionality for accountants
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

    const select1 = document.getElementById("securityQuestion1");
    const select2 = document.getElementById("securityQuestion2");
    const select3 = document.getElementById("securityQuestion3");
    
    // Check that actual questions are selected (not the placeholder)
    if (!select1.value || !select2.value || !select3.value) {
      alert("Please select all three security questions");
      return;
    }
    
    const question1 = select1.options[select1.selectedIndex].text;
    const answer1 = document.getElementById("securityAnswer1").value.trim();
    const question2 = select2.options[select2.selectedIndex].text;
    const answer2 = document.getElementById("securityAnswer2").value.trim();
    const question3 = select3.options[select3.selectedIndex].text;
    const answer3 = document.getElementById("securityAnswer3").value.trim();

    if (!answer1 || !answer2 || !answer3) {
      alert("Please provide answers for all security questions");
      return;
    }

    const value1 = select1.value;
    const value2 = select2.value;
    const value3 = select3.value;
    if (value1 === value2 || value1 === value3 || value2 === value3) {
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
        <h4>Your Role: Accountant</h4>
        <p>As an Accountant, you have access to:</p>
        <ul>
          <li>View Chart of Accounts (read-only)</li>
          <li>Create and submit Journal Entries for Manager approval</li>
          <li>View Account Ledgers</li>
          <li>Generate and export Financial Reports</li>
          <li>Send emails to Managers and Administrators</li>
          <li>View Event Logs</li>
        </ul>
        <p><strong>Note:</strong> Only Administrators can add, edit, or deactivate accounts. Only Managers and Administrators can post journal entries directly to the ledger.</p>
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
        <p><strong>Note:</strong> As an Accountant, you cannot add, edit, or deactivate accounts. Contact an Administrator for these actions.</p>
      `
    },
    journal: {
      title: 'Journal Entries',
      content: `
        <h3>Journal Entries (AJEs)</h3>
        <p>Record financial transactions using double-entry bookkeeping.</p>
        <h4>Creating Entries:</h4>
        <ul>
          <li>Click "New Entry" to create a journal entry</li>
          <li>Add date, description, and line items</li>
          <li>Each entry must have at least one debit and one credit</li>
          <li>Debits must equal credits (validation enforced)</li>
          <li>Attach supporting documents (PDF, Word, Excel, CSV, JPG, PNG)</li>
          <li>Save as draft or submit for Manager approval</li>
        </ul>
        <h4>Submission Workflow:</h4>
        <p>As an Accountant, you must submit entries for Manager approval. Managers will review and either approve or reject your entries. Only approved and posted entries update account balances.</p>
        <h4>Cancel/Reset:</h4>
        <p>You can cancel or reset an entry before submission. Once submitted, entries cannot be deleted (but can be edited and resubmitted if rejected).</p>
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
          <li>Full system access including user management</li>
          <li>Add, edit, and deactivate accounts</li>
          <li>Create and post journal entries directly (bypass approval)</li>
          <li>Approve/reject journal entries submitted by accountants</li>
          <li>View ledgers, reports, and event logs</li>
        </ul>
        <h4>Manager</h4>
        <ul>
          <li>View accounts (read-only, cannot add/edit/deactivate)</li>
          <li>Create and post journal entries directly (bypass approval)</li>
          <li>Approve or reject journal entries submitted by accountants</li>
          <li>View and export financial reports</li>
          <li>View ledgers and event logs</li>
        </ul>
        <h4>Accountant (Your Role)</h4>
        <ul>
          <li>View accounts (read-only, cannot add/edit/deactivate)</li>
          <li>Create journal entries and submit for Manager approval</li>
          <li>Edit and resubmit rejected entries</li>
          <li>View and export financial reports</li>
          <li>View ledgers and event logs</li>
          <li>Send emails to Managers and Administrators</li>
        </ul>
        <p><strong>Key Difference:</strong> Accountants must submit entries for approval, while Managers can post entries directly to the ledger.</p>
      `
    }
  };
  
  const topicData = topics[topic] || topics.overview;
  content.innerHTML = `<h3>${topicData.title}</h3>${topicData.content}`;
};

// Dashboard functionality for Accountant view
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

// Format event type for display
function formatEventType(eventType) {
  if (!eventType) return 'Unknown Event';
  
  const typeMap = {
    'account_added': 'Account Added',
    'account_modified': 'Account Modified',
    'account_activated': 'Account Activated',
    'account_deactivated': 'Account Deactivated',
    'journal_entry': 'Journal Entry Created',
    'journal_entry_approved': 'Journal Entry Approved',
    'journal_entry_rejected': 'Journal Entry Rejected',
    'journal_entry_posted': 'Journal Entry Posted',
    'user_approved': 'User Approved',
    'user_deleted': 'User Deleted',
    'user_activated': 'User Activated',
    'user_deactivated': 'User Deactivated'
  };
  
  return typeMap[eventType] || eventType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

// Load recent activity
async function loadRecentActivity() {
  try {
    const activityList = document.getElementById("recentActivity");
    if (!activityList) return;
    
    const logsQuery = query(collection(db, "eventLogs"), orderBy("timestamp", "desc"), limit(10));
    const logsSnap = await getDocs(logsQuery);
    
    if (logsSnap.empty) {
      activityList.innerHTML = "<p>No recent activity</p>";
      return;
    }
    
    let html = "";
    logsSnap.forEach(doc => {
      const activity = doc.data();
      const timestamp = activity.timestamp?.toDate?.().toLocaleString() || activity.dateTime || 'Just now';
      const description = activity.description || formatEventType(activity.eventType);
      const user = activity.username || 'System';
      
      html += `<div class="activity-item">
        <div class="activity-details">
          <strong>${description}</strong>
          <br><small>by ${user}</small>
        </div>
        <div class="activity-time">${timestamp}</div>
      </div>`;
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

// Email tool functionality with searchable user list
let selectedUsers = [];
let emailUsers = [];

function getInitials(firstName, lastName, username) {
  if (firstName && lastName) {
    return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
  } else if (firstName) {
    return firstName.charAt(0).toUpperCase();
  } else if (lastName) {
    return lastName.charAt(0).toUpperCase();
  } else if (username) {
    return username.charAt(0).toUpperCase();
  }
  return 'U';
}

function getAvatarColor(initials) {
  const colors = [
    '#6366f1', '#8b5cf6', '#ec4899', '#ef4444', 
    '#f59e0b', '#10b981', '#06b6d4', '#3b82f6'
  ];
  const hash = initials.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
  return colors[hash % colors.length];
}

window.showEmailTool = async function() {
  try {
    console.log("Opening email tool...");
    
    selectedUsers = [];
    updateSelectedUsersDisplay();
    
    const usersSnap = await getDocs(collection(db, "users"));
    emailUsers = [];
    
    usersSnap.forEach(docSnap => {
      const user = docSnap.data();
      user.id = docSnap.id;
      // Accountants can email administrators and managers
      if (user.role === 'administrator' || user.role === 'manager') {
        emailUsers.push(user);
      }
    });
    
    displayEmailUserList();
    
    document.getElementById("emailSubject").value = '';
    document.getElementById("emailMessage").value = '';
    const userSearch = document.getElementById("userSearch");
    if (userSearch) userSearch.value = '';
    
    showModal("emailModal");
    
  } catch (error) {
    console.error("Error loading email tool:", error);
    alert("Error loading email tool: " + error.message);
  }
};

function displayEmailUserList() {
  const userListContainer = document.getElementById("userList");
  if (!userListContainer) return;
  
  const searchTerm = document.getElementById("userSearch")?.value.toLowerCase().trim() || '';
  
  let displayUsers = emailUsers;
  if (searchTerm) {
    displayUsers = emailUsers.filter(user => {
      const fullName = `${user.firstName || ''} ${user.lastName || ''}`.toLowerCase();
      const email = (user.email || '').toLowerCase();
      return fullName.includes(searchTerm) || email.includes(searchTerm);
    });
  }
  
  userListContainer.innerHTML = "";
  
  displayUsers.forEach(user => {
    const isSelected = selectedUsers.some(selected => selected.id === user.id);
    const userName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username;
    const initials = getInitials(user.firstName, user.lastName, user.username);
    
    const userItem = document.createElement("div");
    userItem.className = `user-item ${isSelected ? 'selected' : ''}`;
    userItem.onclick = () => toggleEmailUserSelection(user);
    
    userItem.innerHTML = `
      ${user.photoURL ? 
        `<img src="${user.photoURL}" alt="${userName}" class="user-avatar" 
             onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
         <div class="user-avatar" style="display: none; background: ${getAvatarColor(initials)}">${initials}</div>` :
        `<div class="user-avatar" style="background: ${getAvatarColor(initials)}">${initials}</div>`
      }
      <div class="user-details">
        <div class="user-name">${userName}</div>
        <div class="user-email">${user.email}</div>
      </div>
      <span class="user-role role-badge ${user.role}">${user.role}</span>
    `;
    
    userListContainer.appendChild(userItem);
  });
}

function toggleEmailUserSelection(user) {
  const existingIndex = selectedUsers.findIndex(selected => selected.id === user.id);
  
  if (existingIndex > -1) {
    selectedUsers.splice(existingIndex, 1);
  } else {
    selectedUsers.push(user);
  }
  
  updateSelectedUsersDisplay();
  displayEmailUserList();
}

function updateSelectedUsersDisplay() {
  const selectedContainer = document.getElementById("selectedUsers");
  if (!selectedContainer) return;
  
  if (selectedUsers.length === 0) {
    selectedContainer.innerHTML = '<div style="color: var(--text-secondary); font-style: italic; padding: var(--space-2);">No recipients selected</div>';
    return;
  }
  
  selectedContainer.innerHTML = selectedUsers.map(user => {
    const userName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username;
    return `
      <span class="selected-user-tag">
        ${userName}
        <button type="button" class="remove-user" onclick="removeEmailUserSelection('${user.id}')">×</button>
      </span>
    `;
  }).join('');
}

window.removeEmailUserSelection = function(userId) {
  selectedUsers = selectedUsers.filter(user => user.id !== userId);
  updateSelectedUsersDisplay();
  displayEmailUserList();
};

// Setup email form handlers - runs immediately since module is deferred
function setupEmailHandlers() {
  const userSearch = document.getElementById("userSearch");
  if (userSearch) {
    userSearch.addEventListener("input", displayEmailUserList);
  }
  
  const emailForm = document.getElementById("emailForm");
  if (emailForm) {
    emailForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      
      const resultDiv = document.getElementById("emailResult");
      const submitButton = emailForm.querySelector('button[type="submit"]');
      
      try {
        if (submitButton) {
          submitButton.disabled = true;
          submitButton.textContent = 'Sending...';
        }
        
        resultDiv.innerHTML = '<div class="info">Sending email...</div>';
        
        const recipients = selectedUsers.map(user => user.email);
        const subject = document.getElementById("emailSubject").value.trim();
        const message = document.getElementById("emailMessage").value.trim();
        
        if (recipients.length === 0) {
          throw new Error("Please select at least one recipient");
        }
        
        if (!subject) {
          throw new Error("Please enter an email subject");
        }
        
        if (!message) {
          throw new Error("Please enter an email message");
        }
        
        // Send emails
        const senderName = currentUser ? `${currentUser.firstName || ''} ${currentUser.lastName || ''}`.trim() || 'OpenBooks Accountant' : 'OpenBooks Accountant';
        
        const results = [];
        for (const email of recipients) {
          try {
            const response = await fetch('/api/send-email', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                to: email,
                subject: subject,
                body: `From: ${senderName}\n\n${message}`
              })
            });
            
            if (response.ok) {
              results.push({ email, success: true });
            } else {
              results.push({ email, success: false, error: 'Send failed' });
            }
          } catch (error) {
            results.push({ email, success: false, error: error.message });
          }
        }
        
        const successful = results.filter(r => r.success);
        const failed = results.filter(r => !r.success);
        
        // Log to database
        await addDoc(collection(db, "emailLogs"), {
          sentBy: currentUser?.uid || 'unknown',
          recipients,
          subject,
          message,
          sentAt: serverTimestamp(),
          status: successful.length > 0 ? "sent" : "failed",
          successCount: successful.length,
          failedCount: failed.length
        });
        
        if (successful.length === results.length) {
          resultDiv.innerHTML = `<div class="success">Email sent successfully to ${successful.length} recipient(s)!</div>`;
          setTimeout(() => {
            emailForm.reset();
            selectedUsers = [];
            updateSelectedUsersDisplay();
            closeModal('emailModal');
          }, 2000);
        } else if (successful.length > 0) {
          resultDiv.innerHTML = `<div class="warning">Email sent to ${successful.length} of ${results.length} recipients. ${failed.length} failed.</div>`;
        } else {
          resultDiv.innerHTML = `<div class="error">Failed to send email. Please try again.</div>`;
        }
        
      } catch (error) {
        console.error("Error sending email:", error);
        resultDiv.innerHTML = `<div class="error">${error.message}</div>`;
      } finally {
        if (submitButton) {
          submitButton.disabled = false;
          submitButton.textContent = 'Send Email';
        }
      }
    });
  }
}

// Initialize email handlers when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupEmailHandlers);
} else {
  setupEmailHandlers();
}

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
