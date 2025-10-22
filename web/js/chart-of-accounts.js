/**
 * Chart of Accounts Management System
 * Handles account creation, viewing, editing, and deactivation
 * Implements comprehensive accounting rules and validations
 */

import { auth, db } from "./firebaseConfig.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import { 
  collection, getDocs, doc, getDoc, addDoc, updateDoc, setDoc,
  query, where, orderBy, serverTimestamp, deleteDoc, runTransaction, deleteField
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import { setChip } from "./ui.js";

// Current user data
let currentUser = null;
let userRole = null;

// Account Categories and their number ranges
const ACCOUNT_CATEGORIES = {
  'Assets': { range: [1000, 1999], subcategories: ['Current Assets', 'Fixed Assets', 'Other Assets'] },
  'Liabilities': { range: [2000, 2999], subcategories: ['Current Liabilities', 'Long-term Liabilities'] },
  'Equity': { range: [3000, 3999], subcategories: ['Owner\'s Equity', 'Retained Earnings'] },
  'Revenue': { range: [4000, 4999], subcategories: ['Operating Revenue', 'Other Revenue'] },
  'Expenses': { range: [5000, 5999], subcategories: ['Operating Expenses', 'Other Expenses'] }
};

// Normal side for each category
const NORMAL_SIDE = {
  'Assets': 'Debit',
  'Liabilities': 'Credit',
  'Equity': 'Credit',
  'Revenue': 'Credit',
  'Expenses': 'Debit'
};

// Statement types
const STATEMENTS = ['IS', 'BS', 'RE'];

/**
 * Format monetary value with commas and 2 decimal places
 */
