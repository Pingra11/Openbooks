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

let currentUser = null;
let allAccounts = [];
let lineItemCounter = 0;

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
        e.reference?.toLowerCase().includes(term)
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
    const statusBadge = entry.status === 'posted' 
      ? '<span class="badge badge-success">Posted</span>'
      : '<span class="badge badge-warning">Draft</span>';
    
    const actions = entry.status === 'draft'
      ? `
        <button onclick="editEntry('${entry.id}')" class="btn-action" title="Edit Entry">Edit</button>
        <button onclick="deleteEntry('${entry.id}')" class="btn-action btn-danger" title="Delete Entry">Delete</button>
        <button onclick="viewEntry('${entry.id}')" class="btn-action" title="View Details">View</button>
      `
      : `
        <button onclick="viewEntry('${entry.id}')" class="btn-action" title="View Details">View</button>
        <button onclick="reverseEntry('${entry.id}')" class="btn-action" title="Reverse Entry">Reverse</button>
      `;
    
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
  
  document.getElementById('modalTitle').textContent = 'New Journal Entry';
  document.getElementById('journalEntryForm').reset();
  document.getElementById('entryId').value = '';
  
  // Set today's date
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('entryDate').value = today;
  
  // Clear line items
  document.getElementById('lineItemsContainer').innerHTML = '';
  lineItemCounter = 0;
  
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
        <input type="number" step="0.01" min="0" placeholder="Debit" 
               class="debit-input" data-line="${lineItemCounter}" 
               onkeyup="handleDebitCredit(${lineItemCounter}, 'debit')" 
               onchange="updateTotals()">
      </div>
      <div class="form-group">
        <input type="number" step="0.01" min="0" placeholder="Credit" 
               class="credit-input" data-line="${lineItemCounter}" 
               onkeyup="handleDebitCredit(${lineItemCounter}, 'credit')" 
               onchange="updateTotals()">
      </div>
      <div class="form-group">
        <input type="text" placeholder="Description (optional)" 
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
 * Save journal entry
 */
window.saveJournalEntry = async function(status) {
  try {
    const entryDate = document.getElementById('entryDate').value;
    const reference = document.getElementById('entryReference').value;
    const description = document.getElementById('entryDescription').value;
    
    if (!entryDate || !description) {
      alert('Please fill in all required fields');
      return;
    }
    
    // Collect line items
    const lineItems = [];
    const accountSelects = document.querySelectorAll('.account-select');
    
    accountSelects.forEach(select => {
      const lineNumber = select.dataset.line;
      const accountId = select.value;
      const debit = parseFloat(document.querySelector(`.debit-input[data-line="${lineNumber}"]`).value) || 0;
      const credit = parseFloat(document.querySelector(`.credit-input[data-line="${lineNumber}"]`).value) || 0;
      const lineDesc = document.querySelector(`.description-input[data-line="${lineNumber}"]`).value;
      
      if (accountId && (debit > 0 || credit > 0)) {
        const account = allAccounts.find(a => a.id === accountId);
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
    
    if (lineItems.length < 2) {
      alert('A journal entry must have at least 2 line items');
      return;
    }
    
    // Validate debits = credits
    const totalDebits = lineItems.reduce((sum, item) => sum + item.debit, 0);
    const totalCredits = lineItems.reduce((sum, item) => sum + item.credit, 0);
    
    if (Math.abs(totalDebits - totalCredits) > 0.01) {
      alert('Total debits must equal total credits');
      return;
    }
    
    // Generate entry number
    const entriesSnapshot = await getDocs(collection(db, "journalEntries"));
    const entryNumber = entriesSnapshot.size + 1;
    
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
    
    if (status === 'posted') {
      entryData.postedBy = currentUser.uid;
      entryData.postedByName = entryData.createdByName;
      entryData.postedAt = Timestamp.now();
    }
    
    const entryId = document.getElementById('entryId').value;
    
    if (entryId) {
      // Update existing
      await updateDoc(doc(db, "journalEntries", entryId), entryData);
    } else {
      // Create new
      const docRef = await addDoc(collection(db, "journalEntries"), entryData);
      
      // If posting, update account balances
      if (status === 'posted') {
        await postJournalEntry(docRef.id, lineItems);
      }
    }
    
    // Log event
    await addDoc(collection(db, "eventLogs"), {
      eventType: 'journal_entry',
      description: `${status === 'posted' ? 'Posted' : 'Saved'} journal entry #${entryNumber}`,
      userId: currentUser.uid,
      username: currentUser.username,
      timestamp: Timestamp.now(),
      details: { entryNumber, status, totalAmount: totalDebits }
    });
    
    closeJournalModal();
    loadJournalEntries();
    
    alert(`Journal entry ${status === 'posted' ? 'posted' : 'saved'} successfully!`);
    
  } catch (error) {
    console.error('Error saving journal entry:', error);
    alert('Error saving journal entry: ' + error.message);
  }
};

/**
 * Post journal entry - update account balances
 */
async function postJournalEntry(entryId, lineItems) {
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
    
    // Create ledger transaction
    const ledgerRef = doc(collection(db, "ledgerTransactions"));
    batch.set(ledgerRef, {
      accountId: item.accountId,
      accountNumber: account.accountNumber,
      accountName: account.accountName,
      journalEntryId: entryId,
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
 * View entry details
 */
window.viewEntry = async function(entryId) {
  try {
    const entryDoc = await getDoc(doc(db, "journalEntries", entryId));
    const entry = entryDoc.data();
    
    const statusBadge = entry.status === 'posted' 
      ? '<span class="badge badge-success">Posted</span>'
      : '<span class="badge badge-warning">Draft</span>';
    
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
              <th>Debit</th>
              <th>Credit</th>
            </tr>
          </thead>
          <tbody>
            ${entry.lineItems.map(item => `
              <tr>
                <td>${item.accountNumber} - ${item.accountName}</td>
                <td>${item.description || '-'}</td>
                <td>${item.debit > 0 ? formatCurrency(item.debit) : '-'}</td>
                <td>${item.credit > 0 ? formatCurrency(item.credit) : '-'}</td>
              </tr>
            `).join('')}
            <tr style="font-weight: bold; border-top: 2px solid var(--gray-600);">
              <td colspan="2">TOTALS</td>
              <td>${formatCurrency(entry.totalAmount)}</td>
              <td>${formatCurrency(entry.totalAmount)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    `;
    
    document.getElementById('viewEntryContent').innerHTML = content;
    const modal = document.getElementById('viewEntryModal');
    modal.style.display = 'flex';
    setTimeout(() => modal.classList.add('show'), 10);
    
  } catch (error) {
    console.error('Error viewing entry:', error);
    alert('Error loading entry details');
  }
};

/**
 * Delete draft entry
 */
window.deleteEntry = async function(entryId) {
  if (!confirm('Are you sure you want to delete this draft entry?')) {
    return;
  }
  
  try {
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
 * Edit draft entry
 */
window.editEntry = async function(entryId) {
  alert('Edit functionality coming soon!');
  // TODO: Implement edit functionality
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
      await loadAccounts();
      await loadJournalEntries();
      
    } else {
      window.location.href = "index.html";
    }
  } else {
    window.location.href = "index.html";
  }
});
