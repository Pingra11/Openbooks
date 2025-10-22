/**
 * Account Ledger Display
 * Shows detailed transaction history for a specific account
 */

import { auth, db } from "./firebaseConfig.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import { 
  collection, getDocs, doc, getDoc,
  query, where, orderBy
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import { setChip } from "./ui.js";

let currentUser = null;
let accountId = null;
let allAccounts = [];

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
 * Load all accounts for dropdown
 */
async function loadAllAccounts() {
  try {
    const accountsQuery = query(collection(db, "accounts"), orderBy("accountNumber", "asc"));
    const accountsSnapshot = await getDocs(accountsQuery);
    
    allAccounts = [];
    accountsSnapshot.forEach(doc => {
      allAccounts.push({ id: doc.id, ...doc.data() });
    });
    
    // Populate dropdown
    const selector = document.getElementById('accountSelector');
    selector.innerHTML = '<option value="">-- Select an Account --</option>';
    
    allAccounts.forEach(account => {
      const option = document.createElement('option');
      option.value = account.id;
      option.textContent = `${account.accountNumber} - ${account.accountName}`;
      selector.appendChild(option);
    });
    
    // Pre-select current account if one is loaded
    if (accountId) {
      selector.value = accountId;
    }
    
  } catch (error) {
    console.error('Error loading accounts:', error);
    alert('Error loading accounts: ' + error.message);
  }
}

/**
 * Change account selection
 */
window.changeAccount = function() {
  const selector = document.getElementById('accountSelector');
  const selectedId = selector.value;
  
  if (selectedId) {
    accountId = selectedId;
    loadAccountDetails();
  } else {
    // Reset display
    document.getElementById('accountTitle').textContent = 'Account Ledger';
    document.getElementById('accountDetails').innerHTML = `
      <p style="text-align: center; color: var(--gray-400); padding: 2rem;">
        Please select an account from the dropdown above to view its ledger
      </p>
    `;
    const tbody = document.querySelector('#ledgerTable tbody');
    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center;">No account selected</td></tr>';
  }
}

/**
 * Load account details
 */
async function loadAccountDetails() {
  try {
    const accountDoc = await getDoc(doc(db, "accounts", accountId));
    
    if (!accountDoc.exists()) {
      alert('Account not found');
      accountId = null;
      document.getElementById('accountSelector').value = '';
      changeAccount();
      return;
    }
    
    const account = accountDoc.data();
    
    // Update page title
    document.getElementById('accountTitle').textContent = `${account.accountName} Ledger`;
    
    // Display account details
    document.getElementById('accountDetails').innerHTML = `
      <div class="account-detail-grid">
        <div class="detail-item">
          <label>Account Number:</label>
          <span>${account.accountNumber}</span>
        </div>
        <div class="detail-item">
          <label>Account Name:</label>
          <span>${account.accountName}</span>
        </div>
        <div class="detail-item">
          <label>Category:</label>
          <span>${account.accountCategory}</span>
        </div>
        <div class="detail-item">
          <label>Subcategory:</label>
          <span>${account.accountSubcategory || '-'}</span>
        </div>
        <div class="detail-item">
          <label>Normal Side:</label>
          <span>${account.normalSide}</span>
        </div>
        <div class="detail-item">
          <label>Statement:</label>
          <span>${account.statement}</span>
        </div>
        <div class="detail-item">
          <label>Total Debits:</label>
          <span>${formatCurrency(account.debit)}</span>
        </div>
        <div class="detail-item">
          <label>Total Credits:</label>
          <span>${formatCurrency(account.credit)}</span>
        </div>
        <div class="detail-item">
          <label>Current Balance:</label>
          <span class="balance-amount">${formatCurrency(account.balance)}</span>
        </div>
        <div class="detail-item full-width">
          <label>Description:</label>
          <span>${account.accountDescription || '-'}</span>
        </div>
      </div>
    `;
    
    // Load transactions for this account
    await loadLedgerTransactions();
    
  } catch (error) {
    console.error('Error loading account details:', error);
    alert('Error loading account: ' + error.message);
  }
}

/**
 * Load ledger transactions
 */
async function loadLedgerTransactions() {
  try {
    const transactionsQuery = query(
      collection(db, "ledgerTransactions"),
      where("accountId", "==", accountId),
      orderBy("date", "asc")
    );
    
    const transactionsSnapshot = await getDocs(transactionsQuery);
    
    const tbody = document.querySelector('#ledgerTable tbody');
    
    if (transactionsSnapshot.empty) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; padding: 2rem;">
            <p style="color: var(--gray-400);">No transactions recorded yet</p>
            <p style="color: var(--gray-500); font-size: 0.875rem;">
              Transactions will appear here once journal entries are posted to this account
            </p>
          </td>
        </tr>
      `;
      return;
    }
    
    let runningBalance = 0;
    const transactions = [];
    
    transactionsSnapshot.forEach(doc => {
      transactions.push({ id: doc.id, ...doc.data() });
    });
    
    tbody.innerHTML = transactions.map(txn => {
      runningBalance = txn.balance || 0;
      
      const date = txn.date.toDate ? txn.date.toDate().toLocaleDateString() : '-';
      const debit = txn.debit > 0 ? formatCurrency(txn.debit) : '-';
      const credit = txn.credit > 0 ? formatCurrency(txn.credit) : '-';
      
      return `
        <tr>
          <td>${date}</td>
          <td>${txn.description || '-'}</td>
          <td>${txn.journalEntryId ? 'JE-' + txn.journalEntryId.substring(0, 6) : '-'}</td>
          <td>${debit}</td>
          <td>${credit}</td>
          <td><strong>${formatCurrency(runningBalance)}</strong></td>
        </tr>
      `;
    }).join('');
    
  } catch (error) {
    console.error('Error loading transactions:', error);
    const tbody = document.querySelector('#ledgerTable tbody');
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; color: var(--error);">
          Error loading transactions: ${error.message}
        </td>
      </tr>
    `;
  }
}

// Get account ID from URL (optional)
const urlParams = new URLSearchParams(window.location.search);
accountId = urlParams.get('accountId');

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
      
      // Load all accounts for dropdown
      await loadAllAccounts();
      
      // Load account details if one was specified in URL
      if (accountId) {
        loadAccountDetails();
      }
    } else {
      window.location.href = "index.html";
    }
  } else {
    window.location.href = "index.html";
  }
});