function formatCurrency(value) {
  if (value === null || value === undefined || value === '') return '$0.00';
  const num = parseFloat(value);
  if (isNaN(num)) return '$0.00';
  return '$' + num.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Validate account number
 */
function validateAccountNumber(number, category) {
  // Must be numeric only
  if (!/^\d+$/.test(number)) {
    return { valid: false, error: 'Account number must be numeric only (no decimals or letters)' };
  }
  
  const num = parseInt(number);
  
  // Check if in valid range for category
  const categoryInfo = ACCOUNT_CATEGORIES[category];
  if (!categoryInfo) {
    return { valid: false, error: 'Invalid account category' };
  }
  
  if (num < categoryInfo.range[0] || num > categoryInfo.range[1]) {
    return { 
      valid: false, 
      error: `${category} account numbers must be between ${categoryInfo.range[0]} and ${categoryInfo.range[1]}` 
    };
  }
  
  return { valid: true };
}

/**
 * Log event for audit trail
 * CRITICAL: This function now throws errors to ensure audit trail integrity
 * Callers must handle logging failures appropriately
 */
async function logEvent(eventType, accountId, accountName, beforeData, afterData, userId, username) {
  try {
    await addDoc(collection(db, "eventLogs"), {
      eventId: crypto.randomUUID(),
      eventType, // 'account_added', 'account_modified', 'account_deactivated'
      accountId,
      accountName,
      beforeImage: beforeData || null,
      afterImage: afterData || null,
      userId,
      username,
      timestamp: serverTimestamp(),
      dateTime: new Date().toISOString()
    });
  } catch (error) {
    console.error('CRITICAL: Event logging failed - audit trail may be incomplete:', error);
    // Re-throw the error so callers know logging failed
    // This ensures audit trail failures are not silently ignored
    throw new Error(`Failed to log event for audit trail: ${error.message}`);
  }
}

/**
 * Load all accounts for Chart of Accounts
 */
window.loadChartOfAccounts = async function(filters = {}) {
  try {
    console.log('Loading Chart of Accounts with filters:', filters);
    let accountsQuery = query(collection(db, "accounts"), orderBy("accountOrder", "asc"));
    const accountsSnapshot = await getDocs(accountsQuery);
    
    console.log('Raw accounts from Firebase:', accountsSnapshot.size);
    
    let accounts = [];
    accountsSnapshot.forEach(doc => {
      const accountData = { id: doc.id, ...doc.data() };
      accounts.push(accountData);
      console.log('Account loaded:', accountData.accountNumber, accountData.accountName);
    });
    
    console.log('Total accounts before filtering:', accounts.length);
    
    // Apply client-side filters
    if (filters.category) {
      accounts = accounts.filter(a => a.accountCategory === filters.category);
      console.log('After category filter:', accounts.length);
    }
    if (filters.subcategory) {
      accounts = accounts.filter(a => a.accountSubcategory === filters.subcategory);
      console.log('After subcategory filter:', accounts.length);
    }
    if (filters.statement) {
      accounts = accounts.filter(a => a.statement === filters.statement);
      console.log('After statement filter:', accounts.length);
    }
    if (filters.searchTerm) {
      const term = filters.searchTerm.toLowerCase();
      accounts = accounts.filter(a => 
        a.accountName.toLowerCase().includes(term) ||
        a.accountNumber.toString().includes(term) ||
        (a.accountDescription && a.accountDescription.toLowerCase().includes(term))
      );
      console.log('After search filter:', accounts.length);
    }
    if (filters.minBalance !== null && filters.minBalance !== undefined && !isNaN(filters.minBalance)) {
      accounts = accounts.filter(a => parseFloat(a.balance) >= filters.minBalance);
      console.log('After min balance filter:', accounts.length);
    }
    if (filters.maxBalance !== null && filters.maxBalance !== undefined && !isNaN(filters.maxBalance)) {
      accounts = accounts.filter(a => parseFloat(a.balance) <= filters.maxBalance);
      console.log('After max balance filter:', accounts.length);
    }
    
    console.log('Final accounts to display:', accounts.length);
    displayAccounts(accounts);
    updateAccountStats(accounts);
    
  } catch (error) {
    console.error('Error loading chart of accounts:', error);
    alert('Error loading accounts: ' + error.message);
  }
};

/**
 * Display accounts in table
 */
function displayAccounts(accounts) {
  console.log('displayAccounts called with', accounts.length, 'accounts');
  const tbody = document.querySelector('#accountsTable tbody');
  
  if (!tbody) {
    console.error('ERROR: accountsTable tbody not found in DOM!');
    return;
  }
  
  console.log('Found tbody element, clearing existing content');
  tbody.innerHTML = '';
  
  if (accounts.length === 0) {
    console.log('No accounts to display, showing empty message');
    tbody.innerHTML = '<tr><td colspan="11" style="text-align: center;">No accounts found</td></tr>';
    return;
  }
  
  console.log('Rendering', accounts.length, 'accounts to table');
  accounts.forEach((account, index) => {
    console.log(`Rendering account ${index + 1}:`, account.accountNumber, account.accountName);
    const tr = document.createElement('tr');
    tr.className = account.active ? '' : 'inactive-account';
    tr.onclick = () => viewAccountLedger(account.id);
    tr.style.cursor = 'pointer';
    
    tr.innerHTML = `
      <td>${account.accountOrder || '-'}</td>
      <td>${account.accountNumber}</td>
      <td>${account.accountName}</td>
      <td>${account.accountCategory}</td>
      <td>${account.accountSubcategory || '-'}</td>
      <td>${formatCurrency(account.debit)}</td>
      <td>${formatCurrency(account.credit)}</td>
      <td>${formatCurrency(account.balance)}</td>
      <td>${account.statement}</td>
      <td>
        <span class="status-badge ${account.active ? 'status-active' : 'status-inactive'}">
          ${account.active ? 'Active' : 'Inactive'}
        </span>
      </td>
      <td class="account-actions" onclick="event.stopPropagation()">
        <button onclick="viewAccountDetails('${account.id}')" class="btn-action" title="View Details">
          View
        </button>
        ${userRole === 'administrator' ? `
          <button onclick="viewAccountEventLogs('${account.accountName}')" class="btn-action" title="View Event Logs for this Account">
            View Logs
          </button>
          <button onclick="editAccount('${account.id}')" class="btn-action" title="Edit Account">
            Edit
          </button>
          <button onclick="toggleAccountStatus('${account.id}')" class="btn-action ${account.active ? 'btn-deactivate' : 'btn-activate'}" title="${account.active ? 'Deactivate' : 'Activate'} Account">
            ${account.active ? 'Deactivate' : 'Activate'}
          </button>
        ` : ''}
      </td>
    `;
    
    tbody.appendChild(tr);
  });
  
  console.log('Table rendering complete. Total rows added:', accounts.length);
}

/**
 * Update statistics display
 */
function updateAccountStats(accounts) {
  const statsDiv = document.getElementById('accountStats');
  if (!statsDiv) return;
  
  const totalAccounts = accounts.length;
  const activeAccounts = accounts.filter(a => a.active).length;
  const totalAssets = accounts
    .filter(a => a.accountCategory === 'Assets' && a.active)
    .reduce((sum, a) => sum + (parseFloat(a.balance) || 0), 0);
  const totalLiabilities = accounts
    .filter(a => a.accountCategory === 'Liabilities' && a.active)
    .reduce((sum, a) => sum + (parseFloat(a.balance) || 0), 0);
  
  statsDiv.innerHTML = `
    <div class="stat-card">
      <h4>Total Accounts</h4>
      <p class="stat-value">${totalAccounts}</p>
    </div>
    <div class="stat-card">
      <h4>Active Accounts</h4>
      <p class="stat-value">${activeAccounts}</p>
    </div>
    <div class="stat-card">
      <h4>Total Assets</h4>
      <p class="stat-value">${formatCurrency(totalAssets)}</p>
    </div>
    <div class="stat-card">
      <h4>Total Liabilities</h4>
      <p class="stat-value">${formatCurrency(totalLiabilities)}</p>
    </div>
  `;
}

/**
 * Show add account modal
 */
window.showAddAccountModal = function() {
  console.log('Add Account button clicked. Current user role:', userRole);
  
  if (!userRole) {
    alert('User role not loaded yet. Please wait a moment and try again.');
    return;
  }
  
  if (userRole !== 'administrator') {
    alert(`Only administrators can add accounts.\n\nYour current role: ${userRole}\n\nPlease contact an administrator to change your role.`);
    return;
  }
  
  const modal = document.getElementById('addAccountModal');
  if (!modal) {
    alert('Error: Modal element not found');
    return;
  }
  
  // Reset form
  document.getElementById('addAccountForm').reset();
  
  // Populate category dropdown
  populateCategoryDropdown('newAccountCategory');
  
  modal.style.display = 'flex';
  setTimeout(() => modal.classList.add('show'), 10);
  console.log('Add Account modal displayed successfully');
};

/**
 * Populate category dropdown
 */
function populateCategoryDropdown(elementId) {
  const select = document.getElementById(elementId);
  if (!select) return;
  
  select.innerHTML = '<option value="">Select Category</option>';
  Object.keys(ACCOUNT_CATEGORIES).forEach(category => {
    const option = document.createElement('option');
    option.value = category;
    option.textContent = category;
    select.appendChild(option);
  });
}

/**
 * Update subcategory options based on category
 */
window.updateSubcategories = function(categorySelectId, subcategorySelectId) {
  const categorySelect = document.getElementById(categorySelectId);
  const subcategorySelect = document.getElementById(subcategorySelectId);
  
  if (!categorySelect || !subcategorySelect) return;
  
  const category = categorySelect.value;
  subcategorySelect.innerHTML = '<option value="">Select Subcategory</option>';
  
  if (category && ACCOUNT_CATEGORIES[category]) {
    ACCOUNT_CATEGORIES[category].subcategories.forEach(sub => {
      const option = document.createElement('option');
      option.value = sub;
      option.textContent = sub;
      subcategorySelect.appendChild(option);
    });
    
    // Set normal side based on category
    const normalSideInput = document.getElementById(categorySelectId.replace('Category', 'NormalSide'));
    if (normalSideInput) {
      normalSideInput.value = NORMAL_SIDE[category] || '';
    }
  }
};

/**
 * Save new account
 */
window.saveNewAccount = async function(event) {
  event.preventDefault();
  
  if (userRole !== 'administrator') {
    alert('Only administrators can add accounts');
    return;
  }
  
  try {
    const formData = {
      accountName: document.getElementById('newAccountName').value.trim(),
      accountNumber: document.getElementById('newAccountNumber').value.trim(),
      accountDescription: document.getElementById('newAccountDescription').value.trim(),
      accountCategory: document.getElementById('newAccountCategory').value,
      accountSubcategory: document.getElementById('newAccountSubcategory').value,
      normalSide: document.getElementById('newAccountNormalSide').value,
      initialBalance: parseFloat(document.getElementById('newAccountInitialBalance').value) || 0,
      accountOrder: parseInt(document.getElementById('newAccountOrder').value) || 0,
      statement: document.getElementById('newAccountStatement').value,
      comment: document.getElementById('newAccountComment').value.trim()
    };
    
    // Validation
    if (!formData.accountName || !formData.accountNumber || !formData.accountCategory) {
      alert('Please fill in all required fields (Name, Number, Category)');
      return;
    }
    
    // Validate account number format and range
    const numberValidation = validateAccountNumber(formData.accountNumber, formData.accountCategory);
    if (!numberValidation.valid) {
      alert(numberValidation.error);
      return;
    }
    
    // Check for duplicate account number
    const accountsSnapshot = await getDocs(query(
      collection(db, "accounts"),
      where("accountNumber", "==", formData.accountNumber)
    ));
    
    if (!accountsSnapshot.empty) {
      alert('Account number already exists. Please use a different number.');
      return;
    }
    
    // Check for duplicate account name
    const nameSnapshot = await getDocs(query(
      collection(db, "accounts"),
      where("accountName", "==", formData.accountName)
    ));
    
    if (!nameSnapshot.empty) {
      alert('Account name already exists. Please use a different name.');
      return;
    }
    
    // Create account object
    const newAccount = {
      ...formData,
      debit: 0,
      credit: 0,
      balance: formData.initialBalance,
      active: true,
      dateAdded: serverTimestamp(),
      userId: currentUser.uid,
      username: currentUser.username || currentUser.email,
      createdAt: new Date().toISOString()
    };
    
    // Save to database
    console.log('Saving account to Firebase...', formData);
    const docRef = await addDoc(collection(db, "accounts"), newAccount);
    console.log('Account saved successfully with ID:', docRef.id);
    
    // CRITICAL: Log event - if this fails, rollback the account creation
    try {
      await logEvent(
        'account_added',
        docRef.id,
        formData.accountName,
        null,
        newAccount,
        currentUser.uid,
        currentUser.username || currentUser.email
      );
      console.log('Event logged for account:', formData.accountName);
    } catch (logError) {
      // ROLLBACK: Delete the account since logging failed
      console.error('Event logging failed - rolling back account creation');
      await deleteDoc(doc(db, "accounts", docRef.id));
      // Re-throw with clear message about rollback
      throw new Error('Account creation rolled back due to audit logging failure: ' + logError.message);
    }
    
    // Close modal with smooth transition
    closeModal('addAccountModal');
    
    // Clear any active filters to ensure new account is visible
    if (document.getElementById('filterCategory')) {
      document.getElementById('filterCategory').value = '';
      document.getElementById('filterSubcategory').value = '';
      document.getElementById('filterStatement').value = '';
      document.getElementById('searchAccount').value = '';
      document.getElementById('filterMinBalance').value = '';
      document.getElementById('filterMaxBalance').value = '';
    }
    
    // Reload accounts list to show new account
    await loadChartOfAccounts();
    console.log('Chart of Accounts reloaded - new account should be visible');
    
    alert('Account added successfully!');
    
  } catch (error) {
    console.error('Error adding account:', error);
    alert('Error adding account: ' + error.message);
  }
};

/**
 * View account ledger
 */
window.viewAccountLedger = function(accountId) {
  window.location.href = `account-ledger.html?accountId=${accountId}`;
};

/**
 * View event logs for specific account
 */
window.viewAccountEventLogs = function(accountName) {
  window.location.href = `event-logs.html?accountName=${encodeURIComponent(accountName)}`;
};

/**
 * Close modal
 */
window.closeModal = function(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('show');
    setTimeout(() => modal.style.display = 'none', 300);
  }
};

