import { auth, db } from "./firebaseConfig.js";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, createUserWithEmailAndPassword, deleteUser as deleteFirebaseUser } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import { 
  collection, getDocs, doc, updateDoc, addDoc, setDoc, getDoc, 
  query, where, orderBy, limit, deleteDoc, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import { getProfilePictureData, createProfilePictureElement } from "./profile-picture.js";
import { storePasswordInHistory, validatePasswordWithHistory } from "./password-history.js";
import { setChip } from "./ui.js";
import { sendUserNotification, sendPasswordResetEmail, sendAccountCreatedEmail } from "./mail.js";

// Current admin user data
let currentAdmin = null;

// Capitalize each word in a name (handles spaces, hyphens, etc.)
function capitalizeName(name) {
  if (!name) return name;
  return name
    .trim()
    .split(/(\s+|-|')/) // Split on spaces, hyphens, and apostrophes
    .map(part => {
      if (part.match(/\s+|-|'/)) return part; // Keep separators as-is
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join('');
}

// Update all existing users to have capitalized names
async function capitalizeAllUserNames() {
  try {
    console.log('Starting to capitalize all user names...');
    const usersSnapshot = await getDocs(collection(db, "users"));
    let updateCount = 0;
    
    for (const userDoc of usersSnapshot.docs) {
      const userData = userDoc.data();
      const currentFirstName = userData.firstName || '';
      const currentLastName = userData.lastName || '';
      
      const capitalizedFirstName = capitalizeName(currentFirstName);
      const capitalizedLastName = capitalizeName(currentLastName);
      
      // Only update if names changed
      if (currentFirstName !== capitalizedFirstName || currentLastName !== capitalizedLastName) {
        await updateDoc(doc(db, "users", userDoc.id), {
          firstName: capitalizedFirstName,
          lastName: capitalizedLastName
        });
        updateCount++;
        console.log(`Updated ${userData.username}: ${currentFirstName} ${currentLastName} → ${capitalizedFirstName} ${capitalizedLastName}`);
      }
    }
    
    console.log(`Capitalization complete. Updated ${updateCount} users.`);
    return { success: true, count: updateCount };
  } catch (error) {
    console.error('Error capitalizing user names:', error);
    return { success: false, error: error.message };
  }
}

// Generate username based on requirements: first initial + last name + MMYY
function generateUsername(firstName, lastName) {
  const firstInitial = firstName.charAt(0).toLowerCase();
  const lastNameClean = lastName.toLowerCase().replace(/[^a-z]/g, '');
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = String(now.getFullYear()).substr(-2);
  
  return `${firstInitial}${lastNameClean}${month}${year}`;
}

// Create Firebase user via admin endpoint (doesn't affect admin session)
async function createFirebaseUser(email, password) {
  try {
    // Determine admin server URL based on environment
    let adminServerUrl;
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      // Development environment - use localhost:3001
      adminServerUrl = `${window.location.protocol}//localhost:3001/create-firebase-user`;
    } else {
      // Production/Replit environment - use main server with /api prefix
      adminServerUrl = `${window.location.origin}/api/create-firebase-user`;
    }
    
    const response = await fetch(adminServerUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password })
    });
    
    const result = await response.json();
    
    if (!response.ok) {
      throw new Error(result.error || 'Failed to create user');
    }
    
    return result;
    
  } catch (error) {
    console.error('Error creating Firebase user:', error);
    return { 
      success: false, 
      error: error.message || 'Failed to create user',
    };
  }
}

// Generate random password (ensures it starts with a letter per requirements)
function generatePassword() {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  const numbers = "0123456789";
  const special = "!@#$%^&*";
  const length = 12;
  let password = "";
  
  // REQUIREMENT: Must start with a letter
  password += letters.charAt(Math.floor(Math.random() * letters.length));
  
  // Ensure password meets other requirements (at least one number and special char)
  password += numbers.charAt(Math.floor(Math.random() * numbers.length)); // At least one number  
  password += special.charAt(Math.floor(Math.random() * special.length)); // At least one special char
  
  // Add remaining characters (letters, numbers, or special)
  const allChars = letters + numbers + special;
  for (let i = 3; i < length; i++) {
    password += allChars.charAt(Math.floor(Math.random() * allChars.length));
  }
  
  // Shuffle positions 1-11 (keep first letter in position 0)
  const firstChar = password[0];
  const restChars = password.slice(1).split('').sort(() => Math.random() - 0.5).join('');
  return firstChar + restChars;
}

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
    
    // Capitalize names before processing
    const firstName = capitalizeName(requestData.firstName);
    const lastName = capitalizeName(requestData.lastName);
    
    const password = generatePassword();
    const username = requestData.generatedUsername || generateUsername(firstName, lastName);
    
    // Confirm approval
    const confirmApproval = confirm(`Approve user request?\n\nUser: ${firstName} ${lastName}\nEmail: ${requestData.email}\nRole: ${requestData.requestedRole}`);
    
    if (!confirmApproval) {
      return;
    }
    
    // STEP 1: Complete all admin operations BEFORE creating Firebase Auth user
    // This prevents the session hijacking issue
    
    // Delete the request first (while admin is still authenticated)
    await deleteDoc(doc(db, "userRequests", requestId));
    
    // Log the action (while admin is still authenticated)
    await addDoc(collection(db, "adminActions"), {
      adminUid: currentAdmin.uid,
      action: "user_approved",
      details: `Approved user request for ${firstName} ${lastName}`,
      timestamp: serverTimestamp()
    });
    
    // STEP 2: Create Firebase Auth user using admin endpoint (no session switching)
    const createUserResult = await createFirebaseUser(requestData.email, password);
    if (!createUserResult.success) {
      throw new Error(`Failed to create Firebase Auth user: ${createUserResult.error}`);
    }
    const uid = createUserResult.uid;
    
    // STEP 3: Create user profile while signed in as the new user
    const userData = {
      uid,
      username,
      email: requestData.email,
      firstName: firstName,
      lastName: lastName,
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
    
    // Create username and email mappings
    await setDoc(doc(db, "usernames", username), { email: requestData.email });
    await setDoc(doc(db, "emails", requestData.email), { username });
    
    // STEP 4: Admin remains logged in - no session switching occurred
    
    // Show credentials in modal AND alert for consistency with user creation
    const modal = document.querySelector('.modal');
    const modalContent = modal ? modal.querySelector('.modal-content') : null;
    
    if (modalContent) {
      modalContent.innerHTML = `
        <h3>✅ User Approved Successfully!</h3>
        <div class="success">
          <strong>👤 Name:</strong> ${firstName} ${lastName}<br>
          <strong>📧 Email:</strong> ${requestData.email}<br>
          <strong>🔑 Username:</strong> ${username}<br>
          <strong>🔒 Password:</strong> ${password}<br>
          <br>
          <em>⚠️ Save these credentials! The new user can login with this information.</em><br>
          <em>💡 On first login, the user will be prompted to change their password.</em><br>
        </div>
        <button onclick="closeModal('userReportModal')" class="btn-primary">Continue</button>
      `;
      modal.style.display = 'block';
    }
    
    // Also show alert for immediate visibility  
    alert(`✅ User Approved Successfully!

👤 Name: ${firstName} ${lastName}
📧 Email: ${requestData.email}
🔑 Username: ${username}
🔒 Password: ${password}

⚠️ IMPORTANT: Save these credentials!
The new user will need this information to login.

💡 On first login, the user will be prompted to change their password.`);
    
    // Refresh the data immediately - admin session is preserved
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
const usersPerPage = 4;

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
      <div class="user-cell user-cell-with-photo">
        ${user.photoURL ? 
          `<div class="user-profile-picture">
             <img src="${user.photoURL}" 
                  alt="${firstName} ${lastName}" 
                  style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover;"
                  onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
             <div class="user-avatar" style="display: none;">${initials}</div>
           </div>` :
          `<div class="user-avatar">${initials}</div>`
        }
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
        <button onclick="deleteUser('${user.id}')" class="danger" title="Delete User">Delete</button>
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

// Show suspend user modal
window.suspendUser = async function(userId) {
  try {
    // Find the user in our data
    const user = allUsers.find(u => u.id === userId);
    if (!user) {
      alert("User not found");
      return;
    }
    
    // Populate the suspend form
    document.getElementById('suspendUserId').value = userId;
    document.getElementById('suspendUserInfo').innerHTML = `
      <strong>${user.firstName} ${user.lastName}</strong><br>
      <span style="color: var(--gray-400);">${user.email} (${user.username})</span><br>
      <span style="color: var(--gray-400);">Role: ${user.role}</span>
    `;
    
    // Set default dates (start today, end in 30 days)
    const today = new Date().toISOString().split('T')[0];
    const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    document.getElementById('suspendStartDate').value = '';
    document.getElementById('suspendEndDate').value = futureDate;
    document.getElementById('suspendReason').value = '';
    
    // Show the modal
    showModal('suspendUserModal');
    
  } catch (error) {
    console.error("Error opening suspend user modal:", error);
    alert("Error loading user data for suspension");
  }
};

// Process suspend user form submission
window.processSuspendUser = async function(event) {
  event.preventDefault();
  
  try {
    const userId = document.getElementById('suspendUserId').value;
    const startDate = document.getElementById('suspendStartDate').value;
    const endDate = document.getElementById('suspendEndDate').value;
    const reason = document.getElementById('suspendReason').value.trim();
    
    if (!endDate || !reason) {
      alert("End date and reason are required");
      return;
    }
    
    // Validate dates
    const suspendedUntil = new Date(endDate + "T23:59:59");
    const suspendedFrom = startDate ? new Date(startDate + "T00:00:00") : new Date();
    
    if (suspendedUntil <= suspendedFrom) {
      alert("End date must be after start date");
      return;
    }
    
    if (suspendedUntil <= new Date()) {
      alert("End date must be in the future");
      return;
    }
    
    // Update user in Firestore
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
      details: `Suspended from ${startDate || 'immediately'} until ${endDate}. Reason: ${reason}`,
      timestamp: serverTimestamp()
    });
    
    // Close modal and refresh
    closeModal('suspendUserModal');
    await loadUsers();
    await loadSystemStats();
    
    alert("User suspended successfully");
    
  } catch (error) {
    console.error("Error suspending user:", error);
    alert("Error suspending user: " + error.message);
  }
};

// Show create user modal
window.showCreateUserModal = function() {
  showModal("createUserModal");
};


// Edit user function
window.editUser = async function(userId) {
  try {
    // Find the user in our data
    const user = allUsers.find(u => u.id === userId);
    if (!user) {
      alert("User not found");
      return;
    }
    
    // Populate the edit form with current user data
    document.getElementById('editUserId').value = userId;
    document.getElementById('editFirstName').value = user.firstName || '';
    document.getElementById('editLastName').value = user.lastName || '';
    document.getElementById('editEmail').value = user.email || '';
    document.getElementById('editUsernameDisplay').textContent = user.username || '';
    document.getElementById('editRole').value = user.role || 'accountant';
    document.getElementById('editPhone').value = user.phone || '';
    document.getElementById('editDepartment').value = user.department || '';
    document.getElementById('editAddress').value = user.address || '';
    document.getElementById('editActive').checked = user.active || false;
    document.getElementById('editSuspended').checked = user.suspended || false;
    
    // Populate suspension fields if user is suspended
    if (user.suspended && user.suspensionDetails) {
      document.getElementById('editSuspendStartDate').value = user.suspensionDetails.startDate || '';
      document.getElementById('editSuspendEndDate').value = user.suspensionDetails.endDate || '';
      document.getElementById('editSuspendReason').value = user.suspensionDetails.reason || '';
      document.getElementById('suspensionFields').style.display = 'block';
      document.getElementById('editSuspendEndDate').required = true;
    } else {
      // Clear suspension fields for non-suspended users
      document.getElementById('editSuspendStartDate').value = '';
      document.getElementById('editSuspendEndDate').value = '';
      document.getElementById('editSuspendReason').value = '';
      document.getElementById('suspensionFields').style.display = 'none';
      document.getElementById('editSuspendEndDate').required = false;
    }
    
    // Show the modal
    showModal('editUserModal');
    
  } catch (error) {
    console.error("Error opening edit user modal:", error);
    alert("Error loading user data for editing");
  }
};

// Save edited user data
window.saveEditedUser = async function(event) {
  event.preventDefault();
  
  try {
    const userId = document.getElementById('editUserId').value;
    const firstName = capitalizeName(document.getElementById('editFirstName').value.trim());
    const lastName = capitalizeName(document.getElementById('editLastName').value.trim());
    const email = document.getElementById('editEmail').value.trim();
    const role = document.getElementById('editRole').value;
    const phone = document.getElementById('editPhone').value.trim();
    const department = document.getElementById('editDepartment').value.trim();
    const address = document.getElementById('editAddress').value.trim();
    const active = document.getElementById('editActive').checked;
    const suspended = document.getElementById('editSuspended').checked;
    
    // Get suspension details if user is being suspended
    const suspendStartDate = document.getElementById("editSuspendStartDate").value;
    const suspendEndDate = document.getElementById("editSuspendEndDate").value;
    const suspendReason = document.getElementById("editSuspendReason").value.trim();
    
    // Validate suspension fields if user is suspended
    if (suspended && !suspendEndDate) {
      alert("Please specify an end date for the suspension.");
      return;
    }
    
    // Validation
    if (!firstName || !lastName || !email) {
      alert("First name, last name, and email are required");
      return;
    }
    
    if (!email.includes('@')) {
      alert("Please enter a valid email address");
      return;
    }
    
    // Check if email is already taken by another user
    const existingUser = allUsers.find(u => u.email === email && u.id !== userId);
    if (existingUser) {
      alert("This email address is already taken by another user");
      return;
    }
    
    // Get the original user data for comparison - CRITICAL for Firebase Auth sync
    const originalUser = allUsers.find(u => u.id === userId);
    const originalEmail = originalUser.email;
    
    // Update Firebase Authentication FIRST if email changed - MUST happen before Firestore
    if (email !== originalEmail) {
      try {
        // Construct admin server URL using Replit's port access pattern
        const adminServerUrl = `https://3001-${window.location.hostname}/update-firebase-user`;
        
        const adminResponse = await fetch(adminServerUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            currentEmail: originalEmail, // CRITICAL: Use original email, not new one
            newEmail: email,
            firstName: firstName,
            lastName: lastName,
            disabled: suspended || !active
          })
        });
        
        const adminResult = await adminResponse.json();
        
        if (!adminResult.success) {
          if (adminResult.code === 'auth/email-already-exists') {
            alert("This email address is already in use by another Firebase account");
            return;
          }
          // CRITICAL: If Firebase Auth update fails, DO NOT update Firestore
          alert("Failed to update user email in Firebase Auth: " + (adminResult.error || 'Unknown error') + "\nUser email will not be changed to prevent authentication issues.");
          return; // Exit early, don't update Firestore
        }
        
        console.log('Firebase Auth updated successfully:', adminResult.message);
      } catch (error) {
        console.error('Firebase Auth update failed:', error);
        
        // CRITICAL: If Firebase Auth fails, DO NOT update Firestore to prevent auth mismatch
        if (email !== originalEmail) {
          alert("Error: Cannot update user email due to Firebase Auth failure. This prevents authentication issues.\n\nError: " + error.message + "\n\nPlease ensure the Firebase Admin server is running and try again.");
          return; // Exit early, don't update Firestore
        }
      }
    }
    
    // Prepare update data for Firestore
    const updateData = {
      firstName,
      lastName,
      email,
      role,
      active,
      suspended,
      updatedAt: serverTimestamp(),
      updatedBy: currentAdmin.uid
    };
    
    // Add optional fields if they have values
    if (phone) updateData.phone = phone;
    if (department) updateData.department = department;
    if (address) updateData.address = address;
    
    // Add suspension details if user is suspended
    if (suspended) {
      updateData.suspensionDetails = {
        startDate: suspendStartDate || new Date().toISOString().split('T')[0], // Default to today if empty
        endDate: suspendEndDate,
        reason: suspendReason || "Administrative suspension",
        createdAt: new Date().toISOString(),
        createdBy: currentAdmin.uid
      };
    } else {
      // Clear suspension details if not suspended
      updateData.suspensionDetails = null;
    }
    
    // Update the user in Firestore
    await updateDoc(doc(db, "users", userId), updateData);
    
    // Log the admin action
    await addDoc(collection(db, "adminActions"), {
      adminUid: currentAdmin.uid,
      adminEmail: currentAdmin.email,
      action: "edit_user",
      targetUserId: userId,
      targetUserEmail: email,
      changes: {
        firstName,
        lastName,
        email,
        role,
        active,
        suspended,
        phone: phone || null,
        department: department || null,
        address: address || null
      },
      timestamp: serverTimestamp(),
      ipAddress: "admin-edit" // Simplified for now
    });
    
    // Close the modal
    closeModal('editUserModal');
    
    // Reload users to show changes and update stats
    await Promise.all([
      loadUsers(),
      loadSystemStats()
    ]);
    
    // Show success message
    alert("User updated successfully!");
    
  } catch (error) {
    console.error("Error updating user:", error);
    console.error("Error details:", error.message, error.stack);
    alert("Error updating user: " + (error.message || "Unknown error") + "\nPlease try again.");
  }
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
        firstName: capitalizeName(document.getElementById("newFirstName").value.trim()),
        lastName: capitalizeName(document.getElementById("newLastName").value.trim()),
        email: document.getElementById("newEmail").value.trim().toLowerCase(),
        role: document.getElementById("newRole").value,
        phone: document.getElementById("newPhone").value.trim(),
        dob: document.getElementById("newDOB").value,
        address: document.getElementById("newAddress").value.trim()
      };
      
      // Security questions will be set up by the user after their first login
      
      try {
        const password = generatePassword();
        const username = generateUsername(userData.firstName, userData.lastName);
        
        // Check if user already exists
        const existingUser = await getDoc(doc(db, "usernames", username));
        if (existingUser.exists()) {
          throw new Error("A user with this name combination already exists");
        }
        
        // STEP 1: Log the action while admin is still authenticated
        await addDoc(collection(db, "adminActions"), {
          adminUid: currentAdmin.uid,
          action: "user_created",
          details: `Created user ${userData.firstName} ${userData.lastName}`,
          timestamp: serverTimestamp()
        });
        
        // STEP 2: Create Firebase Auth user using admin endpoint (no session switching)
        const createUserResult = await createFirebaseUser(userData.email, password);
        if (!createUserResult.success) {
          throw new Error(`Failed to create Firebase Auth user: ${createUserResult.error}`);
        }
        const uid = createUserResult.uid;
        
        // Get profile picture data if uploaded
        const profilePictureData = getProfilePictureData();
        
        // STEP 3: Create user profile first
        const userProfile = {
          uid,
          username,
          userID: username, // Add userID field for forgot password verification
          ...userData,
          photoURL: profilePictureData || null, // Add profile picture
          active: true,
          createdAt: serverTimestamp(),
          createdBy: currentAdmin.uid,
          passwordCreated: serverTimestamp(),
          passwordExpiry: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
          passwordHistory: [], // Initialize password history tracking
          loginAttempts: 0,
          suspended: false
          // Security questions will be set up by the user after their first login
        };
        
        await setDoc(doc(db, "users", uid), userProfile);
        
        // STEP 4: Store password in history after user document is created
        await storePasswordInHistory(uid, password, 'admin_created');
        await setDoc(doc(db, "usernames", username), { email: userData.email });
        await setDoc(doc(db, "emails", userData.email), { username });
        
        // STEP 4: Admin remains logged in - no session switching occurred
        
        // Show credentials in both modal and alert for visibility
        resultDiv.innerHTML = `
          <div class="success">
            ✅ User created successfully!<br><br>
            <strong>👤 Name:</strong> ${userData.firstName} ${userData.lastName}<br>
            <strong>📧 Email:</strong> ${userData.email}<br>
            <strong>🔑 Username:</strong> ${username}<br>
            <strong>🔒 Password:</strong> ${password}<br>
            <br>
            <em>⚠️ Save these credentials! The new user can login with this information.</em><br>
            <em>💡 On first login, the user will be prompted to change their password.</em><br>
          </div>
        `;
        
        // Also show alert for immediate visibility
        alert(`✅ User Created Successfully!

👤 Name: ${userData.firstName} ${userData.lastName}
📧 Email: ${userData.email}
🔑 Username: ${username}
🔒 Password: ${password}

⚠️ IMPORTANT: Save these credentials!
💡 On first login, the user will be prompted to change their password.`);
        
        // Clear the form for next use
        createUserForm.reset();
        
        // Refresh the user list immediately - admin session is preserved
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

// Email tool functionality with searchable user list
let selectedUsers = [];
let emailUsers = []; // Separate variable for email users to avoid conflicts

// Utility functions for email interface
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
  // Generate consistent color based on initials
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
    
    // Clear previous selections
    selectedUsers = [];
    updateSelectedUsersDisplay();
    
    // Load users for recipient selection
    const usersSnap = await getDocs(collection(db, "users"));
    const users = [];
    
    usersSnap.forEach(doc => {
      const user = doc.data();
      user.id = doc.id;
      users.push(user);
    });
    
    // Store users globally for filtering
    allUsers = [...users];
    filteredUsers = [...users];
    
    // Display user list
    displayUserList();
    
    // Clear form fields
    document.getElementById("emailSubject").value = '';
    document.getElementById("emailMessage").value = '';
    document.getElementById("userSearch").value = '';
    
    // Show modal using proper function
    showModal("emailModal");
    
  } catch (error) {
    console.error("Error loading email tool:", error);
    alert("Error loading email tool: " + error.message);
  }
};

