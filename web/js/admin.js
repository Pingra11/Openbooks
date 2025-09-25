import { auth, db } from "./firebaseConfig.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import { createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import { 
  collection, getDocs, doc, updateDoc, addDoc, setDoc, getDoc, 
  query, where, orderBy, limit, deleteDoc, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

// Current admin user data
let currentAdmin = null;

// Generate username based on requirements: first initial + last name + MMYY
function generateUsername(firstName, lastName) {
  const firstInitial = firstName.charAt(0).toLowerCase();
  const lastNameClean = lastName.toLowerCase().replace(/[^a-z]/g, '');
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = String(now.getFullYear()).substr(-2);
  
  return `${firstInitial}${lastNameClean}${month}${year}`;
}

// Generate random password
function generatePassword() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";
  const length = 12;
  let password = "";
  
  // Ensure it starts with a letter
  password += chars.charAt(Math.floor(Math.random() * 52));
  
  // Add remaining characters
  for (let i = 1; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  return password;
}

// Load system statistics
async function loadSystemStats() {
  try {
    // Get all users
    const usersSnap = await getDocs(collection(db, "users"));
    const totalUsers = usersSnap.size;
    
    let activeUsers = 0;
    let suspendedUsers = 0;
    
    usersSnap.forEach(doc => {
      const user = doc.data();
      if (user.active) activeUsers++;
      if (user.suspended) suspendedUsers++;
    });
    
    // Get pending requests
    const requestsQuery = query(collection(db, "userRequests"), where("status", "==", "pending"));
    const requestsSnap = await getDocs(requestsQuery);
    const pendingRequests = requestsSnap.size;
    
    // Update UI
    document.getElementById("totalUsers").textContent = totalUsers;
    document.getElementById("activeUsers").textContent = activeUsers;
    document.getElementById("pendingRequests").textContent = pendingRequests;
    document.getElementById("suspendedUsers").textContent = suspendedUsers;
    
  } catch (error) {
    console.error("Error loading system stats:", error);
  }
}