/**
 * Toggle account status (activate/deactivate)
 */
window.toggleAccountStatus = async function(accountId) {
  if (userRole !== 'administrator') {
    alert('Only administrators can activate/deactivate accounts');
    return;
  }
  
  try {
    const accountRef = doc(db, "accounts", accountId);
    const accountDoc = await getDoc(accountRef);
    
    if (!accountDoc.exists()) {
      alert('Account not found');
      return;
    }
    
    const accountData = accountDoc.data();
    const beforeImage = { ...accountData };
    
    // Check if trying to deactivate an account with non-zero balance
    if (accountData.active && parseFloat(accountData.balance) !== 0) {
      alert('Cannot deactivate an account with a non-zero balance. Current balance: ' + formatCurrency(accountData.balance));
      return;
    }
    
    const newStatus = !accountData.active;
    const action = newStatus ? 'activate' : 'deactivate';
    
    if (!confirm(`Are you sure you want to ${action} this account: ${accountData.accountName}?`)) {
      return;
    }
    
    // Update account status
    await updateDoc(accountRef, {
      active: newStatus
    });
    
    const afterImage = { ...accountData, active: newStatus };
    
    // CRITICAL: Log the event - if this fails, rollback the status change
    try {
      await logEvent(
        newStatus ? 'account_activated' : 'account_deactivated',
        accountId,
        accountData.accountName,
        beforeImage,
        afterImage,
        currentUser.uid,
        currentUser.username || currentUser.email
      );
    } catch (logError) {
      // ROLLBACK: Revert the status change since logging failed
      console.error('Event logging failed - rolling back status change');
      await updateDoc(accountRef, {
        active: accountData.active
      });
      // Re-throw with clear message about rollback
      throw new Error('Account status change rolled back due to audit logging failure: ' + logError.message);
    }
    
    alert(`Account ${newStatus ? 'activated' : 'deactivated'} successfully`);
    loadChartOfAccounts();
    
  } catch (error) {
    console.error('Error toggling account status:', error);
    alert('Error updating account status: ' + error.message);
  }
};