// Display user list based on current filter
function displayUserList() {
  const userListContainer = document.getElementById("userList");
  userListContainer.innerHTML = "";
  
  filteredUsers.forEach(user => {
    const isSelected = selectedUsers.some(selected => selected.id === user.id);
    const userName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username;
    const initials = getInitials(user.firstName, user.lastName, user.username);
    
    const userItem = document.createElement("div");
    userItem.className = `user-item ${isSelected ? 'selected' : ''}`;
    userItem.onclick = () => toggleUserSelection(user);
    
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

// Toggle user selection
function toggleUserSelection(user) {
  const existingIndex = selectedUsers.findIndex(selected => selected.id === user.id);
  
  if (existingIndex > -1) {
    // Remove user from selection
    selectedUsers.splice(existingIndex, 1);
  } else {
    // Add user to selection
    selectedUsers.push(user);
  }
  
  updateSelectedUsersDisplay();
  displayUserList(); // Refresh to update selected state
}

// Update selected users display
function updateSelectedUsersDisplay() {
  const selectedContainer = document.getElementById("selectedUsers");
  
  if (selectedUsers.length === 0) {
    selectedContainer.innerHTML = '<div style="color: var(--text-secondary); font-style: italic; padding: var(--space-2);">No recipients selected</div>';
    return;
  }
  
  selectedContainer.innerHTML = selectedUsers.map(user => {
    const userName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username;
    return `
      <span class="selected-user-tag">
        ${userName}
        <button type="button" class="remove-user" onclick="removeUserSelection('${user.id}')">×</button>
      </span>
    `;
  }).join('');
}

// Remove user from selection
window.removeUserSelection = function(userId) {
  selectedUsers = selectedUsers.filter(user => user.id !== userId);
  updateSelectedUsersDisplay();
  displayUserList(); // Refresh to update selected state
};

// Search functionality
document.addEventListener("DOMContentLoaded", function() {
  const userSearch = document.getElementById("userSearch");
  if (userSearch) {
    userSearch.addEventListener("input", function() {
      const searchTerm = this.value.toLowerCase().trim();
      
      if (searchTerm === '') {
        filteredUsers = [...allUsers];
      } else {
        filteredUsers = allUsers.filter(user => {
          const fullName = `${user.firstName || ''} ${user.lastName || ''}`.toLowerCase();
          const email = user.email.toLowerCase();
          const username = (user.username || '').toLowerCase();
          const role = user.role.toLowerCase();
          
          return fullName.includes(searchTerm) || 
                 email.includes(searchTerm) || 
                 username.includes(searchTerm) ||
                 role.includes(searchTerm);
        });
      }
      
      displayUserList();
    });
  }
});

// Handle email form
document.addEventListener("DOMContentLoaded", function() {
  const emailForm = document.getElementById("emailForm");
  if (emailForm) {
    emailForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      
      const resultDiv = document.getElementById("emailResult");
      const submitButton = emailForm.querySelector('button[type="submit"]');
      
      try {
        // Disable submit button during sending
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
        
        // Send email using Replit Mail integration
        const results = [];
        for (const email of recipients) {
          try {
            const result = await sendUserNotification(
              email, 
              subject, 
              message,
              `${currentAdmin.firstName || ''} ${currentAdmin.lastName || ''}`.trim() || 'OpenBooks Administrator'
            );
            results.push({ email, success: true, result });
          } catch (error) {
            console.error(`Failed to send email to ${email}:`, error);
            results.push({ email, success: false, error: error.message });
          }
        }
        
        // Check results and show appropriate message
        const successful = results.filter(r => r.success);
        const failed = results.filter(r => !r.success);
        
        // Log to database for audit trail
        await addDoc(collection(db, "emailLogs"), {
          sentBy: currentAdmin.uid,
          recipients,
          subject,
          message,
          sentAt: serverTimestamp(),
          status: successful.length > 0 ? "sent" : "failed",
          successCount: successful.length,
          failedCount: failed.length
        });
        
        if (successful.length === results.length) {
          resultDiv.innerHTML = `<div class="success">✅ Email sent successfully to ${successful.length} recipient(s)!</div>`;
          
          // Clear form after successful send
          setTimeout(() => {
            emailForm.reset();
            closeModal('emailModal');
          }, 2000);
          
        } else if (successful.length > 0) {
          resultDiv.innerHTML = `
            <div class="warning">
              ⚠️ Partially successful: ${successful.length} sent, ${failed.length} failed<br>
              <small>Failed: ${failed.map(f => f.email).join(', ')}</small>
            </div>
          `;
        } else {
          throw new Error(`All emails failed. First error: ${failed[0]?.error}`);
        }
        
        // Log admin action
        await addDoc(collection(db, "adminActions"), {
          adminUid: currentAdmin.uid,
          action: "email_sent",
          details: `Sent email to ${recipients.length} recipient(s): ${subject}`,
          recipients: recipients,
          timestamp: serverTimestamp()
        });
        
      } catch (error) {
        console.error("Error sending email:", error);
        resultDiv.innerHTML = `<div class="error">❌ Error: ${error.message}</div>`;
      } finally {
        // Re-enable submit button
        if (submitButton) {
          submitButton.disabled = false;
          submitButton.textContent = 'Send Email';
        }
      }
    });
  }
});

// Additional utility functions
window.forcePasswordReset = async function(userId) {
  try {
    const newPassword = generatePassword();
    
    // Store password in history
    await storePasswordInHistory(userId, newPassword, 'admin_forced_reset');
    
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
    
    // Store password in history
    await storePasswordInHistory(userId, newPassword, 'admin_reset');
    
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
    if (!currentAdmin || !currentAdmin.uid) {
      console.warn("No current admin found");
      return;
    }

    const userDoc = await getDoc(doc(db, "users", currentAdmin.uid));
    if (userDoc.exists()) {
      const userData = userDoc.data();
      const securityQuestions = userData.securityQuestions || {};
      
      // Populate the form fields with existing data
      if (securityQuestions.question1) {
        document.getElementById("securityQuestion1").value = securityQuestions.question1.question || "";
        document.getElementById("securityAnswer1").value = securityQuestions.question1.answer || "";
      }
      if (securityQuestions.question2) {
        document.getElementById("securityQuestion2").value = securityQuestions.question2.question || "";
        document.getElementById("securityAnswer2").value = securityQuestions.question2.answer || "";
      }
      if (securityQuestions.question3) {
        document.getElementById("securityQuestion3").value = securityQuestions.question3.question || "";
        document.getElementById("securityAnswer3").value = securityQuestions.question3.answer || "";
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
    if (!currentAdmin || !currentAdmin.uid) {
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

    // Prepare security questions data with hashed answers (matching accountant.js format)
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
    await updateDoc(doc(db, "users", currentAdmin.uid), {
      securityQuestions: securityQuestions
    });

    // Log the action
    await addDoc(collection(db, "adminActions"), {
      adminUid: currentAdmin.uid,
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

// Add admin profile update function
async function updateAdminProfile() {
  if (!currentAdmin) {
    alert("Not logged in as admin");
    return;
  }
  
  const firstName = prompt("Enter your first name:", currentAdmin.firstName || "");
  if (!firstName) return;
  
  const lastName = prompt("Enter your last name:", currentAdmin.lastName || "");
  if (!lastName) return;
  
  try {
    // Update admin user document
    await updateDoc(doc(db, "users", currentAdmin.uid), {
      firstName: firstName.trim(),
      lastName: lastName.trim()
    });
    
    // Update currentAdmin object
    currentAdmin.firstName = firstName.trim();
    currentAdmin.lastName = lastName.trim();
    
    // Update display immediately using setChip for consistency
    const adminChip = document.getElementById("adminChip");
    if (adminChip) {
      const displayName = `${firstName.trim()} ${lastName.trim()}`;
      
      // Use setChip to properly handle profile pictures and fallback avatars
      setChip(adminChip, {
        displayName,
        photoURL: currentAdmin.photoURL,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        username: currentAdmin.username
      });
      
      adminChip.style.cursor = 'pointer';
      adminChip.title = 'Click to update profile';
    }
    
    alert("Admin profile updated successfully!");
    
  } catch (error) {
    console.error("Error updating admin profile:", error);
    alert("Error updating profile: " + error.message);
  }
}

// Make function available globally
window.updateAdminProfile = updateAdminProfile;

// Close modal function for credential display
// Modal closing is handled by ui.js - removed duplicate function

// View request details function (missing function causing console errors)
window.viewRequestDetails = async function(requestId) {
  try {
    const requestDoc = await getDoc(doc(db, "userRequests", requestId));
    if (!requestDoc.exists()) {
      alert("Request not found");
      return;
    }
    
    const request = requestDoc.data();
    const createdDate = request.createdAt?.toDate().toLocaleDateString() || "Unknown";
    
    alert(`📋 Request Details

👤 Name: ${request.firstName} ${request.lastName}
📧 Email: ${request.email}
📞 Phone: ${request.phone || "Not provided"}
🏢 Department: ${request.department || "Not specified"}
🎯 Requested Role: ${request.requestedRole}
📅 Submitted: ${createdDate}
📍 Address: ${request.address || "Not provided"}

${request.businessJustification ? "💼 Business Justification:\n" + request.businessJustification : ""}`);
    
  } catch (error) {
    console.error("Error viewing request details:", error);
    alert("Error loading request details: " + error.message);
  }
};

// Delete user function - removes both Firestore data and Firebase Auth
window.deleteUser = async function(userId) {
  try {
    const userDoc = await getDoc(doc(db, "users", userId));
    if (!userDoc.exists()) {
      alert("User not found");
      return;
    }
    
    const userData = userDoc.data();
    const userName = `${userData.firstName} ${userData.lastName}`;
    const userEmail = userData.email;
    const username = userData.username;
    
    // Confirm deletion
    const confirmDelete = confirm(`⚠️ DELETE USER ACCOUNT
    
This will PERMANENTLY delete:
• User: ${userName}
• Email: ${userEmail}  
• Username: ${username}
• All user data and login access

This action CANNOT be undone!

Are you sure you want to delete this user?`);
    
    if (!confirmDelete) {
      return;
    }
    
    // Double confirmation for safety
    const finalConfirm = confirm(`FINAL CONFIRMATION

You are about to permanently delete:
${userName} (${userEmail})

Type YES in the next prompt to confirm deletion.`);
    
    if (!finalConfirm) {
      return;
    }
    
    const confirmation = prompt("Type 'DELETE' to confirm permanent user deletion:");
    if (confirmation !== "DELETE") {
      alert("User deletion cancelled. You must type 'DELETE' exactly to confirm.");
      return;
    }
    
    // Delete all user data from OpenBooks system
    
    // Delete user document
    await deleteDoc(doc(db, "users", userId));
    
    // Delete username mapping
    if (username) {
      await deleteDoc(doc(db, "usernames", username));
    }
    
    // Delete email mapping
    if (userEmail) {
      await deleteDoc(doc(db, "emails", userEmail));
    }
    
    // Delete any user requests for this email
    const requestsQuery = query(collection(db, "userRequests"), where("email", "==", userEmail));
    const requestsSnap = await getDocs(requestsQuery);
    for (const requestDoc of requestsSnap.docs) {
      await deleteDoc(doc(db, "userRequests", requestDoc.id));
    }
    
    // Delete Firebase Auth account using our admin server
    let firebaseAuthResult = null;
    try {
      // Determine admin server URL based on environment
      let adminServerUrl;
      if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        // Development environment - use localhost:3001
        adminServerUrl = `${window.location.protocol}//localhost:3001/delete-firebase-user`;
      } else {
        // Production/Replit environment - use main server with /api prefix
        adminServerUrl = `${window.location.origin}/api/delete-firebase-user`;
      }
      
      const response = await fetch(adminServerUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: userEmail })
      });
      
      firebaseAuthResult = await response.json();
      console.log('Firebase Auth deletion result:', firebaseAuthResult);
    } catch (error) {
      console.error('Error deleting Firebase Auth account:', error);
      firebaseAuthResult = { 
        success: false, 
        error: 'Failed to connect to admin server',
        warning: 'Firebase Auth account may still exist'
      };
    }
    
    // Log the deletion action
    await addDoc(collection(db, "adminActions"), {
      adminUid: currentAdmin.uid,
      action: "user_deleted",
      targetUserId: userId,
      details: `Deleted user ${userName} (${userEmail}) from OpenBooks system`,
      timestamp: serverTimestamp(),
      deletedUserData: {
        name: userName,
        email: userEmail,
        username: username,
        role: userData.role
      },
      firebaseAuthDeletion: firebaseAuthResult
    });
    
    // Show deletion result with Firebase Auth status
    let firebaseAuthMessage = "";
    if (firebaseAuthResult?.success) {
      firebaseAuthMessage = `
🔥 Firebase Authentication:
• ✅ Firebase Auth account deleted successfully
• User completely removed from both systems`;
    } else if (firebaseAuthResult?.warning) {
      firebaseAuthMessage = `
🔥 Firebase Authentication:
• ⚠️ ${firebaseAuthResult.warning}
• User removed from OpenBooks but may still exist in Firebase Auth`;
    } else {
      firebaseAuthMessage = `
🔥 Firebase Authentication:
• ❌ Failed to delete Firebase Auth account
• User removed from OpenBooks but Firebase Auth account still exists
• Error: ${firebaseAuthResult?.error || 'Unknown error'}`;
    }
    
    alert(`✅ User Successfully Deleted

📝 Removed from OpenBooks:
• User profile and data
• Username mapping: ${username}
• Email mapping: ${userEmail}
• Associated requests

🔐 System Access:
• User can no longer access OpenBooks
• All user data has been removed
${firebaseAuthMessage}`);
    
    // Refresh the user list
    await loadUsers();
    await loadSystemStats();
    
  } catch (error) {
    console.error("Error deleting user:", error);
    alert("Error deleting user: " + error.message);
  }
};

// Initialize admin dashboard
onAuthStateChanged(auth, async (user) => {
  if (user) {
    const userDoc = await getDoc(doc(db, "users", user.uid));
    if (userDoc.exists() && userDoc.data().role === "administrator") {
      currentAdmin = { uid: user.uid, ...userDoc.data() };
      
      // Update admin display chip with full name and profile picture
      const adminChip = document.getElementById("adminChip");
      if (adminChip) {
        const userData = userDoc.data();
        let displayName;
        
        // Force refresh from database to ensure we have latest firstName/lastName
        if (userData.firstName && userData.lastName) {
          displayName = `${userData.firstName} ${userData.lastName}`;
        } else {
          // If no firstName/lastName, show username but indicate missing info
          displayName = userData.username || user.email;
          console.log("Admin missing firstName/lastName - click admin chip to update");
        }
        
        // Use setChip to properly handle profile pictures and fallback avatars
        setChip(adminChip, {
          displayName,
          photoURL: userData.photoURL,
          firstName: userData.firstName,
          lastName: userData.lastName,
          username: userData.username
        });
        
        // Add click handler for profile updates
        adminChip.style.cursor = 'pointer';
        adminChip.title = 'Click to update profile';
      }
      
      // Run one-time capitalization update for all existing users
      const capitalizeResult = await capitalizeAllUserNames();
      if (capitalizeResult.success && capitalizeResult.count > 0) {
        console.log(`✅ Capitalized names for ${capitalizeResult.count} users`);
      }
      
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