// Load pending user requests
async function loadUserRequests() {
  try {
    const requestsQuery = query(collection(db, "userRequests"), where("status", "==", "pending"));
    const requestsSnap = await getDocs(requestsQuery);
    
    const tbody = document.querySelector("#requestsTable tbody");
    tbody.innerHTML = "";
    
    requestsSnap.forEach(docSnap => {
      const request = docSnap.data();
      const tr = document.createElement("tr");
      
      const createdDate = request.createdAt?.toDate().toLocaleDateString() || "Unknown";
      
      tr.innerHTML = `
        <td>${request.firstName} ${request.lastName}</td>
        <td>${request.email}</td>
        <td>${request.requestedRole}</td>
        <td>${createdDate}</td>
        <td>
          <div class="user-actions">
            <button onclick="approveRequest('${docSnap.id}')" class="btn-activate">Approve</button>
            <button onclick="rejectRequest('${docSnap.id}')" class="btn-suspend">Reject</button>
            <button onclick="viewRequestDetails('${docSnap.id}')">Details</button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
    
  } catch (error) {
    console.error("Error loading user requests:", error);
  }
}

// Approve user request and create account
window.approveRequest = async function(requestId) {
  try {
    const requestDoc = await getDoc(doc(db, "userRequests", requestId));
    if (!requestDoc.exists()) {
      alert("Request not found");
      return;
    }
    
    const requestData = requestDoc.data();
    const password = generatePassword();
    const username = requestData.generatedUsername || generateUsername(requestData.firstName, requestData.lastName);
    
    // Create Firebase Auth user
    const userCredential = await createUserWithEmailAndPassword(auth, requestData.email, password);
    const uid = userCredential.user.uid;
    
    // Create user profile
    const userData = {
      uid,
      username,
      email: requestData.email,
      firstName: requestData.firstName,
      lastName: requestData.lastName,
      role: requestData.requestedRole,
      active: true,
      createdAt: serverTimestamp(),
      createdBy: currentAdmin.uid,
      passwordCreated: serverTimestamp(),
      passwordExpiry: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
      loginAttempts: 0,
      suspended: false,
      phone: requestData.phone || "",
      address: requestData.address || "",
      department: requestData.department || ""
    };
    
    await setDoc(doc(db, "users", uid), userData);
    
    // Create username mapping
    await setDoc(doc(db, "usernames", username), { email: requestData.email });
    
    // Create email mapping
    await setDoc(doc(db, "emails", requestData.email), { username });
    
    // Update request status
    await updateDoc(doc(db, "userRequests", requestId), {
      status: "approved",
      approvedBy: currentAdmin.uid,
      approvedAt: serverTimestamp(),
      createdUserId: uid,
      temporaryPassword: password
    });
    
    // Log the action
    await addDoc(collection(db, "adminActions"), {
      adminUid: currentAdmin.uid,
      action: "user_approved",
      targetUserId: uid,
      details: `Approved user request for ${requestData.firstName} ${requestData.lastName}`,
      timestamp: serverTimestamp()
    });
    
    // Simulate sending welcome email
    alert(`User approved successfully!\\n\\nLogin Details:\\nUsername: ${username}\\nPassword: ${password}\\n\\n(In production, this would be sent via email)`);
    
    // Refresh data
    await loadUserRequests();
    await loadUsers();
    await loadSystemStats();
    
  } catch (error) {
    console.error("Error approving request:", error);
    alert("Error approving request: " + error.message);
  }
};

// Reject user request
window.rejectRequest = async function(requestId) {
  const reason = prompt("Enter reason for rejection (optional):");
  
  try {
    await updateDoc(doc(db, "userRequests", requestId), {
      status: "rejected",
      rejectedBy: currentAdmin.uid,
      rejectedAt: serverTimestamp(),
      rejectionReason: reason || "No reason provided"
    });
    
    alert("Request rejected successfully");
    await loadUserRequests();
    await loadSystemStats();
    
  } catch (error) {
    console.error("Error rejecting request:", error);
    alert("Error rejecting request: " + error.message);
  }
};

// Enhanced User Management with Pagination and Filtering
let allUsers = [];
let filteredUsers = [];
let currentPage = 1;
const usersPerPage = 12;

// Load all users with enhanced card-based display
async function loadUsers() {
  try {
    const usersSnap = await getDocs(collection(db, "users"));
    allUsers = [];
    
    usersSnap.forEach(docSnap => {
      const user = { id: docSnap.id, ...docSnap.data() };
      allUsers.push(user);
    });
    
    // Sort users by creation date (newest first)
    allUsers.sort((a, b) => {
      const aTime = a.createdAt?.toDate() || new Date(0);
      const bTime = b.createdAt?.toDate() || new Date(0);
      return bTime - aTime;
    });
    
    // Initialize filters
    setupUserFilters();
    
    // Apply current filters and display
    applyFilters();
    
  } catch (error) {
    console.error("Error loading users:", error);
  }
}

// Setup search and filter event listeners
function setupUserFilters() {
  const searchInput = document.getElementById('userSearchInput');
  const roleFilter = document.getElementById('roleFilter');
  const statusFilter = document.getElementById('statusFilter');
  
  if (searchInput) {
    searchInput.addEventListener('input', debounce(applyFilters, 300));
  }
  if (roleFilter) {
    roleFilter.addEventListener('change', applyFilters);
  }
  if (statusFilter) {
    statusFilter.addEventListener('change', applyFilters);
  }
}

// Debounce function for search
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Apply filters and search
function applyFilters() {
  const searchTerm = document.getElementById('userSearchInput')?.value.toLowerCase() || '';
  const roleFilter = document.getElementById('roleFilter')?.value || '';
  const statusFilter = document.getElementById('statusFilter')?.value || '';
  
  filteredUsers = allUsers.filter(user => {
    const matchesSearch = !searchTerm || 
      (user.firstName + ' ' + user.lastName).toLowerCase().includes(searchTerm) ||
      user.username.toLowerCase().includes(searchTerm) ||
      user.email.toLowerCase().includes(searchTerm);
    
    const matchesRole = !roleFilter || user.role === roleFilter;
    
    const userStatus = user.suspended ? 'suspended' : (user.active ? 'active' : 'inactive');
    const matchesStatus = !statusFilter || userStatus === statusFilter;
    
    return matchesSearch && matchesRole && matchesStatus;
  });
  
  currentPage = 1;
  displayUsers();
  updatePaginationControls();
}

// Display users in table
function displayUsers() {
  const usersTable = document.getElementById('usersTable');
  const emptyState = document.getElementById('emptyState');
  if (!usersTable) return;
  
  const startIndex = (currentPage - 1) * usersPerPage;
  const endIndex = startIndex + usersPerPage;
  const usersToShow = filteredUsers.slice(startIndex, endIndex);
  
  const tbody = usersTable.querySelector('tbody');
  tbody.innerHTML = '';
  
  if (usersToShow.length === 0) {
    if (emptyState) emptyState.style.display = 'block';
    usersTable.style.display = 'none';
    return;
  }
  
  if (emptyState) emptyState.style.display = 'none';
  usersTable.style.display = 'table';
  
  usersToShow.forEach(user => {
    const userRow = createUserRow(user);
    tbody.appendChild(userRow);
  });
}

// Create individual user table row
function createUserRow(user) {
  const row = document.createElement('tr');
  
  const lastLogin = user.lastLogin?.toDate().toLocaleDateString() || "Never";
  const created = user.createdAt?.toDate().toLocaleDateString() || "Unknown";
  
  let status = 'active';
  let statusText = 'Active';
  if (user.suspended) {
    status = 'suspended';
    statusText = 'Suspended';
  } else if (!user.active) {
    status = 'inactive';
    statusText = 'Inactive';
  }
  
  // Generate user initials for avatar
  const firstName = user.firstName || '';
  const lastName = user.lastName || '';
  const initials = (firstName.charAt(0) + lastName.charAt(0)).toUpperCase() || user.username.charAt(0).toUpperCase();
  
  row.innerHTML = `
    <td>
      <div class="user-cell">
        <div class="user-avatar">${initials}</div>
        <div class="user-details">
          <div class="user-name">${firstName} ${lastName}</div>
          <div class="user-email">${user.email}</div>
        </div>
      </div>
    </td>
    <td>
      <span class="role-badge ${user.role}">${user.role}</span>
    </td>
    <td>
      <span class="status-badge ${status}">${statusText}</span>
    </td>
    <td>${lastLogin}</td>
    <td>${created}</td>
    <td>
      <div class="table-actions">
        <button onclick="editUser('${user.id}')" title="Edit User">Edit</button>
        <button onclick="toggleUserStatus('${user.id}', ${!user.active})" 
                class="${user.active ? 'danger' : ''}" 
                title="${user.active ? 'Deactivate' : 'Activate'} User">
          ${user.active ? 'Deactivate' : 'Activate'}
        </button>
        <button onclick="resetPassword('${user.id}')" title="Reset Password">Reset</button>
      </div>
    </td>
  `;
  
  return row;
}

// Update pagination controls
function updatePaginationControls() {
  const totalPages = Math.ceil(filteredUsers.length / usersPerPage);
  const pageInfo = document.getElementById('pageInfo');
  const prevBtn = document.getElementById('prevPage');
  const nextBtn = document.getElementById('nextPage');
  
  if (pageInfo) {
    pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
  }
  
  if (prevBtn) {
    prevBtn.disabled = currentPage <= 1;
  }
  
  if (nextBtn) {
    nextBtn.disabled = currentPage >= totalPages;
  }
}

// Page navigation
window.changePage = function(direction) {
  const totalPages = Math.ceil(filteredUsers.length / usersPerPage);
  
  if (direction === 1 && currentPage < totalPages) {
    currentPage++;
  } else if (direction === -1 && currentPage > 1) {
    currentPage--;
  }
  
  displayUsers();
  updatePaginationControls();
};

// Toggle user active status
window.toggleUserStatus = async function(userId, activate) {
  try {
    await updateDoc(doc(db, "users", userId), {
      active: activate,
      statusChangedBy: currentAdmin.uid,
      statusChangedAt: serverTimestamp()
    });
    
    // Log the action
    await addDoc(collection(db, "adminActions"), {
      adminUid: currentAdmin.uid,
      action: activate ? "user_activated" : "user_deactivated",
      targetUserId: userId,
      timestamp: serverTimestamp()
    });
    
    alert(`User ${activate ? 'activated' : 'deactivated'} successfully`);
    await loadUsers();
    await loadSystemStats();
    
  } catch (error) {
    console.error("Error updating user status:", error);
    alert("Error updating user status: " + error.message);
  }
};

// Suspend user
window.suspendUser = async function(userId) {
  const startDate = prompt("Suspension start date (YYYY-MM-DD) or leave empty for immediate:");
  const endDate = prompt("Suspension end date (YYYY-MM-DD):");
  const reason = prompt("Reason for suspension:");
  
  if (!endDate || !reason) {
    alert("End date and reason are required");
    return;
  }
  
  try {
    const suspendedUntil = new Date(endDate + "T23:59:59");
    const suspendedFrom = startDate ? new Date(startDate + "T00:00:00") : new Date();
    
    await updateDoc(doc(db, "users", userId), {
      suspended: true,
      suspendedFrom,
      suspendedUntil,
      suspensionReason: reason,
      suspendedBy: currentAdmin.uid,
      suspendedAt: serverTimestamp()
    });
    
    // Log the action
    await addDoc(collection(db, "adminActions"), {
      adminUid: currentAdmin.uid,
      action: "user_suspended",
      targetUserId: userId,
      details: `Suspended until ${endDate}. Reason: ${reason}`,
      timestamp: serverTimestamp()
    });
    
    alert("User suspended successfully");
    await loadUsers();
    await loadSystemStats();
    
  } catch (error) {
    console.error("Error suspending user:", error);
    alert("Error suspending user: " + error.message);
  }
};

// Show create user modal
window.showCreateUserModal = function() {
  showModal("createUserModal");
};

// Enhanced modal functions handled by ui.js enhanced modal system
// Additional form clearing for modal close
function clearModalForm(modalId) {
  const form = document.querySelector(`#${modalId} form`);
  if (form) {
    form.reset();
    // Clear result divs
    const resultDivs = form.querySelectorAll('[id*="Result"]');
    resultDivs.forEach(div => div.innerHTML = "");
  }
}

// Handle create user form
document.addEventListener("DOMContentLoaded", function() {
  const createUserForm = document.getElementById("createUserForm");
  if (createUserForm) {
    createUserForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      
      const resultDiv = document.getElementById("createUserResult");
      resultDiv.innerHTML = "";
      
      const userData = {
        firstName: document.getElementById("newFirstName").value.trim(),
        lastName: document.getElementById("newLastName").value.trim(),
        email: document.getElementById("newEmail").value.trim().toLowerCase(),
        role: document.getElementById("newRole").value,
        phone: document.getElementById("newPhone").value.trim(),
        department: document.getElementById("newDepartment").value.trim(),
        address: document.getElementById("newAddress").value.trim()
      };
      
      try {
        const password = generatePassword();
        const username = generateUsername(userData.firstName, userData.lastName);
        
        // Check if user already exists
        const existingUser = await getDoc(doc(db, "usernames", username));
        if (existingUser.exists()) {
          throw new Error("A user with this name combination already exists");
        }
        
        // Create Firebase Auth user
        const userCredential = await createUserWithEmailAndPassword(auth, userData.email, password);
        const uid = userCredential.user.uid;
        
        // Create user profile
        const userProfile = {
          uid,
          username,
          ...userData,
          active: true,
          createdAt: serverTimestamp(),
          createdBy: currentAdmin.uid,
          passwordCreated: serverTimestamp(),
          passwordExpiry: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
          loginAttempts: 0,
          suspended: false
        };
        
        await setDoc(doc(db, "users", uid), userProfile);
        await setDoc(doc(db, "usernames", username), { email: userData.email });
        await setDoc(doc(db, "emails", userData.email), { username });
        
        // Log the action
        await addDoc(collection(db, "adminActions"), {
          adminUid: currentAdmin.uid,
          action: "user_created",
          targetUserId: uid,
          details: `Created user ${userData.firstName} ${userData.lastName}`,
          timestamp: serverTimestamp()
        });
        
        resultDiv.innerHTML = `
          <div class="success">
            User created successfully!<br>
            Username: ${username}<br>
            Password: ${password}<br>
            ${document.getElementById("sendWelcomeEmail").checked ? 
              "(Welcome email would be sent in production)" : ""}
          </div>
        `;
        
        // Refresh data
        await loadUsers();
        await loadSystemStats();
        
      } catch (error) {
        console.error("Error creating user:", error);
        resultDiv.innerHTML = `<div class="error">Error: ${error.message}</div>`;
      }
    });
  }
});

// Load recent activity
async function loadRecentActivity() {
  try {
    const activityQuery = query(
      collection(db, "adminActions"),
      orderBy("timestamp", "desc"),
      limit(10)
    );
    const activitySnap = await getDocs(activityQuery);
    
    const activityDiv = document.getElementById("recentActivity");
    activityDiv.innerHTML = "";
    
    for (const docSnap of activitySnap.docs) {
      const activity = docSnap.data();
      
      const activityItem = document.createElement("div");
      activityItem.className = "activity-item";
      
      const timestamp = activity.timestamp?.toDate().toLocaleString() || 'Unknown time';
      
      activityItem.innerHTML = `
        <div class="activity-details">
          <strong>Admin Action:</strong> ${activity.action.replace(/_/g, ' ')}
          ${activity.details ? `<br>${activity.details}` : ''}
        </div>
        <div class="activity-time">${timestamp}</div>
      `;
      
      activityDiv.appendChild(activityItem);
    }
    
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
    html += "<table><tr><th>Name</th><th>Username</th><th>Email</th><th>Role</th><th>Status</th><th>Created</th><th>Last Login</th></tr>";
    
    usersSnap.forEach(doc => {
      const user = doc.data();
      const created = user.createdAt?.toDate().toLocaleDateString() || "Unknown";
      const lastLogin = user.lastLogin?.toDate().toLocaleDateString() || "Never";
      const status = user.active ? (user.suspended ? "Suspended" : "Active") : "Inactive";
      
      html += `
        <tr>
          <td>${user.firstName || ''} ${user.lastName || ''}</td>
          <td>${user.username}</td>
          <td>${user.email}</td>
          <td>${user.role}</td>
          <td>${status}</td>
          <td>${created}</td>
          <td>${lastLogin}</td>
        </tr>
      `;
    });
    
    html += "</table>";
    content.innerHTML = html;
    
  } catch (error) {
    console.error("Error loading user report:", error);
    document.getElementById("userReportContent").innerHTML = "Error loading report";
  }
};

// Password expiry report
window.showPasswordExpiryReport = async function() {
  try {
    const modal = document.getElementById("passwordExpiryModal");
    const content = document.getElementById("passwordExpiryContent");
    
    content.innerHTML = "Loading...";
    showModal("passwordExpiryModal");
    
    const usersSnap = await getDocs(collection(db, "users"));
    const expiringPasswords = [];
    const expiredPasswords = [];
    
    const now = new Date();
    const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    
    usersSnap.forEach(docSnap => {
      const user = docSnap.data();
      const passwordExpiry = user.passwordExpiry?.toDate();
      
      if (passwordExpiry) {
        if (passwordExpiry < now) {
          expiredPasswords.push({...user, expiry: passwordExpiry});
        } else if (passwordExpiry < threeDaysFromNow) {
          expiringPasswords.push({...user, expiry: passwordExpiry});
        }
      }
    });
    
    let html = "<h3>Password Expiry Report</h3>";
    
    if (expiredPasswords.length > 0) {
      html += "<h4 style='color: #ff6b6b;'>Expired Passwords</h4>";
      html += "<table><tr><th>Name</th><th>Username</th><th>Role</th><th>Expired Date</th><th>Actions</th></tr>";
      expiredPasswords.forEach(user => {
        html += `
          <tr>
            <td>${user.firstName || ''} ${user.lastName || ''}</td>
            <td>${user.username}</td>
            <td>${user.role}</td>
            <td>${user.expiry.toLocaleDateString()}</td>
            <td><button onclick="forcePasswordReset('${user.uid}')">Force Reset</button></td>
          </tr>
        `;
      });
      html += "</table>";
    }
    
    if (expiringPasswords.length > 0) {
      html += "<h4 style='color: #ffa500;'>Expiring Soon (Next 3 Days)</h4>";
      html += "<table><tr><th>Name</th><th>Username</th><th>Role</th><th>Expires</th><th>Actions</th></tr>";
      expiringPasswords.forEach(user => {
        html += `
          <tr>
            <td>${user.firstName || ''} ${user.lastName || ''}</td>
            <td>${user.username}</td>
            <td>${user.role}</td>
            <td>${user.expiry.toLocaleDateString()}</td>
            <td><button onclick="sendPasswordReminder('${user.uid}')">Send Reminder</button></td>
          </tr>
        `;
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

// Login activity report
window.showLoginReport = async function() {
  try {
    const modal = document.getElementById("loginReportModal");
    const content = document.getElementById("loginReportContent");
    
    content.innerHTML = "Loading...";
    showModal("loginReportModal");
    
    const logsQuery = query(
      collection(db, "loginLogs"),
      orderBy("timestamp", "desc"),
      limit(100)
    );
    const logsSnap = await getDocs(logsQuery);
    
    let html = "<h3>Login Activity Report (Last 100 Attempts)</h3>";
    html += "<table><tr><th>User</th><th>Username</th><th>Success</th><th>Date/Time</th><th>Attempts</th><th>Action</th></tr>";
    
    for (const docSnap of logsSnap.docs) {
      const log = docSnap.data();
      const timestamp = log.timestamp?.toDate();
      
      if (timestamp) {
        let userName = "Unknown";
        try {
          const userDoc = await getDoc(doc(db, "users", log.uid));
          if (userDoc.exists()) {
            const userData = userDoc.data();
            userName = `${userData.firstName || ''} ${userData.lastName || ''}`.trim() || log.username;
          }
        } catch (e) {
          userName = log.username || "Unknown";
        }
        
        html += 
          "<tr class='" + (log.success ? 'success-row' : 'failed-row') + "'>" +
            "<td>" + userName + "</td>" +
            "<td>" + (log.username || 'N/A') + "</td>" +
            "<td>" + (log.success ? '✓ Success' : '✗ Failed') + "</td>" +
            "<td>" + timestamp.toLocaleString() + "</td>" +
            "<td>" + (log.attempts || 1) + "</td>" +
            "<td>" +
              (log.suspended ? '<span style="color: #ff6b6b;">Account Suspended</span>' : '') +
              (!log.success && !log.suspended ? '<button onclick="clearFailedAttempts(\'' + log.uid + '\')">Clear Attempts</button>' : '') +
            "</td>" +
          "</tr>";
      }
    }
    
    html += "</table>";
    content.innerHTML = html;
    
  } catch (error) {
    console.error("Error loading login report:", error);
    document.getElementById("loginReportContent").innerHTML = "Error loading report";
  }
};

// Security report
window.showSecurityReport = async function() {
  try {
    const modal = document.getElementById("securityReportModal");
    const content = document.getElementById("securityReportContent");
    
    content.innerHTML = "Loading...";
    showModal("securityReportModal");
    
    // Get security-related data
    const usersSnap = await getDocs(collection(db, "users"));
    const logsQuery = query(collection(db, "loginLogs"), where("success", "==", false), limit(50));
    const failedLogsSnap = await getDocs(logsQuery);
    
    let suspendedUsers = 0;
    let inactiveUsers = 0;
    let usersWithFailedAttempts = 0;
    
    usersSnap.forEach(doc => {
      const user = doc.data();
      if (user.suspended) suspendedUsers++;
      if (!user.active) inactiveUsers++;
      if (user.loginAttempts > 0) usersWithFailedAttempts++;
    });
    
    let html = "<h3>Security Report</h3>";
    
    html += "<div class='stats-grid'>";
    html += `<div class='stat-item'><span class='stat-number'>${suspendedUsers}</span><span class='stat-label'>Suspended Users</span></div>`;
    html += `<div class='stat-item'><span class='stat-number'>${inactiveUsers}</span><span class='stat-label'>Inactive Users</span></div>`;
    html += `<div class='stat-item'><span class='stat-number'>${usersWithFailedAttempts}</span><span class='stat-label'>Users with Failed Attempts</span></div>`;
    html += `<div class='stat-item'><span class='stat-number'>${failedLogsSnap.size}</span><span class='stat-label'>Recent Failed Logins</span></div>`;
    html += "</div>";
    
    if (failedLogsSnap.size > 0) {
      html += "<h4>Recent Security Events</h4>";
      html += "<table><tr><th>User</th><th>Event</th><th>Date/Time</th><th>Details</th></tr>";
      
      failedLogsSnap.forEach(doc => {
        const log = doc.data();
        const timestamp = log.timestamp?.toDate().toLocaleString() || 'Unknown';
        
        html += `
          <tr class='failed-row'>
            <td>${log.username || 'Unknown'}</td>
            <td>Failed Login${log.suspended ? ' + Suspension' : ''}</td>
            <td>${timestamp}</td>
            <td>Attempt ${log.attempts || 1}/3</td>
          </tr>
        `;
      });
      html += "</table>";
    }
    
    content.innerHTML = html;
    
  } catch (error) {
    console.error("Error loading security report:", error);
    document.getElementById("securityReportContent").innerHTML = "Error loading report";
  }
};

// Email tool functionality
window.showEmailTool = async function() {
  try {
    const modal = document.getElementById("emailModal");
    modal.style.display = "block";
    
    // Load users for recipient selection
    const usersSnap = await getDocs(collection(db, "users"));
    const recipientSelect = document.getElementById("emailRecipients");
    recipientSelect.innerHTML = "";
    
    usersSnap.forEach(doc => {
      const user = doc.data();
      const option = document.createElement("option");
      option.value = user.email;
      option.textContent = `${user.firstName || ''} ${user.lastName || ''} (${user.email}) - ${user.role}`;
      recipientSelect.appendChild(option);
    });
    
  } catch (error) {
    console.error("Error loading email tool:", error);
  }
};

// Handle email form
document.addEventListener("DOMContentLoaded", function() {
  const emailForm = document.getElementById("emailForm");
  if (emailForm) {
    emailForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      
      const resultDiv = document.getElementById("emailResult");
      const recipients = Array.from(document.getElementById("emailRecipients").selectedOptions).map(opt => opt.value);
      const subject = document.getElementById("emailSubject").value;
      const message = document.getElementById("emailMessage").value;
      
      if (recipients.length === 0) {
        resultDiv.innerHTML = "<div class='error'>Please select at least one recipient</div>";
        return;
      }
      
      try {
        // Simulate email sending (in production, this would use a real email service)
        await addDoc(collection(db, "emailLogs"), {
          sentBy: currentAdmin.uid,
          recipients,
          subject,
          message,
          sentAt: serverTimestamp(),
          status: "sent"
        });
        
        resultDiv.innerHTML = `
          <div class='success'>
            Email sent successfully to ${recipients.length} recipient(s)!<br>
            <small>(In production, this would be sent via real email service)</small>
          </div>
        `;
        
        // Clear form
        emailForm.reset();
        
      } catch (error) {
        console.error("Error sending email:", error);
        resultDiv.innerHTML = `<div class='error'>Error sending email: ${error.message}</div>`;
      }
    });
  }
});

// Additional utility functions
window.forcePasswordReset = async function(userId) {
  try {
    const newPassword = generatePassword();
    
    await updateDoc(doc(db, "users", userId), {
      passwordExpiry: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      passwordResetBy: currentAdmin.uid,
      passwordResetAt: serverTimestamp(),
      loginAttempts: 0,
      forcePasswordChange: true
    });
    
    await addDoc(collection(db, "adminActions"), {
      adminUid: currentAdmin.uid,
      action: "force_password_reset",
      targetUserId: userId,
      details: "Forced password reset due to expiry",
      timestamp: serverTimestamp()
    });
    
    alert(`Password forcibly reset!\nNew password: ${newPassword}\n\n(In production, this would be sent securely to the user)`);
    
    // Refresh the password expiry report
    showPasswordExpiryReport();
    
  } catch (error) {
    console.error("Error forcing password reset:", error);
    alert("Error forcing password reset: " + error.message);
  }
};

window.sendPasswordReminder = async function(userId) {
  try {
    const userDoc = await getDoc(doc(db, "users", userId));
    if (!userDoc.exists()) {
      alert("User not found");
      return;
    }
    
    const userData = userDoc.data();
    const passwordExpiry = userData.passwordExpiry?.toDate();
    
    // Log the reminder
    await addDoc(collection(db, "emailLogs"), {
      sentBy: currentAdmin.uid,
      recipients: [userData.email],
      subject: "Password Expiry Reminder",
      message: `Your password will expire on ${passwordExpiry?.toLocaleDateString()}. Please change it before it expires.`,
      sentAt: serverTimestamp(),
      status: "sent",
      type: "password_reminder"
    });
    
    await addDoc(collection(db, "adminActions"), {
      adminUid: currentAdmin.uid,
      action: "password_reminder_sent",
      targetUserId: userId,
      details: `Password expiry reminder sent to ${userData.email}`,
      timestamp: serverTimestamp()
    });
    
    alert(`Password expiry reminder sent to ${userData.firstName} ${userData.lastName} at ${userData.email}\n\n(In production, this would be sent via real email service)`);
    
  } catch (error) {
    console.error("Error sending password reminder:", error);
    alert("Error sending password reminder: " + error.message);
  }
};

window.resetPassword = async function(userId) {
  try {
    const newPassword = generatePassword();
    
    // In a real system, you'd update the password in Firebase Auth
    // For this demo, we'll just update the expiry and log the action
    await updateDoc(doc(db, "users", userId), {
      passwordExpiry: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      passwordResetBy: currentAdmin.uid,
      passwordResetAt: serverTimestamp(),
      loginAttempts: 0 // Reset failed attempts
    });
    
    await addDoc(collection(db, "adminActions"), {
      adminUid: currentAdmin.uid,
      action: "password_reset",
      targetUserId: userId,
      details: "Password reset by administrator",
      timestamp: serverTimestamp()
    });
    
    alert(`Password reset successfully!\\nNew password: ${newPassword}\\n\\n(In production, this would be sent securely to the user)`);
    
  } catch (error) {
    console.error("Error resetting password:", error);
    alert("Error resetting password: " + error.message);
  }
};

window.clearFailedAttempts = async function(userId) {
  try {
    await updateDoc(doc(db, "users", userId), {
      loginAttempts: 0,
      suspended: false,
      suspendedUntil: null
    });
    
    alert("Failed login attempts cleared successfully");
    await loadUsers();
    
  } catch (error) {
    console.error("Error clearing failed attempts:", error);
    alert("Error clearing failed attempts: " + error.message);
  }
};

// Bulk actions and other utilities
window.showBulkActionsModal = function() {
  alert("Bulk actions feature would be implemented here (activate/deactivate multiple users, export data, etc.)");
};

window.showSystemSettings = function() {
  alert("System settings would include password policy configuration, session timeouts, etc.");
};

window.exportData = function() {
  alert("Data export functionality would generate CSV/Excel reports of users, logs, etc.");
};

// Function to reformat existing user account with proper structure
async function reformatExistingUser(email, firstName, lastName, role = 'accountant') {
  try {
    if (!currentAdmin) {
      alert("Must be logged in as administrator");
      return;
    }

    // Find user by email
    const usersRef = collection(db, "users");
    const q = query(usersRef, where("email", "==", email));
    const userSnapshot = await getDocs(q);
    
    if (userSnapshot.empty) {
      alert(`No user found with email: ${email}`);
      return;
    }

    const userDoc = userSnapshot.docs[0];
    const userData = userDoc.data();
    const userId = userDoc.id;

    // Generate proper username if missing or incorrect
    const properUsername = generateUsername(firstName, lastName);
    
    // Prepare updated user data with proper structure
    const updatedUserData = {
      ...userData, // Keep existing data
      firstName: firstName,
      lastName: lastName,
      role: role,
      username: properUsername,
      active: userData.active !== undefined ? userData.active : true,
      loginAttempts: userData.loginAttempts || 0,
      suspended: userData.suspended || false,
      phone: userData.phone || "",
      address: userData.address || "",
      department: userData.department || "",
      // Ensure timestamps exist
      createdAt: userData.createdAt || serverTimestamp(),
      createdBy: userData.createdBy || currentAdmin.uid,
      passwordCreated: userData.passwordCreated || serverTimestamp(),
      passwordExpiry: userData.passwordExpiry || new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    };

    // Update the user document
    await updateDoc(doc(db, "users", userId), updatedUserData);

    // Update username mapping if username changed
    if (userData.username !== properUsername) {
      // Remove old username mapping if it exists
      if (userData.username) {
        try {
          await deleteDoc(doc(db, "usernames", userData.username));
        } catch (error) {
          console.log("Old username mapping not found or already deleted");
        }
      }
      
      // Create new username mapping
      await setDoc(doc(db, "usernames", properUsername), { email: email });
    }

    // Ensure email mapping exists
    await setDoc(doc(db, "emails", email), { username: properUsername });

    // Log the reformatting action in activity logs
    await addDoc(collection(db, "activityLogs"), {
      adminId: currentAdmin.uid,
      action: "user_reformatted",
      targetUserId: userId,
      details: `Reformatted user account for ${firstName} ${lastName} (${email})`,
      timestamp: serverTimestamp()
    });

    // Log the admin action
    await addDoc(collection(db, "adminActions"), {
      adminId: currentAdmin.uid,
      action: "user_reformatted", 
      targetUserId: userId,
      details: `Account reformatted: ${firstName} ${lastName} (${email}) - Username: ${properUsername}, Role: ${role}`,
      timestamp: serverTimestamp()
    });

    alert(`User account reformatted successfully!
    
User: ${firstName} ${lastName}
Email: ${email}
Username: ${properUsername}
Role: ${role}
    
All required fields have been added/updated.`);

    // Refresh all data
    await Promise.all([
      loadUsers(),
      loadSystemStats(),
      loadRecentActivity()
    ]);

  } catch (error) {
    console.error("Error reformatting user:", error);
    alert("Error reformatting user: " + error.message);
  }
}

// Make function available globally
window.reformatExistingUser = reformatExistingUser;

// Initialize admin dashboard
onAuthStateChanged(auth, async (user) => {
  if (user) {
    const userDoc = await getDoc(doc(db, "users", user.uid));
    if (userDoc.exists() && userDoc.data().role === "administrator") {
      currentAdmin = { uid: user.uid, ...userDoc.data() };
      
      // Load all dashboard data
      await Promise.all([
        loadSystemStats(),
        loadUserRequests(),
        loadUsers(),
        loadRecentActivity()
      ]);
    } else {
      window.location.href = "index.html";
    }
  } else {
    window.location.href = "index.html";
  }
});