/**
 * View account details in modal
 */
window.viewAccountDetails = function(accountId) {
  // For now, redirect to ledger (can enhance with modal later)
  viewAccountLedger(accountId);
};

/**
 * Edit account - load account data and show edit modal
 */
window.editAccount = async function(accountId) {
  if (userRole !== 'administrator') {
    alert('Only administrators can edit accounts');
    return;
  }
  
  try {
    // Get account data
    const accountDoc = await getDoc(doc(db, "accounts", accountId));
    if (!accountDoc.exists()) {
      alert('Account not found');
      return;
    }
    
    const account = accountDoc.data();
    
    // Populate edit form with account data
    document.getElementById('editAccountId').value = accountId;
    document.getElementById('editAccountName').value = account.accountName || '';
    document.getElementById('editAccountNumber').value = account.accountNumber || '';
    document.getElementById('editAccountDescription').value = account.accountDescription || '';
    document.getElementById('editAccountComment').value = account.comment || '';
    document.getElementById('editAccountOrder').value = account.accountOrder || 0;
    document.getElementById('editAccountBalance').value = formatCurrency(account.balance || 0);
    document.getElementById('editAccountStatement').value = account.statement || 'BS';
    
    // Populate category dropdown
    populateCategoryDropdown('editAccountCategory');
    
    // Set category first, then subcategory
    setTimeout(() => {
      document.getElementById('editAccountCategory').value = account.accountCategory || '';
      updateSubcategories('editAccountCategory', 'editAccountSubcategory');
      
      setTimeout(() => {
        document.getElementById('editAccountSubcategory').value = account.accountSubcategory || '';
        document.getElementById('editAccountNormalSide').value = NORMAL_SIDE[account.accountCategory] || '';
      }, 100);
    }, 100);
    
    // Show modal
    const modal = document.getElementById('editAccountModal');
    modal.style.display = 'flex';
    setTimeout(() => modal.classList.add('show'), 10);
  } catch (error) {
    console.error('Error loading account for edit:', error);
    alert('Error loading account: ' + error.message);
  }
};

