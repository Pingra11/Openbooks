/**
 * Journal Entries Management
 * Create, view, edit, and post journal entries
 */

import { auth, db } from "./firebaseConfig.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import { 
  collection, getDocs, doc, getDoc, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, Timestamp, writeBatch
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import { setChip } from "./ui.js";
import { 
  ERROR_CODES, 
  getErrorMessageSync, 
  displayError, 
  clearErrors, 
  clearFieldErrors,
  initializeErrorMessages
} from "./error-messages.js";

let currentUser = null;
let allAccounts = [];
let lineItemCounter = 0;
let attachedFiles = []; // Store files to be uploaded

/**
 * ADMIN FUNCTION: Delete all pending approval entries
 */
window.deletePendingApprovals = async function() {
  try {
    const q = query(collection(db, "journalEntries"), where("status", "==", "pending_approval"));
    const snapshot = await getDocs(q);
    
    console.log(`Found ${snapshot.size} pending approval entries to delete`);
    
    if (snapshot.size === 0) {
      alert('No pending approval entries found.');
      return;
    }
    
    const batch = writeBatch(db);
    snapshot.forEach((doc) => {
      batch.delete(doc.ref);
      console.log(`Deleting entry #${doc.data().entryNumber}`);
    });
    
    await batch.commit();
    console.log('All pending approvals deleted successfully');
    alert(`Successfully deleted ${snapshot.size} pending approval entries.`);
    
    // Reload the entries list if we're on the journal page
    if (typeof loadJournalEntries === 'function') {
      loadJournalEntries();
    }
  } catch (error) {
    console.error('Error deleting pending approvals:', error);
    alert('Error deleting entries: ' + error.message);
  }
};

/**
 * Format currency
 */