/**
 * Save edited account
 */
window.saveEditedAccount = async function(event) {
  event.preventDefault();
  
  const accountId = document.getElementById('editAccountId').value;
  const accountName = document.getElementById('editAccountName').value.trim();
  const accountNumber = document.getElementById('editAccountNumber').value.trim();
  const accountCategory = document.getElementById('editAccountCategory').value;
  const accountSubcategory = document.getElementById('editAccountSubcategory').value;
  const accountDescription = document.getElementById('editAccountDescription').value.trim();
  const comment = document.getElementById('editAccountComment').value.trim();
  const accountOrder = parseInt(document.getElementById('editAccountOrder').value) || 0;
  const statement = document.getElementById('editAccountStatement').value;
  
  try {
    // Get current account data for before image
    const accountDoc = await getDoc(doc(db, "accounts", accountId));
    const beforeData = accountDoc.data();
    
    // Validate account number
    const validation = validateAccountNumber(accountNumber, accountCategory);
    if (!validation.valid) {
      alert(validation.error);
      return;
    }
    
    // Check for duplicate account number (excluding current account)
    const accountsSnapshot = await getDocs(collection(db, "accounts"));
    const duplicateNumber = accountsSnapshot.docs.some(doc => 
      doc.id !== accountId && doc.data().accountNumber === accountNumber
    );
    if (duplicateNumber) {
      alert('Account number already exists. Please use a unique number.');
      return;
    }
    
    // Check for duplicate account name (excluding current account)
    const duplicateName = accountsSnapshot.docs.some(doc => 
      doc.id !== accountId && doc.data().accountName.toLowerCase() === accountName.toLowerCase()
    );
    if (duplicateName) {
      alert('Account name already exists. Please use a unique name.');
      return;
    }
    
    // Prepare updated account data
    const updatedData = {
      accountName,
      accountNumber,
      accountCategory,
      accountSubcategory,
      accountDescription,
      comment,
      accountOrder,
      statement,
      normalSide: NORMAL_SIDE[accountCategory],
      modifiedBy: currentUser.uid,
      modifiedAt: serverTimestamp(),
      modifiedByName: currentUser.username || currentUser.email
    };
    
    // Update account in Firestore
    await updateDoc(doc(db, "accounts", accountId), updatedData);
    
    // CRITICAL: Log the modification event - if this fails, rollback the update
    try {
      await logEvent(
        'account_modified',
        accountId,
        accountName,
        beforeData,
        { ...beforeData, ...updatedData },
        currentUser.uid,
        currentUser.username || currentUser.email
      );
    } catch (logError) {
      // ROLLBACK: Revert ALL account changes since logging failed
      console.error('Event logging failed - rolling back account modification');
      // CRITICAL: Use setDoc with merge:false to completely restore previous state
      // This avoids updateDoc's rejection of undefined values and ensures exact rollback
      await setDoc(doc(db, "accounts", accountId), beforeData, { merge: false });
      // Re-throw with clear message about rollback
      throw new Error('Account modification rolled back due to audit logging failure: ' + logError.message);
    }
    
    alert('Account updated successfully!');
    closeModal('editAccountModal');
    loadChartOfAccounts();
    
  } catch (error) {
    console.error('Error updating account:', error);
    alert('Error updating account: ' + error.message);
  }
};

/**
 * Apply filters
 */
window.applyFilters = function() {
  const filters = {
    category: document.getElementById('filterCategory')?.value || '',
    subcategory: document.getElementById('filterSubcategory')?.value || '',
    statement: document.getElementById('filterStatement')?.value || '',
    searchTerm: document.getElementById('searchAccount')?.value || '',
    minBalance: parseFloat(document.getElementById('filterMinBalance')?.value) || null,
    maxBalance: parseFloat(document.getElementById('filterMaxBalance')?.value) || null
  };
  
  loadChartOfAccounts(filters);
};

/**
 * Clear filters
 */
window.clearFilters = function() {
  document.getElementById('filterCategory').value = '';
  document.getElementById('filterSubcategory').value = '';
  document.getElementById('filterStatement').value = '';
  document.getElementById('searchAccount').value = '';
  document.getElementById('filterMinBalance').value = '';
  document.getElementById('filterMaxBalance').value = '';
  loadChartOfAccounts();
};

// Initialize on auth state change
onAuthStateChanged(auth, async (user) => {
  if (user) {
    const userDoc = await getDoc(doc(db, "users", user.uid));
    if (userDoc.exists()) {
      const userData = userDoc.data();
      currentUser = { uid: user.uid, ...userData };
      userRole = userData.role;
      
      // Update user chip
      const userChip = document.getElementById('userChip');
      if (userChip) {
        setChip(userChip, {
          displayName: `${userData.firstName || ''} ${userData.lastName || ''}`.trim() || userData.username,
          photoURL: userData.photoURL,
          firstName: userData.firstName,
          lastName: userData.lastName,
          username: userData.username
        });
      }
      
      // Load chart of accounts
      loadChartOfAccounts();
      
      // Hide admin-only buttons for non-admins
      if (userRole !== 'administrator') {
        const adminButtons = document.querySelectorAll('.admin-only');
        adminButtons.forEach(btn => btn.style.display = 'none');
      }
    } else {
      window.location.href = "index.html";
    }
  } else {
    window.location.href = "index.html";
  }
});