function formatCurrency(value) {
  if (value === null || value === undefined || value === '') return '$0.00';
  const num = parseFloat(value);
  if (isNaN(num)) return '$0.00';
  return '$' + num.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Format date for display
 */
function formatDate(timestamp) {
  if (!timestamp) return '-';
  let date;
  if (timestamp.toDate) {
    date = timestamp.toDate();
  } else if (timestamp instanceof Date) {
    date = timestamp;
  } else {
    date = new Date(timestamp);
  }
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * Load all accounts for dropdown
 */
async function loadAccounts() {
  try {
    const accountsSnapshot = await getDocs(
      query(collection(db, "accounts"), orderBy("accountNumber"))
    );
    
    allAccounts = [];
    accountsSnapshot.forEach(doc => {
      const account = doc.data();
      if (account.active !== false) {
        allAccounts.push({ id: doc.id, ...account });
      }
    });
  } catch (error) {
    console.error('Error loading accounts:', error);
  }
}

/**
 * Load journal entries
 */
async function loadJournalEntries(filters = {}) {
  try {
    const entriesSnapshot = await getDocs(
      query(collection(db, "journalEntries"), orderBy("entryDate", "desc"))
    );
    
    let entries = [];
    entriesSnapshot.forEach(doc => {
      entries.push({ id: doc.id, ...doc.data() });
    });
    
    // Apply filters
    if (filters.status) {
      entries = entries.filter(e => e.status === filters.status);
    }
    if (filters.searchTerm) {
      const term = filters.searchTerm.toLowerCase();
      entries = entries.filter(e => 
        e.entryNumber?.toString().includes(term) ||
        e.description?.toLowerCase().includes(term) ||
        e.reference?.toLowerCase().includes(term) ||
        // Search by account name in line items
        e.lineItems?.some(item => item.accountName?.toLowerCase().includes(term)) ||
        // Search by amount
        e.totalAmount?.toString().includes(term)
      );
    }
    if (filters.fromDate) {
      const fromDate = new Date(filters.fromDate);
      entries = entries.filter(e => {
        const entryDate = e.entryDate.toDate ? e.entryDate.toDate() : new Date(e.entryDate);
        return entryDate >= fromDate;
      });
    }
    if (filters.toDate) {
      const toDate = new Date(filters.toDate);
      toDate.setHours(23, 59, 59);
      entries = entries.filter(e => {
        const entryDate = e.entryDate.toDate ? e.entryDate.toDate() : new Date(e.entryDate);
        return entryDate <= toDate;
      });
    }
    
    displayEntries(entries);
    
  } catch (error) {
    console.error('Error loading journal entries:', error);
    alert('Error loading journal entries: ' + error.message);
  }
}

/**
 * Display entries in table
 */
function displayEntries(entries) {
  const tbody = document.querySelector('#journalTable tbody');
  
  if (entries.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align: center;">No journal entries found</td></tr>';
    return;
  }
  
  tbody.innerHTML = entries.map(entry => {
    // Status badge with all approval workflow states
    let statusBadge;
    switch (entry.status) {
      case 'posted':
        statusBadge = '<span class="badge badge-success">Posted</span>';
        break;
      case 'approved':
        statusBadge = '<span class="badge badge-success">Approved</span>';
        break;
      case 'pending_approval':
        statusBadge = '<span class="badge badge-info">Pending Approval</span>';
        break;
      case 'rejected':
        statusBadge = '<span class="badge badge-danger">Rejected</span>';
        break;
      case 'draft':
        statusBadge = '<span class="badge badge-warning">Draft</span>';
        break;
      default:
        statusBadge = '<span class="badge badge-secondary">Unknown</span>';
    }
    
    // Role-based action buttons
    const isManager = currentUser && (currentUser.role === 'Manager' || currentUser.role === 'Administrator');
    const isAccountant = currentUser && currentUser.role === 'Accountant';
    
    let actions = '';
    
    if (entry.status === 'draft') {
      actions = `
        <button onclick="editEntry('${entry.id}')" class="btn-action" title="Edit Entry">Edit</button>
        <button onclick="deleteEntry('${entry.id}')" class="btn-action btn-danger" title="Delete Entry">Delete</button>
        <button onclick="viewEntry('${entry.id}')" class="btn-action" title="View Details">View</button>
      `;
    } else if (entry.status === 'pending_approval' && isManager) {
      actions = `
        <button onclick="approveEntry('${entry.id}')" class="btn-action btn-success" title="Approve Entry">✓ Approve</button>
        <button onclick="showRejectModal('${entry.id}')" class="btn-action btn-danger" title="Reject Entry">✗ Reject</button>
        <button onclick="viewEntry('${entry.id}')" class="btn-action" title="View Details">View</button>
      `;
    } else if (entry.status === 'approved' && isManager) {
      actions = `
        <button onclick="postApprovedEntry('${entry.id}')" class="btn-action btn-primary" title="Post to Ledger">📝 Post</button>
        <button onclick="viewEntry('${entry.id}')" class="btn-action" title="View Details">View</button>
      `;
    } else if (entry.status === 'posted') {
      actions = `
        <button onclick="viewEntry('${entry.id}')" class="btn-action" title="View Details">View</button>
        <button onclick="reverseEntry('${entry.id}')" class="btn-action" title="Reverse Entry">Reverse</button>
      `;
    } else if (entry.status === 'rejected') {
      actions = `
        <button onclick="viewEntry('${entry.id}')" class="btn-action" title="View Details & Rejection Reason">View</button>
        ${entry.createdBy === currentUser?.uid ? `<button onclick="editEntry('${entry.id}')" class="btn-action" title="Edit & Resubmit">Edit</button>` : ''}
      `;
    } else {
      actions = `<button onclick="viewEntry('${entry.id}')" class="btn-action" title="View Details">View</button>`;
    }
    
    return `
      <tr>
        <td>${entry.entryNumber || '-'}</td>
        <td>${formatDate(entry.entryDate)}</td>
        <td>${entry.description || '-'}</td>
        <td>${statusBadge}</td>
        <td>${formatCurrency(entry.totalAmount)}</td>
        <td>${entry.createdByName || entry.createdBy}</td>
        <td class="action-buttons">${actions}</td>
      </tr>
    `;
  }).join('');
}

/**
 * Show new entry modal
 */
window.showNewEntryModal = async function() {
  console.log('New Entry button clicked');
  
  const modal = document.getElementById('journalEntryModal');
  if (!modal) {
    alert('Error: Journal entry modal not found. Please refresh the page.');
    console.error('Modal element "journalEntryModal" not found');
    return;
  }
  
  // Ensure accounts are loaded before opening modal
  if (allAccounts.length === 0) {
    console.log('Accounts not loaded yet, loading now...');
    await loadAccounts();
  }
  
  document.getElementById('modalTitle').textContent = 'New Journal Entry';
  document.getElementById('journalEntryForm').reset();
  document.getElementById('entryId').value = '';
  
  // Set today's date
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('entryDate').value = today;
  
  // Auto-generate next entry reference number
  const entriesSnapshot = await getDocs(collection(db, "journalEntries"));
  const nextEntryNumber = entriesSnapshot.size + 1;
  const reference = `JE-${String(nextEntryNumber).padStart(6, '0')}`;
  document.getElementById('entryReference').value = reference;
  document.getElementById('entryReference').readOnly = true;
  
  // Clear line items
  document.getElementById('lineItemsContainer').innerHTML = '';
  lineItemCounter = 0;
  
  // Clear attached files
  attachedFiles = [];
  displayAttachedFiles();
  
  // Add two initial line items
  addLineItem();
  addLineItem();
  
  modal.style.display = 'flex';
  setTimeout(() => modal.classList.add('show'), 10);
  console.log('Journal entry modal opened successfully');
};

/**
 * Close journal modal
 */
window.closeJournalModal = function() {
  const modal = document.getElementById('journalEntryModal');
  if (modal) {
    modal.classList.remove('show');
    setTimeout(() => modal.style.display = 'none', 300);
  }
  // Clear attached files
  attachedFiles = [];
  displayAttachedFiles();
};

/**
 * Close view modal
 */
window.closeViewModal = function() {
  const modal = document.getElementById('viewEntryModal');
  if (modal) {
    modal.classList.remove('show');
    setTimeout(() => modal.style.display = 'none', 300);
  }
};

/**
 * Add line item row
 */
window.addLineItem = function() {
  lineItemCounter++;
  const container = document.getElementById('lineItemsContainer');
  
  const lineItemDiv = document.createElement('div');
  lineItemDiv.className = 'line-item';
  lineItemDiv.id = `lineItem${lineItemCounter}`;
  
  lineItemDiv.innerHTML = `
    <div class="line-item-grid">
      <div class="form-group">
        <select class="account-select" data-line="${lineItemCounter}" onchange="updateTotals()">
          <option value="">Select Account...</option>
          ${allAccounts.map(acc => 
            `<option value="${acc.id}">${acc.accountNumber} - ${acc.accountName}</option>`
          ).join('')}
        </select>
      </div>
      <div class="form-group">
        <input type="number" step="0.01" min="0" placeholder="0.00" 
               class="debit-input" data-line="${lineItemCounter}" 
               onkeyup="handleDebitCredit(${lineItemCounter}, 'debit')" 
               onchange="updateTotals()">
      </div>
      <div class="form-group">
        <input type="number" step="0.01" min="0" placeholder="0.00" 
               class="credit-input" data-line="${lineItemCounter}" 
               onkeyup="handleDebitCredit(${lineItemCounter}, 'credit')" 
               onchange="updateTotals()">
      </div>
      <div class="form-group">
        <input type="text" placeholder="Optional" 
               class="description-input" data-line="${lineItemCounter}">
      </div>
      <button type="button" onclick="removeLineItem(${lineItemCounter})" class="btn-icon" title="Remove Line">
        🗑️
      </button>
    </div>
  `;
  
  container.appendChild(lineItemDiv);
  updateTotals();
};

/**
 * Remove line item
 */
window.removeLineItem = function(lineNumber) {
  const lineItem = document.getElementById(`lineItem${lineNumber}`);
  if (lineItem) {
    lineItem.remove();
    updateTotals();
  }
};

/**
 * Handle debit/credit input (clear opposite field)
 */
window.handleDebitCredit = function(lineNumber, type) {
  const debitInput = document.querySelector(`.debit-input[data-line="${lineNumber}"]`);
  const creditInput = document.querySelector(`.credit-input[data-line="${lineNumber}"]`);
  
  if (type === 'debit' && debitInput.value) {
    creditInput.value = '';
  } else if (type === 'credit' && creditInput.value) {
    debitInput.value = '';
  }
  
  updateTotals();
};

/**
 * Update totals
 */
window.updateTotals = function() {
  const debitInputs = document.querySelectorAll('.debit-input');
  const creditInputs = document.querySelectorAll('.credit-input');
  
  let totalDebits = 0;
  let totalCredits = 0;
  
  debitInputs.forEach(input => {
    const val = parseFloat(input.value) || 0;
    totalDebits += val;
  });
  
  creditInputs.forEach(input => {
    const val = parseFloat(input.value) || 0;
    totalCredits += val;
  });
  
  const difference = Math.abs(totalDebits - totalCredits);
  
  document.getElementById('totalDebits').textContent = formatCurrency(totalDebits);
  document.getElementById('totalCredits').textContent = formatCurrency(totalCredits);
  document.getElementById('totalDifference').textContent = formatCurrency(difference);
  
  // Color the difference
  const diffElement = document.getElementById('totalDifference');
  if (difference === 0 && totalDebits > 0) {
    diffElement.style.color = 'var(--success)';
  } else {
    diffElement.style.color = 'var(--error)';
  }
};

/**
 * Handle file selection with validation
 */
window.handleFileSelect = function(event) {
  const files = Array.from(event.target.files);
  const maxSize = 2 * 1024 * 1024; // 2MB (files stored in database)
  
  // Clear previous file errors
  clearFieldErrors('attachment');
  
  files.forEach(file => {
    // Check file size first
    if (file.size > maxSize) {
      displayError(`File too large: ${file.name}. Maximum size: 2MB. Your file: ${formatFileSize(file.size)}`);
      return;
    }
    
    // Check file type
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv',
      'image/jpeg',
      'image/png'
    ];
    
    if (!allowedTypes.includes(file.type)) {
      displayError(getErrorMessageSync(ERROR_CODES.JE_INVALID_FILE_TYPE, {
        fileName: file.name
      }));
      return;
    }
    
    attachedFiles.push(file);
  });
  
  displayAttachedFiles();
  event.target.value = ''; // Reset input
};

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Validate and sanitize URL for safe use
 * Allows data URLs (base64) for file attachments
 */
function sanitizeUrl(url) {
  if (!url) return '#';
  
  // Allow data URLs (base64 encoded files)
  if (url.startsWith('data:')) {
    return url;
  }
  
  // Also allow https URLs as fallback
  try {
    const urlObj = new URL(url);
    if (urlObj.protocol === 'https:') {
      return url;
    }
  } catch (e) {
    // Invalid URL
  }
  
  return '#'; // Return safe fallback
}

/**
 * Display attached files
 */
function displayAttachedFiles() {
  const container = document.getElementById('attachedFilesList');
  
  if (attachedFiles.length === 0) {
    container.innerHTML = '';
    return;
  }
  
  container.innerHTML = attachedFiles.map((file, index) => `
    <div class="attached-file-item">
      <div class="file-item-info">
        <span class="file-icon">${getFileIcon(file.type)}</span>
        <div class="file-details">
          <span class="file-name">${escapeHtml(file.name)}</span>
          <span class="file-size">${formatFileSize(file.size)}</span>
        </div>
      </div>
      <button type="button" class="file-remove-btn" onclick="removeAttachedFile(${index})" title="Remove file">
        ✖
      </button>
    </div>
  `).join('');
}

/**
 * Remove attached file
 */
window.removeAttachedFile = function(index) {
  attachedFiles.splice(index, 1);
  displayAttachedFiles();
};

/**
 * Format file size for display
 */
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Get file icon based on type
 */
function getFileIcon(fileType) {
  if (fileType.includes('pdf')) return '📄';
  if (fileType.includes('word') || fileType.includes('document')) return '📝';
  if (fileType.includes('excel') || fileType.includes('spreadsheet')) return '📊';
  if (fileType.includes('csv')) return '📋';
  if (fileType.includes('image')) return '🖼️';
  return '📎';
}

/**
 * Convert files to base64 data URLs for storage in Firestore
 * (No Firebase Storage needed - files stored directly in database)
 */
async function uploadFilesToStorage(entryId) {
  console.log('📎 Processing files - Entry ID:', entryId, 'Files:', attachedFiles.length);
  
  if (attachedFiles.length === 0) {
    console.log('📎 No files to process');
    return [];
  }
  
  const processPromises = attachedFiles.map(async (file) => {
    console.log('📎 Converting file to base64:', file.name, `(${formatFileSize(file.size)})`);
    
    // Convert file to base64 data URL
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    
    console.log('📎 File converted successfully:', file.name);
    
    return {
      name: file.name,
      size: file.size,
      type: file.type,
      url: dataUrl, // Store base64 data URL instead of Firebase Storage URL
      uploadedAt: new Date().toISOString()
    };
  });
  
  const processedFiles = await Promise.all(processPromises);
  console.log('📎 All files processed:', processedFiles.length, 'file(s)');
  return processedFiles;
}

/**
 * Reset journal entry form
 */
window.resetJournalEntry = function() {
  if (!confirm('Are you sure you want to reset this form? All unsaved changes will be lost.')) {
    return;
  }
  
  // Clear form fields
  document.getElementById('entryDate').value = '';
  document.getElementById('entryReference').value = '';
  document.getElementById('entryDescription').value = '';
  
  // Clear line items
  document.getElementById('lineItemsContainer').innerHTML = '';
  lineItemCounter = 0;
  
  // Add two blank line items
  addLineItem();
  addLineItem();
  
  // Clear attached files
  attachedFiles = [];
  displayAttachedFiles();
  
  // Reset totals
  updateTotals();
};

/**
 * Save journal entry (with approval workflow support and comprehensive error validation)
 */
window.saveJournalEntry = async function(status) {
  try {
    // Clear previous errors
    clearErrors();
    
    const entryDate = document.getElementById('entryDate').value;
    const reference = document.getElementById('entryReference').value;
    const description = document.getElementById('entryDescription').value;
    
    let hasErrors = false;
    
    // Validate required fields
    if (!entryDate) {
      displayError(getErrorMessageSync(ERROR_CODES.JE_MISSING_DATE));
      hasErrors = true;
    }
    
    if (!description) {
      displayError(getErrorMessageSync(ERROR_CODES.JE_MISSING_DESCRIPTION));
      hasErrors = true;
    }
    
    // Collect and validate line items
    const lineItems = [];
    const accountSelects = document.querySelectorAll('.account-select');
    
    accountSelects.forEach((select, index) => {
      const lineNumber = select.dataset.line;
      const accountId = select.value;
      const debit = parseFloat(document.querySelector(`.debit-input[data-line="${lineNumber}"]`).value) || 0;
      const credit = parseFloat(document.querySelector(`.credit-input[data-line="${lineNumber}"]`).value) || 0;
      const lineDesc = document.querySelector(`.description-input[data-line="${lineNumber}"]`).value;
      
      // Skip completely empty lines
      if (!accountId && debit === 0 && credit === 0) {
        return;
      }
      
      // Validate line item has account
      if (!accountId && (debit > 0 || credit > 0)) {
        displayError(getErrorMessageSync(ERROR_CODES.JE_MISSING_ACCOUNT));
        hasErrors = true;
        return;
      }
      
      // Validate line item has amount
      if (accountId && debit === 0 && credit === 0) {
        displayError(getErrorMessageSync(ERROR_CODES.JE_MISSING_AMOUNT));
        hasErrors = true;
        return;
      }
      
      // Validate not both debit and credit
      if (debit > 0 && credit > 0) {
        displayError(getErrorMessageSync(ERROR_CODES.JE_BOTH_DEBIT_CREDIT));
        hasErrors = true;
        return;
      }
      
      // Validate amount is positive
      if ((debit < 0 || credit < 0) || (debit > 0 && debit < 0.01) || (credit > 0 && credit < 0.01)) {
        displayError(getErrorMessageSync(ERROR_CODES.JE_INVALID_AMOUNT));
        hasErrors = true;
        return;
      }
      
      if (accountId && (debit > 0 || credit > 0)) {
        const account = allAccounts.find(a => a.id === accountId);
        
        // Validate account is active
        if (account && account.active === false) {
          displayError(getErrorMessageSync(ERROR_CODES.JE_INACTIVE_ACCOUNT, {
            accountName: account.accountName
          }));
          hasErrors = true;
          return;
        }
        
        lineItems.push({
          accountId,
          accountNumber: account.accountNumber,
          accountName: account.accountName,
          debit,
          credit,
          description: lineDesc
        });
      }
    });
    
    // Validate minimum line items
    if (lineItems.length < 2) {
      displayError(getErrorMessageSync(ERROR_CODES.JE_INSUFFICIENT_LINES));
      hasErrors = true;
    }
    
    // Validate debits = credits
    const totalDebits = lineItems.reduce((sum, item) => sum + item.debit, 0);
    const totalCredits = lineItems.reduce((sum, item) => sum + item.credit, 0);
    const difference = Math.abs(totalDebits - totalCredits);
    
    if (difference > 0.01) {
      displayError(getErrorMessageSync(ERROR_CODES.JE_UNBALANCED, {
        difference: formatCurrency(difference)
      }));
      hasErrors = true;
    }
    
    // Validate not zero total
    if (totalDebits === 0 || totalCredits === 0) {
      displayError(getErrorMessageSync(ERROR_CODES.JE_ZERO_TOTAL));
      hasErrors = true;
    }
    
    // If there are errors, stop here
    if (hasErrors) {
      return;
    }
    
    // Sort line items: ALL debits before ALL credits
    lineItems.sort((a, b) => {
      const aIsDebit = a.debit > 0;
      const bIsDebit = b.debit > 0;
      
      // If types are different, debits come first
      if (aIsDebit && !bIsDebit) return -1;
      if (!aIsDebit && bIsDebit) return 1;
      
      // Same type, maintain original order
      return 0;
    });
    
    const entryId = document.getElementById('entryId').value;
    
    // Store original entry data for audit trail (before editing)
    let originalEntryData = null;
    
    // If new entry, generate entry number
    let entryNumber;
    if (!entryId) {
      const entriesSnapshot = await getDocs(collection(db, "journalEntries"));
      entryNumber = entriesSnapshot.size + 1;
    } else {
      // Get existing entry number and preserve original data
      const entryDoc = await getDoc(doc(db, "journalEntries", entryId));
      const entryData = entryDoc.data();
      entryNumber = entryData.entryNumber;
      
      // Store original entry for audit trail
      originalEntryData = {
        entryNumber: entryData.entryNumber,
        reference: entryData.reference,
        status: entryData.status,
        description: entryData.description,
        totalAmount: entryData.totalAmount,
        lineItemCount: entryData.lineItems?.length || 0
      };
    }
    
    const entryData = {
      entryNumber,
      entryDate: Timestamp.fromDate(new Date(entryDate)),
      reference: reference || null,
      description,
      lineItems,
      totalAmount: totalDebits,
      status,
      createdBy: currentUser.uid,
      createdByName: `${currentUser.firstName || ''} ${currentUser.lastName || ''}`.trim(),
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    };
    
    // Role-based posting permissions (use lowercase for comparison)
    const userRole = currentUser?.role?.toLowerCase() || '';
    const isManager = userRole === 'manager' || userRole === 'administrator';
    const isAccountant = userRole === 'accountant';
    
    // Managers/Admins can post directly, Accountants submit for approval
    if (status === 'posted' && !isManager) {
      alert('Only Managers and Administrators can post journal entries directly. Your entry will be submitted for approval.');
      status = 'pending_approval';
      entryData.status = 'pending_approval';
      entryData.submittedForApprovalAt = Timestamp.now();
    }
    
    // If manager/admin is posting, record CURRENT USER as the poster
    if (status === 'posted' && isManager) {
      entryData.postedBy = currentUser.uid;
      entryData.postedByName = `${currentUser.firstName || ''} ${currentUser.lastName || ''}`.trim();
      entryData.postedAt = Timestamp.now();
    }
    
    if (entryId) {
      // Get the existing entry to preserve certain fields
      const existingEntryDoc = await getDoc(doc(db, "journalEntries", entryId));
      const existingEntry = existingEntryDoc.data();
      
      // Update existing - preserve createdBy and createdAt
      const updateData = {
        ...entryData,
        createdBy: existingEntry.createdBy,
        createdByName: existingEntry.createdByName,
        createdAt: existingEntry.createdAt
      };
      
      await updateDoc(doc(db, "journalEntries", entryId), updateData);
      
      // Upload new files if any
      if (attachedFiles.length > 0) {
        console.log('📎 Updating existing entry with attachments');
        const uploadedFiles = await uploadFilesToStorage(entryId);
        // Merge with existing attachments
        const existingAttachments = existingEntry.attachments || [];
        const allAttachments = [...existingAttachments, ...uploadedFiles];
        console.log('📎 Saving attachments to database:', allAttachments);
        await updateDoc(doc(db, "journalEntries", entryId), {
          attachments: allAttachments
        });
        console.log('📎 Attachments saved successfully');
      }
      
      // If resubmitting after rejection, clear rejection fields
      if (status === 'pending_approval') {
        await updateDoc(doc(db, "journalEntries", entryId), {
          rejectedBy: null,
          rejectedByName: null,
          rejectedAt: null,
          rejectionReason: null,
          submittedForApprovalAt: Timestamp.now()
        });
      }
      
      // If manager is posting an edited entry directly
      if (status === 'posted' && isManager) {
        await postJournalEntry(entryId, lineItems, reference);
      }
    } else {
      // Create new - process files first if any
      let uploadedFiles = [];
      if (attachedFiles.length > 0) {
        console.log('📎 New entry - processing attachments before save');
        uploadedFiles = await uploadFilesToStorage('temp'); // Use temp ID since we don't have doc ID yet
        console.log('📎 Files processed:', uploadedFiles.length, 'file(s)');
      }
      
      // Add attachments to entry data before creating document
      if (uploadedFiles.length > 0) {
        entryData.attachments = uploadedFiles;
      }
      
      // Create the document with attachments included
      const docRef = await addDoc(collection(db, "journalEntries"), entryData);
      const newEntryId = docRef.id;
      console.log('📎 Entry created with', uploadedFiles.length, 'attachment(s)');
      
      // If posting directly, update account balances
      if (status === 'posted' && isManager) {
        await postJournalEntry(docRef.id, lineItems, reference);
      }
    }
    
    // Log event with complete audit trail
    const eventDescription = status === 'posted' ? 'Posted' : status === 'pending_approval' ? 'Submitted for approval' : 'Saved';
    const affectedAccounts = [...new Set(lineItems.map(item => item.accountName))].join(' | ');
    
    await addDoc(collection(db, "eventLogs"), {
      eventId: crypto.randomUUID(),
      eventType: 'journal_entry',
      description: `${eventDescription} journal entry #${entryNumber}`,
      accountName: affectedAccounts,
      beforeImage: entryId ? originalEntryData : null,
      afterImage: {
        entryNumber,
        reference,
        status,
        description,
        totalAmount: totalDebits,
        lineItemCount: lineItems.length,
        hasAttachments: attachedFiles.length > 0,
        affectedAccounts: affectedAccounts
      },
      userId: currentUser.uid,
      username: currentUser.username,
      timestamp: Timestamp.now(),
      dateTime: new Date().toISOString()
    });
    
    // Send notification to managers when entry is submitted for approval
    if (status === 'pending_approval') {
      try {
        const submittedByName = `${currentUser.firstName || ''} ${currentUser.lastName || ''}`.trim() || currentUser.username;
        
        // Get Firebase ID token for authentication
        const user = auth.currentUser;
        const idToken = await user.getIdToken();
        
        // Determine correct API URL based on environment
        const firebaseAdminUrl = window.location.hostname === 'localhost' 
          ? 'http://localhost:3001'
          : `${window.location.protocol}//${window.location.hostname}:3001`;
        
        const response = await fetch(`${firebaseAdminUrl}/notify-managers-journal-submission`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`
          },
          body: JSON.stringify({
            journalEntryNumber: entryNumber,
            submittedBy: submittedByName,
            date: entryDate,
            description: description,
            totalAmount: `$${totalDebits.toFixed(2)}`
          })
        });
        
        const result = await response.json();
        
        if (result.success) {
          console.log(`✉️ Manager notification sent: ${result.notified} manager(s) notified${result.testMode ? ' (test mode)' : ''}`);
        } else {
          console.error('Failed to send manager notification:', result.error);
          // Don't fail the journal entry save if notification fails
        }
      } catch (notificationError) {
        console.error('Error sending manager notification:', notificationError);
        // Don't fail the journal entry save if notification fails
      }
    }
    
    // Clear attached files after successful save
    attachedFiles = [];
    
    closeJournalModal();
    loadJournalEntries();
    
    const message = status === 'posted' ? 'posted' : 
                    status === 'pending_approval' ? 'submitted for approval' : 
                    'saved';
    alert(`Journal entry ${message} successfully!`);
    
  } catch (error) {
    console.error('Error saving journal entry:', error);
    alert('Error saving journal entry: ' + error.message);
  }
};

/**
 * Post journal entry - update account balances
 */
async function postJournalEntry(entryId, lineItems, reference) {
  const batch = writeBatch(db);
  
  for (const item of lineItems) {
    const accountRef = doc(db, "accounts", item.accountId);
    const accountDoc = await getDoc(accountRef);
    const account = accountDoc.data();
    
    // Update account totals
    const newDebit = parseFloat(account.debit || 0) + item.debit;
    const newCredit = parseFloat(account.credit || 0) + item.credit;
    
    // Calculate new balance based on normal side
    let newBalance;
    if (account.normalSide === 'Debit') {
      newBalance = newDebit - newCredit;
    } else {
      newBalance = newCredit - newDebit;
    }
    
    batch.update(accountRef, {
      debit: newDebit,
      credit: newCredit,
      balance: newBalance
    });
    
    // Create ledger transaction with post reference
    const ledgerRef = doc(collection(db, "ledgerTransactions"));
    batch.set(ledgerRef, {
      accountId: item.accountId,
      accountNumber: account.accountNumber,
      accountName: account.accountName,
      journalEntryId: entryId,
      postReference: reference, // Add the reference number (JE-XXXXXX)
      date: Timestamp.now(),
      description: item.description || account.accountDescription,
      debit: item.debit,
      credit: item.credit,
      balance: newBalance,
      createdAt: Timestamp.now()
    });
  }
  
  await batch.commit();
}

/**
 * View entry details (with approval workflow information)
 */
window.viewEntry = async function(entryId) {
  try {
    const entryDoc = await getDoc(doc(db, "journalEntries", entryId));
    const entry = entryDoc.data();
    
    console.log('View Entry - Full Entry Data:', entry);
    console.log('View Entry - Attachments:', entry.attachments);
    
    // Status badge for all states
    let statusBadge;
    switch (entry.status) {
      case 'posted':
        statusBadge = '<span class="badge badge-success">Posted</span>';
        break;
      case 'approved':
        statusBadge = '<span class="badge badge-success">Approved</span>';
        break;
      case 'pending_approval':
        statusBadge = '<span class="badge badge-info">Pending Approval</span>';
        break;
      case 'rejected':
        statusBadge = '<span class="badge badge-danger">Rejected</span>';
        break;
      case 'draft':
        statusBadge = '<span class="badge badge-warning">Draft</span>';
        break;
      default:
        statusBadge = '<span class="badge badge-secondary">Unknown</span>';
    }
    
    const content = `
      <div class="entry-view">
        <div class="entry-header-info">
          <div><strong>Entry #:</strong> ${entry.entryNumber}</div>
          <div><strong>Status:</strong> ${statusBadge}</div>
          <div><strong>Date:</strong> ${formatDate(entry.entryDate)}</div>
          <div><strong>Reference:</strong> ${entry.reference || '-'}</div>
        </div>
        <div style="margin: 1rem 0;">
          <strong>Description:</strong> ${entry.description}
        </div>
        <div style="margin: 1rem 0;">
          <strong>Created By:</strong> ${entry.createdByName} on ${formatDate(entry.createdAt)}
        </div>
        ${entry.status === 'pending_approval' ? `
          <div style="margin: 1rem 0;">
            <strong>Submitted for Approval:</strong> ${formatDate(entry.submittedForApprovalAt)}
          </div>
        ` : ''}
        ${entry.status === 'approved' ? `
          <div style="margin: 1rem 0; color: var(--success);">
            <strong>✓ Approved By:</strong> ${entry.approvedByName} on ${formatDate(entry.approvedAt)}
          </div>
        ` : ''}
        ${entry.status === 'rejected' ? `
          <div style="margin: 1rem 0; padding: 1rem; background: var(--error-bg); border-left: 3px solid var(--error); border-radius: 4px;">
            <strong style="color: var(--error);">✗ Rejected By:</strong> ${entry.rejectedByName} on ${formatDate(entry.rejectedAt)}<br>
            <strong style="margin-top: 0.5rem; display: block;">Rejection Reason:</strong>
            <p style="margin: 0.5rem 0 0 0; font-style: italic;">${entry.rejectionReason || 'No reason provided'}</p>
          </div>
        ` : ''}
        ${entry.status === 'posted' ? `
          <div style="margin: 1rem 0;">
            <strong>Posted By:</strong> ${entry.postedByName} on ${formatDate(entry.postedAt)}
          </div>
        ` : ''}
        
        <h4 style="margin-top: 1.5rem;">Line Items:</h4>
        <table class="data-table" style="margin-top: 1rem;">
          <thead>
            <tr>
              <th>Account</th>
              <th>Description</th>
              <th style="text-align: right;">Debit</th>
              <th style="text-align: right;">Credit</th>
            </tr>
          </thead>
          <tbody>
            ${entry.lineItems.map(item => `
              <tr>
                <td>${item.accountNumber} - ${item.accountName}</td>
                <td>${item.description || '-'}</td>
                <td style="text-align: right;">${item.debit > 0 ? formatCurrency(item.debit) : '-'}</td>
                <td style="text-align: right;">${item.credit > 0 ? formatCurrency(item.credit) : '-'}</td>
              </tr>
            `).join('')}
            <tr style="font-weight: bold; border-top: 2px solid var(--gray-600);">
              <td colspan="2">TOTALS</td>
              <td style="text-align: right;">${formatCurrency(entry.totalAmount)}</td>
              <td style="text-align: right;">${formatCurrency(entry.totalAmount)}</td>
            </tr>
          </tbody>
        </table>
        
        ${entry.attachments && entry.attachments.length > 0 ? `
          <h4 style="margin-top: 1.5rem;">Attachments:</h4>
          <div class="attached-files-list" style="margin-top: 1rem;">
            ${entry.attachments.map(file => `
              <div class="attached-file-item">
                <div class="file-item-info">
                  <span class="file-icon">${getFileIcon(escapeHtml(file.type))}</span>
                  <div class="file-details">
                    <span class="file-name">${escapeHtml(file.name)}</span>
                    <span class="file-size">${formatFileSize(file.size)}</span>
                  </div>
                </div>
                <a href="${sanitizeUrl(file.url)}" target="_blank" rel="noopener noreferrer" class="btn-secondary" style="text-decoration: none; padding: 0.5rem 1rem;">
                  View/Download
                </a>
              </div>
            `).join('')}
          </div>
        ` : ''}
      </div>
    `;
    
    document.getElementById('viewEntryContent').innerHTML = content;
    
    // Update modal footer with action buttons based on status and role
    const modalFooter = document.querySelector('#viewEntryModal .modal-footer');
    const userRole = currentUser?.role?.toLowerCase() || '';
    const isManager = userRole === 'manager' || userRole === 'administrator';
    
    console.log('View Entry - Status:', entry.status, 'User Role:', currentUser?.role, 'Is Manager:', isManager);
    
    if (entry.status === 'pending_approval' && isManager) {
      // Show approve/reject buttons for managers
      console.log('Showing approve/reject buttons for manager');
      modalFooter.innerHTML = `
        <button onclick="closeViewModal()" class="btn-secondary">Close</button>
        <button onclick="approveEntry('${entryId}')" class="btn-success" style="background: var(--success); color: white;">
          ✓ Approve
        </button>
        <button onclick="showRejectModal('${entryId}')" class="btn-danger" style="background: var(--error); color: white;">
          ✗ Reject
        </button>
      `;
    } else if (entry.status === 'approved' && isManager) {
      // Show post button for approved entries
      console.log('Showing post button for approved entry');
      modalFooter.innerHTML = `
        <button onclick="closeViewModal()" class="btn-secondary">Close</button>
        <button onclick="postEntry('${entryId}')" class="btn-primary">
          ✓ Post to Ledger
        </button>
      `;
    } else {
      // Default: just close button
      console.log('Showing only close button');
      modalFooter.innerHTML = `
        <button onclick="closeViewModal()" class="btn-secondary">Close</button>
      `;
    }
    
    const modal = document.getElementById('viewEntryModal');
    modal.style.display = 'flex';
    setTimeout(() => modal.classList.add('show'), 10);
    
  } catch (error) {
    console.error('Error viewing entry:', error);
    alert('Error loading entry details');
  }
};

/**
 * Delete draft entry (with role-based restrictions)
 */
window.deleteEntry = async function(entryId) {
  try {
    // Get the entry to check status and ownership
    const entryDoc = await getDoc(doc(db, "journalEntries", entryId));
    if (!entryDoc.exists()) {
      alert('Entry not found');
      return;
    }
    
    const entry = entryDoc.data();
    
    // Only allow deletion of draft entries
    if (entry.status !== 'draft') {
      alert('Only draft entries can be deleted. This entry has been submitted and cannot be deleted.');
      return;
    }
    
    // Role-based restrictions
    const isAccountant = currentUser.role === 'Accountant';
    const isManager = currentUser.role === 'Manager' || currentUser.role === 'Administrator';
    
    // Accountants can only delete their own draft entries
    if (isAccountant && entry.createdBy !== currentUser.uid) {
      alert('You can only delete your own draft entries.');
      return;
    }
    
    // Confirm deletion
    if (!confirm('Are you sure you want to delete this draft entry?')) {
      return;
    }
    
    await deleteDoc(doc(db, "journalEntries", entryId));
    loadJournalEntries();
    alert('Entry deleted successfully');
  } catch (error) {
    console.error('Error deleting entry:', error);
    alert('Error deleting entry: ' + error.message);
  }
};

/**
 * Reverse a posted entry
 */
window.reverseEntry = async function(entryId) {
  if (!confirm('This will create a reversing entry. Continue?')) {
    return;
  }
  
  alert('Reversing entry functionality coming soon!');
  // TODO: Implement reversing entry logic
};

/**
 * Edit draft or rejected entry
 */
window.editEntry = async function(entryId) {
  try {
    // Ensure accounts are loaded before editing
    if (allAccounts.length === 0) {
      console.log('Accounts not loaded yet, loading now...');
      await loadAccounts();
    }
    
    const entryDoc = await getDoc(doc(db, "journalEntries", entryId));
    const entry = entryDoc.data();
    
    // Populate modal with existing data
    document.getElementById('modalTitle').textContent = entry.status === 'rejected' ? 'Edit & Resubmit Entry' : 'Edit Entry';
    document.getElementById('entryId').value = entryId;
    document.getElementById('entryDate').value = new Date(entry.entryDate.toDate()).toISOString().split('T')[0];
    document.getElementById('entryReference').value = entry.reference || '';
    document.getElementById('entryReference').readOnly = true; // Keep reference locked when editing
    document.getElementById('entryDescription').value = entry.description;
    
    // Clear existing line items
    document.getElementById('lineItemsContainer').innerHTML = '';
    lineItemCounter = 0;
    
    // Load existing line items
    entry.lineItems.forEach(item => {
      addLineItem();
      const lineNumber = lineItemCounter;
      
      // Set account
      const accountSelect = document.querySelector(`.account-select[data-line="${lineNumber}"]`);
      accountSelect.value = item.accountId;
      
      // Set debit/credit
      if (item.debit > 0) {
        document.querySelector(`.debit-input[data-line="${lineNumber}"]`).value = item.debit;
      }
      if (item.credit > 0) {
        document.querySelector(`.credit-input[data-line="${lineNumber}"]`).value = item.credit;
      }
      
      // Set description
      document.querySelector(`.description-input[data-line="${lineNumber}"]`).value = item.description || '';
    });
    
    updateTotals();
    
    // Show modal
    const modal = document.getElementById('journalEntryModal');
    modal.style.display = 'flex';
    setTimeout(() => modal.classList.add('show'), 10);
    
  } catch (error) {
    console.error('Error loading entry for edit:', error);
    alert('Error loading entry: ' + error.message);
  }
};

/**
 * Approve a pending journal entry (Manager/Admin only)
 */
window.approveEntry = async function(entryId) {
  if (!confirm('Approve this journal entry?')) {
    return;
  }
  
  try {
    const entryDoc = await getDoc(doc(db, "journalEntries", entryId));
    const entry = entryDoc.data();
    
    // Update entry status to approved
    await updateDoc(doc(db, "journalEntries", entryId), {
      status: 'approved',
      approvedBy: currentUser.uid,
      approvedByName: `${currentUser.firstName || ''} ${currentUser.lastName || ''}`.trim(),
      approvedAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    });
    
    // Log event with complete audit trail
    await addDoc(collection(db, "eventLogs"), {
      eventId: crypto.randomUUID(),
      eventType: 'journal_entry_approved',
      description: `Approved journal entry #${entry.entryNumber}`,
      accountName: `Journal Entry #${entry.entryNumber}`,
      beforeImage: {
        status: entry.status,
        description: entry.description,
        totalAmount: entry.totalAmount
      },
      afterImage: {
        status: 'approved',
        approvedBy: currentUser.username,
        approvedAt: new Date().toISOString()
      },
      userId: currentUser.uid,
      username: currentUser.username,
      timestamp: Timestamp.now(),
      dateTime: new Date().toISOString()
    });
    
    alert('Journal entry approved successfully! You can now post it to the ledger.');
    loadJournalEntries();
    
  } catch (error) {
    console.error('Error approving entry:', error);
    alert('Error approving entry: ' + error.message);
  }
};

/**
 * Show rejection modal
 */
window.showRejectModal = function(entryId) {
  document.getElementById('rejectEntryId').value = entryId;
  document.getElementById('rejectionReason').value = '';
  
  const modal = document.getElementById('rejectModal');
  modal.style.display = 'flex';
  setTimeout(() => modal.classList.add('show'), 10);
};

/**
 * Close rejection modal
 */
window.closeRejectModal = function() {
  const modal = document.getElementById('rejectModal');
  if (modal) {
    modal.classList.remove('show');
    setTimeout(() => modal.style.display = 'none', 300);
  }
};

/**
 * Reject a pending journal entry with reason (Manager/Admin only)
 */
window.rejectEntry = async function() {
  const entryId = document.getElementById('rejectEntryId').value;
  const rejectionReason = document.getElementById('rejectionReason').value.trim();
  
  if (!rejectionReason) {
    alert('Please provide a reason for rejection');
    return;
  }
  
  try {
    const entryDoc = await getDoc(doc(db, "journalEntries", entryId));
    const entry = entryDoc.data();
    
    // Update entry status to rejected
    await updateDoc(doc(db, "journalEntries", entryId), {
      status: 'rejected',
      rejectedBy: currentUser.uid,
      rejectedByName: `${currentUser.firstName || ''} ${currentUser.lastName || ''}`.trim(),
      rejectedAt: Timestamp.now(),
      rejectionReason: rejectionReason,
      updatedAt: Timestamp.now()
    });
    
    // Log event with complete audit trail
    await addDoc(collection(db, "eventLogs"), {
      eventId: crypto.randomUUID(),
      eventType: 'journal_entry_rejected',
      description: `Rejected journal entry #${entry.entryNumber}`,
      accountName: `Journal Entry #${entry.entryNumber}`,
      beforeImage: {
        status: entry.status,
        description: entry.description,
        totalAmount: entry.totalAmount
      },
      afterImage: {
        status: 'rejected',
        rejectedBy: currentUser.username,
        rejectedAt: new Date().toISOString(),
        rejectionReason
      },
      userId: currentUser.uid,
      username: currentUser.username,
      timestamp: Timestamp.now(),
      dateTime: new Date().toISOString()
    });
    
    closeRejectModal();
    alert('Journal entry rejected. The accountant will be notified.');
    loadJournalEntries();
    
  } catch (error) {
    console.error('Error rejecting entry:', error);
    alert('Error rejecting entry: ' + error.message);
  }
};

/**
 * Post an approved journal entry to ledger (Manager/Admin only)
 */
window.postApprovedEntry = async function(entryId) {
  if (!confirm('Post this approved entry to the ledger? This will update account balances.')) {
    return;
  }
  
  try {
    const entryDoc = await getDoc(doc(db, "journalEntries", entryId));
    const entry = entryDoc.data();
    
    // Update account balances and create ledger transactions
    await postJournalEntry(entryId, entry.lineItems, entry.reference);
    
    // Update entry status to posted - use CURRENT USER as poster (not the original creator)
    await updateDoc(doc(db, "journalEntries", entryId), {
      status: 'posted',
      postedBy: currentUser.uid,
      postedByName: `${currentUser.firstName || ''} ${currentUser.lastName || ''}`.trim(),
      postedAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    });
    
    // Log event with complete audit trail
    await addDoc(collection(db, "eventLogs"), {
      eventId: crypto.randomUUID(),
      eventType: 'journal_entry_posted',
      description: `Posted journal entry #${entry.entryNumber} to ledger`,
      accountName: `Journal Entry #${entry.entryNumber}`,
      beforeImage: {
        status: entry.status,
        description: entry.description,
        totalAmount: entry.totalAmount
      },
      afterImage: {
        status: 'posted',
        postedBy: currentUser.username,
        postedAt: new Date().toISOString(),
        lineItemsPosted: entry.lineItems.length
      },
      userId: currentUser.uid,
      username: currentUser.username,
      timestamp: Timestamp.now(),
      dateTime: new Date().toISOString()
    });
    
    alert('Journal entry posted to ledger successfully!');
    loadJournalEntries();
    
  } catch (error) {
    console.error('Error posting entry:', error);
    alert('Error posting entry: ' + error.message);
  }
};

/**
 * Apply filters
 */
window.applyFilters = function() {
  const filters = {
    status: document.getElementById('filterStatus')?.value || '',
    searchTerm: document.getElementById('searchEntry')?.value || '',
    fromDate: document.getElementById('filterFromDate')?.value || null,
    toDate: document.getElementById('filterToDate')?.value || null
  };
  
  loadJournalEntries(filters);
};

/**
 * Clear filters
 */
window.clearFilters = function() {
  document.getElementById('filterStatus').value = '';
  document.getElementById('searchEntry').value = '';
  document.getElementById('filterFromDate').value = '';
  document.getElementById('filterToDate').value = '';
  loadJournalEntries();
};

// Initialize on auth state change
onAuthStateChanged(auth, async (user) => {
  if (user) {
    const userDoc = await getDoc(doc(db, "users", user.uid));
    if (userDoc.exists()) {
      const userData = userDoc.data();
      currentUser = { uid: user.uid, ...userData };
      
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
      
      // Load data
      // Initialize error messages
      await initializeErrorMessages();
      
      await loadAccounts();
      await loadJournalEntries();
      
      // Check if we should open a specific entry from URL parameter
      const urlParams = new URLSearchParams(window.location.search);
      const viewEntryId = urlParams.get('viewEntry');
      if (viewEntryId) {
        // Give the page a moment to load, then open the entry
        setTimeout(() => {
          viewEntry(viewEntryId);
        }, 500);
      }
      
    } else {
      window.location.href = "index.html";
    }
  } else {
    window.location.href = "index.html";
  }
});