/**
 * Show send email modal and load recipients
 */
window.showSendEmailModal = async function() {
  if (userRole !== 'administrator') {
    alert('Only administrators can send emails');
    return;
  }
  
  const modal = document.getElementById('sendEmailModal');
  if (modal) {
    modal.style.display = 'flex';
    setTimeout(() => modal.classList.add('show'), 10);
    
    // Reset form
    document.getElementById('sendEmailForm').reset();
    document.getElementById('emailStatus').className = 'email-status';
    document.getElementById('emailStatus').textContent = '';
    
    // Clear search input
    const searchInput = document.getElementById('searchRecipients');
    if (searchInput) searchInput.value = '';
    
    // Load recipients
    await loadEmailRecipients();
  }
};

// Store all email recipients for filtering
let allEmailRecipients = [];

/**
 * Load manager and accountant users as email recipients
 */
async function loadEmailRecipients() {
  const recipientsList = document.getElementById('recipientsList');
  if (!recipientsList) return;
  
  try {
    recipientsList.innerHTML = '<div class="loading-message">Loading users...</div>';
    
    // Query Firestore for manager and accountant users (active and not suspended)
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('role', 'in', ['manager', 'accountant']), where('active', '==', true));
    const snapshot = await getDocs(q);
    
    console.log(`Found ${snapshot.size} manager/accountant users in Firestore`);
    
    // Filter out suspended users (Firestore doesn't allow multiple inequality filters)
    const activeUsers = [];
    snapshot.forEach(doc => {
      const user = doc.data();
      if (!user.suspended) {
        activeUsers.push(user);
      }
    });
    
    console.log(`After filtering suspended users: ${activeUsers.length} available recipients`);
    
    if (activeUsers.length === 0) {
      recipientsList.innerHTML = '<div class="no-users-message">No manager or accountant users found</div>';
      allEmailRecipients = [];
      return;
    }
    
    // Sort users: Managers first, then Accountants
    activeUsers.sort((a, b) => {
      // Manager (1) comes before Accountant (2)
      const roleOrder = { 'manager': 1, 'accountant': 2 };
      const roleComparison = (roleOrder[a.role] || 3) - (roleOrder[b.role] || 3);
      
      if (roleComparison !== 0) return roleComparison;
      
      // Within same role, sort alphabetically by name
      const nameA = `${a.firstName || ''} ${a.lastName || ''}`.trim() || a.username || '';
      const nameB = `${b.firstName || ''} ${b.lastName || ''}`.trim() || b.username || '';
      return nameA.localeCompare(nameB);
    });
    
    // Store all recipients for filtering
    allEmailRecipients = activeUsers;
    
    // Display all recipients
    displayEmailRecipients(activeUsers);
    
    console.log(`Loaded ${activeUsers.length} recipients (sorted: managers first, then accountants)`);
    
  } catch (error) {
    console.error('Error loading recipients:', error);
    recipientsList.innerHTML = '<div class="error-message">Error loading users. Please try again.</div>';
    allEmailRecipients = [];
  }
}

/**
 * Display email recipients in the list
 */
function displayEmailRecipients(users) {
  const recipientsList = document.getElementById('recipientsList');
  if (!recipientsList) return;
  
  recipientsList.innerHTML = '';
  
  if (users.length === 0) {
    recipientsList.innerHTML = '<div class="no-users-message">No users match your search</div>';
    return;
  }
  
  users.forEach(user => {
    const checkbox = document.createElement('label');
    checkbox.className = 'recipient-checkbox';
    
    const fullName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username || 'Unknown';
    const roleLabel = user.role.charAt(0).toUpperCase() + user.role.slice(1);
    
    checkbox.innerHTML = `
      <input type="checkbox" name="recipients" value="${user.email}" data-name="${fullName}">
      <div class="recipient-info">
        <span class="recipient-name">${fullName}</span>
        <span class="recipient-email">${user.email}</span>
      </div>
      <span class="recipient-role">${roleLabel}</span>
    `;
    
    recipientsList.appendChild(checkbox);
  });
}

/**
 * Filter email recipients based on search query
 */
window.filterEmailRecipients = function() {
  const searchInput = document.getElementById('searchRecipients');
  if (!searchInput) return;
  
  const searchTerm = searchInput.value.toLowerCase().trim();
  
  // If no search term, show all recipients
  if (!searchTerm) {
    displayEmailRecipients(allEmailRecipients);
    return;
  }
  
  // Filter recipients based on search term
  const filteredUsers = allEmailRecipients.filter(user => {
    const fullName = `${user.firstName || ''} ${user.lastName || ''}`.trim().toLowerCase();
    const email = user.email.toLowerCase();
    const role = user.role.toLowerCase();
    const username = (user.username || '').toLowerCase();
    
    return fullName.includes(searchTerm) || 
           email.includes(searchTerm) || 
           role.includes(searchTerm) ||
           username.includes(searchTerm);
  });
  
  // Display filtered results
  displayEmailRecipients(filteredUsers);
  
  console.log(`Search: "${searchTerm}" - Found ${filteredUsers.length} of ${allEmailRecipients.length} recipients`);
};

/**
 * Handle send email form submission
 */
window.handleSendEmail = async function(event) {
  event.preventDefault();
  
  if (userRole !== 'administrator') {
    alert('Only administrators can send emails');
    return;
  }
  
  try {
    // Get selected recipients
    const checkboxes = document.querySelectorAll('input[name="recipients"]:checked');
    if (checkboxes.length === 0) {
      showEmailStatus('Please select at least one recipient', 'error');
      return;
    }
    
    const recipients = Array.from(checkboxes).map(cb => cb.value);
    const subject = document.getElementById('emailSubject').value.trim();
    const message = document.getElementById('emailMessage').value.trim();
    
    if (!subject || !message) {
      showEmailStatus('Please fill in all required fields', 'error');
      return;
    }
    
    // Disable send button
    const sendBtn = document.getElementById('sendEmailBtn');
    sendBtn.disabled = true;
    
    // Show loading status
    showEmailStatus('Sending email...', 'loading');
    
    // Get Firebase ID token for authentication
    const user = auth.currentUser;
    if (!user) {
      throw new Error('You must be logged in to send emails');
    }
    
    const idToken = await user.getIdToken();
    
    // Send email via Firebase Admin server
    // Use the current host for Firebase Admin server in production
    const firebaseAdminUrl = window.location.hostname === 'localhost' 
      ? 'http://localhost:3001'
      : `${window.location.protocol}//${window.location.hostname}:3001`;
    
    const response = await fetch(`${firebaseAdminUrl}/send-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`
      },
      body: JSON.stringify({
        to: recipients,
        subject: subject,
        text: message,
        html: `<p>${message.replace(/\n/g, '<br>')}</p>`
      })
    });
    
    const result = await response.json();
    
    if (!response.ok || !result.success) {
      throw new Error(result.error || 'Failed to send email');
    }
    
    // Show success
    const acceptedCount = result.accepted?.length || recipients.length;
    showEmailStatus(`Email sent successfully to ${acceptedCount} recipient(s)!`, 'success');
    
    // Reset form after 2 seconds
    setTimeout(() => {
      closeModal('sendEmailModal');
    }, 2000);
    
    console.log('Email sent successfully:', result);
    
  } catch (error) {
    console.error('Error sending email:', error);
    showEmailStatus(`Error: ${error.message}`, 'error');
    
  } finally {
    // Re-enable send button
    const sendBtn = document.getElementById('sendEmailBtn');
    if (sendBtn) sendBtn.disabled = false;
  }
};

/**
 * Show email status message
 */
function showEmailStatus(message, type) {
  const statusEl = document.getElementById('emailStatus');
  if (statusEl) {
    statusEl.textContent = message;
    statusEl.className = `email-status show ${type}`;
  }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  // Populate filter dropdowns
  populateCategoryDropdown('filterCategory');
  
  const statementFilter = document.getElementById('filterStatement');
  if (statementFilter) {
    STATEMENTS.forEach(stmt => {
      const option = document.createElement('option');
      option.value = stmt;
      option.textContent = stmt;
      statementFilter.appendChild(option);
    });
  }
});
