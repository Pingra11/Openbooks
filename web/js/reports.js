/**
 * Financial Reports
 * Generate Trial Balance, Balance Sheet, Income Statement, and Retained Earnings
 */

import { auth, db } from "./firebaseConfig.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import { 
  collection, getDocs, doc, getDoc,
  query, orderBy
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import { setChip } from "./ui.js";
import { 
  exportReportToPDF, 
  exportReportAsCSV, 
  emailReport, 
  printReport 
} from "./reports-exports.js";

let currentUser = null;
let allAccounts = [];
let allLedgerTransactions = [];
let currentReportType = 'trialBalance';
let allEmailRecipients = [];

// Expose export functions to window for HTML onclick handlers
window.saveReportAsPDF = exportReportToPDF;
window.saveReportAsCSV = exportReportAsCSV;
window.emailReport = emailReport;
window.printReport = printReport;

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
 * Format date
 */
function formatDate(date) {
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

/**
 * Load all accounts and ledger transactions
 */
async function loadAllAccounts() {
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
    
    // Load all ledger transactions for date-based filtering
    const ledgerSnapshot = await getDocs(collection(db, "ledgerTransactions"));
    allLedgerTransactions = [];
    ledgerSnapshot.forEach(doc => {
      const txn = doc.data();
      // Convert Firebase Timestamp to JavaScript Date
      const txnDate = txn.date?.toDate ? txn.date.toDate() : (txn.date ? new Date(txn.date) : null);
      allLedgerTransactions.push({
        id: doc.id,
        ...txn,
        transactionDate: txnDate
      });
    });
    
  } catch (error) {
    console.error('Error loading accounts:', error);
  }
}

/**
 * Calculate account balance as of a specific date
 * Returns: { debit, credit, balance, initialBalance }
 * Places initial balance based on account's normal side
 */
function calculateAccountBalanceAsOf(accountId, asOfDate) {
  const account = allAccounts.find(a => a.id === accountId);
  if (!account) return { debit: 0, credit: 0, balance: 0, initialBalance: 0 };
  
  // Start with initial balance
  const initialBalance = parseFloat(account.initialBalance || 0);
  let transactionDebits = 0;
  let transactionCredits = 0;
  
  // Add all transactions up to and including the as-of date
  const endOfDay = new Date(asOfDate);
  endOfDay.setHours(23, 59, 59, 999);
  
  allLedgerTransactions.forEach(txn => {
    if (txn.accountId === accountId && txn.transactionDate && txn.transactionDate <= endOfDay) {
      transactionDebits += parseFloat(txn.debit || 0);
      transactionCredits += parseFloat(txn.credit || 0);
    }
  });
  
  // Place initial balance based on account's normal side
  // Assets, Expenses = Debit normal side
  // Liabilities, Equity, Revenue = Credit normal side
  const normalSide = account.normalSide || 'Debit'; // Default to Debit if not specified
  let totalDebit = transactionDebits;
  let totalCredit = transactionCredits;
  
  if (normalSide === 'Debit') {
    totalDebit += initialBalance;
  } else {
    totalCredit += initialBalance;
  }
  
  const balance = (totalDebit - totalCredit);
  
  
  return { debit: totalDebit, credit: totalCredit, balance, initialBalance };
}

/**
 * Calculate account activity for a date range
 * Returns raw debits and credits without sign manipulation
 */
function calculateAccountActivity(accountId, fromDate, toDate) {
  const startOfDay = new Date(fromDate);
  startOfDay.setHours(0, 0, 0, 0);
  
  const endOfDay = new Date(toDate);
  endOfDay.setHours(23, 59, 59, 999);
  
  let totalDebits = 0;
  let totalCredits = 0;
  
  allLedgerTransactions.forEach(txn => {
    if (txn.accountId === accountId && txn.transactionDate && 
        txn.transactionDate >= startOfDay && txn.transactionDate <= endOfDay) {
      totalDebits += parseFloat(txn.debit || 0);
      totalCredits += parseFloat(txn.credit || 0);
    }
  });
  
  // Return raw values - sign handling happens in report generators
  return { debit: totalDebits, credit: totalCredits };
}

/**
 * Get balances for all accounts as of a specific date
 */
function getAccountBalancesAsOf(asOfDate) {
  const balances = {};
  allAccounts.forEach(account => {
    balances[account.id] = calculateAccountBalanceAsOf(account.id, asOfDate);
  });
  return balances;
}

/**
 * Get activity for all accounts in a date range
 */
function getAccountActivityInRange(fromDate, toDate) {
  const activity = {};
  allAccounts.forEach(account => {
    activity[account.id] = calculateAccountActivity(account.id, fromDate, toDate);
  });
  return activity;
}

/**
 * Show selected report
 */
window.showReport = function(reportType) {
  // Update active tab
  document.querySelectorAll('.report-tab').forEach(tab => tab.classList.remove('active'));
  document.getElementById(`tab${reportType.charAt(0).toUpperCase() + reportType.slice(1)}`).classList.add('active');
  
  // Show selected report
  document.querySelectorAll('.report-section').forEach(section => section.classList.remove('active'));
  const reportMap = {
    trialBalance: 'trialBalanceReport',
    balanceSheet: 'balanceSheetReport',
    incomeStatement: 'incomeStatementReport',
    retainedEarnings: 'retainedEarningsReport'
  };
  document.getElementById(reportMap[reportType]).classList.add('active');
  
  currentReportType = reportType;
  loadCurrentReport();
};

/**
 * Get selected date range with validation and defaults
 */
function getSelectedDateRange() {
  const fromInput = document.getElementById('reportFromDate');
  const toInput = document.getElementById('reportToDate');
  
  const today = new Date();
  let fromDate = fromInput.value ? new Date(fromInput.value) : today;
  let toDate = toInput.value ? new Date(toInput.value) : today;
  
  // If only from is specified, use it for both
  if (fromInput.value && !toInput.value) {
    toDate = new Date(fromDate);
  }
  
  // If only to is specified, use today for from
  if (!fromInput.value && toInput.value) {
    fromDate = today;
  }
  
  // Ensure from <= to
  if (fromDate > toDate) {
    const temp = fromDate;
    fromDate = toDate;
    toDate = temp;
  }
  
  return { fromDate, toDate };
}

/**
 * Load current report
 */
window.loadCurrentReport = function() {
  const { fromDate, toDate } = getSelectedDateRange();
  console.log(`📊 Loading ${currentReportType} report with dates:`, {
    fromDate: fromDate.toISOString().split('T')[0],
    toDate: toDate.toISOString().split('T')[0]
  });
  
  switch(currentReportType) {
    case 'trialBalance':
      generateTrialBalance(toDate); // Trial Balance uses "as of" date
      break;
    case 'balanceSheet':
      generateBalanceSheet(toDate); // Balance Sheet uses "as of" date
      break;
    case 'incomeStatement':
      generateIncomeStatement(fromDate, toDate); // Income Statement uses range
      break;
    case 'retainedEarnings':
      generateRetainedEarnings(fromDate, toDate); // Retained Earnings uses range
      break;
  }
};

/**
 * Get current report context for exports
 */
export function getCurrentReportContext() {
  const { fromDate, toDate } = getSelectedDateRange();
  const reportTypeNames = {
    trialBalance: 'Trial Balance',
    balanceSheet: 'Balance Sheet',
    incomeStatement: 'Income Statement',
    retainedEarnings: 'Retained Earnings Statement'
  };
  
  return {
    type: currentReportType,
    title: reportTypeNames[currentReportType] || 'Financial Report',
    dateRange: { fromDate, toDate },
    data: collectReportTableData()
  };
}

/**
 * Collect table data from active report for exports
 */
export function collectReportTableData() {
  const activeReport = document.querySelector('.report-section.active');
  if (!activeReport) return null;
  
  const table = activeReport.querySelector('table');
  if (!table) return null;
  
  // Extract headers
  const headerCells = Array.from(table.querySelectorAll('thead th'));
  const headers = headerCells.map(th => th.textContent.trim());
  
  // Extract body rows
  const bodyRows = Array.from(table.querySelectorAll('tbody tr'));
  const rows = bodyRows.map(tr => {
    const cells = Array.from(tr.querySelectorAll('td'));
    return cells.map(td => td.textContent.trim());
  });
  
  // Extract footer rows (totals)
  const footerRows = Array.from(table.querySelectorAll('tfoot tr'));
  const footers = footerRows.map(tr => {
    const cells = Array.from(tr.querySelectorAll('td'));
    return cells.map(td => td.textContent.trim());
  });
  
  // Get report title and subtitle
  const titleEl = activeReport.querySelector('.report-header h3');
  const dateEl = activeReport.querySelector('.report-date');
  
  return {
    title: titleEl ? titleEl.textContent.trim() : 'Report',
    subtitle: dateEl ? dateEl.textContent.trim() : '',
    headers,
    rows,
    footers
  };
}

/**
 * Generate Trial Balance
 */
function generateTrialBalance(asOfDate) {
  const tbody = document.getElementById('trialBalanceBody');
  const tfoot = document.getElementById('trialBalanceFoot');
  
  document.getElementById('tbDate').textContent = formatDate(asOfDate);
  
  // Calculate balances as of the selected date
  const balances = getAccountBalancesAsOf(asOfDate);
  
  let totalDebits = 0;
  let totalCredits = 0;
  
  const rows = allAccounts.map(account => {
    const accountBalance = balances[account.id];
    // Use actual debit and credit totals, not derived from balance
    const debit = accountBalance ? accountBalance.debit : 0;
    const credit = accountBalance ? accountBalance.credit : 0;
    
    
    totalDebits += debit;
    totalCredits += credit;
    
    return `
      <tr>
        <td>${account.accountNumber}</td>
        <td>${account.accountName}</td>
        <td class="amount">${debit > 0 ? formatCurrency(debit) : '-'}</td>
        <td class="amount">${credit > 0 ? formatCurrency(credit) : '-'}</td>
      </tr>
    `;
  }).join('');
  
  
  tbody.innerHTML = rows || '<tr><td colspan="4" style="text-align: center;">No accounts found</td></tr>';
  
  const balanced = Math.abs(totalDebits - totalCredits) < 0.01;
  const balanceStatus = balanced 
    ? '<span style="color: var(--success);">✓ Balanced</span>'
    : '<span style="color: var(--error);">⚠ Out of Balance</span>';
  
  tfoot.innerHTML = `
    <tr class="total-row">
      <td colspan="2"><strong>TOTALS ${balanceStatus}</strong></td>
      <td class="amount"><strong>${formatCurrency(totalDebits)}</strong></td>
      <td class="amount"><strong>${formatCurrency(totalCredits)}</strong></td>
    </tr>
  `;
}

/**
 * Generate Balance Sheet
 */
function generateBalanceSheet(asOfDate) {
  const tbody = document.getElementById('balanceSheetBody');
  document.getElementById('bsDate').textContent = formatDate(asOfDate);
  
  // Calculate balances as of the selected date
  const balances = getAccountBalancesAsOf(asOfDate);
  
  const assets = allAccounts.filter(a => a.accountCategory === 'Assets');
  const liabilities = allAccounts.filter(a => a.accountCategory === 'Liabilities');
  const equity = allAccounts.filter(a => a.accountCategory === 'Equity');
  
  const totalAssets = assets.reduce((sum, a) => sum + (balances[a.id]?.balance || 0), 0);
  const totalLiabilities = liabilities.reduce((sum, a) => sum + (balances[a.id]?.balance || 0), 0);
  const totalEquity = equity.reduce((sum, a) => sum + (balances[a.id]?.balance || 0), 0);
  
  let html = `
    <tr class="section-header">
      <td colspan="2"><strong>ASSETS</strong></td>
    </tr>
  `;
  
  assets.forEach(account => {
    const balance = balances[account.id]?.balance || 0;
    html += `
      <tr>
        <td class="indent">${account.accountName}</td>
        <td class="amount">${formatCurrency(balance)}</td>
      </tr>
    `;
  });
  
  html += `
    <tr class="subtotal-row">
      <td><strong>Total Assets</strong></td>
      <td class="amount"><strong>${formatCurrency(totalAssets)}</strong></td>
    </tr>
    <tr class="spacer"><td colspan="2"></td></tr>
    <tr class="section-header">
      <td colspan="2"><strong>LIABILITIES</strong></td>
    </tr>
  `;
  
  liabilities.forEach(account => {
    const balance = balances[account.id]?.balance || 0;
    html += `
      <tr>
        <td class="indent">${account.accountName}</td>
        <td class="amount">${formatCurrency(balance)}</td>
      </tr>
    `;
  });
  
  html += `
    <tr class="subtotal-row">
      <td><strong>Total Liabilities</strong></td>
      <td class="amount"><strong>${formatCurrency(totalLiabilities)}</strong></td>
    </tr>
    <tr class="spacer"><td colspan="2"></td></tr>
    <tr class="section-header">
      <td colspan="2"><strong>EQUITY</strong></td>
    </tr>
  `;
  
  equity.forEach(account => {
    const balance = balances[account.id]?.balance || 0;
    html += `
      <tr>
        <td class="indent">${account.accountName}</td>
        <td class="amount">${formatCurrency(balance)}</td>
      </tr>
    `;
  });
  
  html += `
    <tr class="subtotal-row">
      <td><strong>Total Equity</strong></td>
      <td class="amount"><strong>${formatCurrency(totalEquity)}</strong></td>
    </tr>
    <tr class="spacer"><td colspan="2"></td></tr>
    <tr class="total-row">
      <td><strong>TOTAL LIABILITIES & EQUITY</strong></td>
      <td class="amount"><strong>${formatCurrency(totalLiabilities + totalEquity)}</strong></td>
    </tr>
  `;
  
  tbody.innerHTML = html;
}

/**
 * Generate Income Statement
 */
function generateIncomeStatement(fromDate, toDate) {
  const tbody = document.getElementById('incomeStatementBody');
  
  // Display date range
  const dateDisplay = fromDate.toDateString() === toDate.toDateString()
    ? `As of ${formatDate(toDate)}`
    : `For the period from ${formatDate(fromDate)} to ${formatDate(toDate)}`;
  document.getElementById('isDate').textContent = dateDisplay;
  
  // Calculate activity for the date range
  const activity = getAccountActivityInRange(fromDate, toDate);
  
  const revenues = allAccounts.filter(a => a.accountCategory === 'Revenue');
  const expenses = allAccounts.filter(a => a.accountCategory === 'Expenses');
  
  // Revenue: credit minus debit (revenues increase with credits)
  const totalRevenue = revenues.reduce((sum, a) => {
    const act = activity[a.id];
    return sum + (act ? (act.credit - act.debit) : 0);
  }, 0);
  
  // Expenses: debit minus credit (expenses increase with debits)
  const totalExpenses = expenses.reduce((sum, a) => {
    const act = activity[a.id];
    return sum + (act ? (act.debit - act.credit) : 0);
  }, 0);
  
  const netIncome = totalRevenue - totalExpenses;
  
  let html = `
    <tr class="section-header">
      <td colspan="2"><strong>REVENUE</strong></td>
    </tr>
  `;
  
  revenues.forEach(account => {
    const act = activity[account.id];
    const amount = act ? (act.credit - act.debit) : 0;
    html += `
      <tr>
        <td class="indent">${account.accountName}</td>
        <td class="amount">${formatCurrency(amount)}</td>
      </tr>
    `;
  });
  
  html += `
    <tr class="subtotal-row">
      <td><strong>Total Revenue</strong></td>
      <td class="amount"><strong>${formatCurrency(totalRevenue)}</strong></td>
    </tr>
    <tr class="spacer"><td colspan="2"></td></tr>
    <tr class="section-header">
      <td colspan="2"><strong>EXPENSES</strong></td>
    </tr>
  `;
  
  expenses.forEach(account => {
    const act = activity[account.id];
    const amount = act ? (act.debit - act.credit) : 0;
    html += `
      <tr>
        <td class="indent">${account.accountName}</td>
        <td class="amount">${formatCurrency(amount)}</td>
      </tr>
    `;
  });
  
  html += `
    <tr class="subtotal-row">
      <td><strong>Total Expenses</strong></td>
      <td class="amount"><strong>${formatCurrency(totalExpenses)}</strong></td>
    </tr>
    <tr class="spacer"><td colspan="2"></td></tr>
    <tr class="total-row ${netIncome >= 0 ? 'profit' : 'loss'}">
      <td><strong>NET ${netIncome >= 0 ? 'INCOME' : 'LOSS'}</strong></td>
      <td class="amount"><strong>${formatCurrency(Math.abs(netIncome))}</strong></td>
    </tr>
  `;
  
  tbody.innerHTML = html;
}

/**
 * Generate Retained Earnings Statement
 */
function generateRetainedEarnings(fromDate, toDate) {
  const tbody = document.getElementById('retainedEarningsBody');
  
  // Display date range
  const dateDisplay = fromDate.toDateString() === toDate.toDateString()
    ? `As of ${formatDate(toDate)}`
    : `For the period from ${formatDate(fromDate)} to ${formatDate(toDate)}`;
  document.getElementById('reDate').textContent = dateDisplay;
  
  // Calculate activity for the date range
  const activity = getAccountActivityInRange(fromDate, toDate);
  
  const retainedEarningsAccount = allAccounts.find(a => 
    a.accountName.toLowerCase().includes('retained earnings')
  );
  
  const revenues = allAccounts.filter(a => a.accountCategory === 'Revenue');
  const expenses = allAccounts.filter(a => a.accountCategory === 'Expenses');
  
  // Revenue: credit minus debit (revenues increase with credits)
  const totalRevenue = revenues.reduce((sum, a) => {
    const act = activity[a.id];
    return sum + (act ? (act.credit - act.debit) : 0);
  }, 0);
  
  // Expenses: debit minus credit (expenses increase with debits)
  const totalExpenses = expenses.reduce((sum, a) => {
    const act = activity[a.id];
    return sum + (act ? (act.debit - act.credit) : 0);
  }, 0);
  
  const netIncome = totalRevenue - totalExpenses;
  
  // Calculate beginning retained earnings: balance as of day before period start
  let beginningRE = 0;
  if (retainedEarningsAccount) {
    const dayBeforeStart = new Date(fromDate);
    dayBeforeStart.setDate(dayBeforeStart.getDate() - 1);
    const reBalance = calculateAccountBalanceAsOf(retainedEarningsAccount.id, dayBeforeStart);
    beginningRE = reBalance.balance;
  }
  const endingRE = beginningRE + netIncome;
  
  const html = `
    <tr>
      <td>Beginning Retained Earnings</td>
      <td class="amount">${formatCurrency(beginningRE)}</td>
    </tr>
    <tr>
      <td class="indent">Add: Net Income</td>
      <td class="amount">${formatCurrency(netIncome)}</td>
    </tr>
    <tr>
      <td class="indent">Less: Dividends</td>
      <td class="amount">${formatCurrency(0)}</td>
    </tr>
    <tr class="total-row">
      <td><strong>Ending Retained Earnings</strong></td>
      <td class="amount"><strong>${formatCurrency(endingRE)}</strong></td>
    </tr>
  `;
  
  tbody.innerHTML = html;
}

/**
 * Email Modal Functions
 */

/**
 * Show send email modal
 */
async function showSendEmailModal() {
  const context = getCurrentReportContext();
  if (!context || !context.data) {
    alert('No report data available to email');
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
    
    // Set subject from report title
    document.getElementById('emailSubject').value = `${context.title} - ${context.data.subtitle}`;
    
    // Clear search input
    const searchInput = document.getElementById('searchRecipients');
    if (searchInput) searchInput.value = '';
    
    // Load recipients
    await loadEmailRecipients();
  }
}

window.showSendEmailModal = showSendEmailModal;

/**
 * Close email modal
 */
function closeEmailModal() {
  const modal = document.getElementById('sendEmailModal');
  if (modal) {
    modal.classList.remove('show');
    setTimeout(() => modal.style.display = 'none', 300);
  }
}

window.closeEmailModal = closeEmailModal;

/**
 * Load manager and accountant users as email recipients
 */
async function loadEmailRecipients() {
  const recipientsList = document.getElementById('recipientsList');
  if (!recipientsList) return;
  
  recipientsList.innerHTML = '<div class="loading-message">Loading users...</div>';
  
  try {
    const usersSnapshot = await getDocs(collection(db, "users"));
    allEmailRecipients = [];
    
    usersSnapshot.forEach(doc => {
      const user = doc.data();
      // Include administrators, managers, and accountants
      if (user.active && (user.role === 'administrator' || user.role === 'manager' || user.role === 'accountant')) {
        allEmailRecipients.push({
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          username: user.username,
          role: user.role
        });
      }
    });
    
    // Sort recipients: administrators first, then managers, then accountants
    const rolePriority = {
      'administrator': 1,
      'manager': 2,
      'accountant': 3
    };
    
    allEmailRecipients.sort((a, b) => {
      const priorityDiff = rolePriority[a.role] - rolePriority[b.role];
      if (priorityDiff !== 0) return priorityDiff;
      
      // Within same role, sort alphabetically by name
      const nameA = `${a.firstName || ''} ${a.lastName || ''}`.trim() || a.username || '';
      const nameB = `${b.firstName || ''} ${b.lastName || ''}`.trim() || b.username || '';
      return nameA.localeCompare(nameB);
    });
    
    displayEmailRecipients(allEmailRecipients);
    console.log(`Loaded ${allEmailRecipients.length} eligible recipients`);
    
  } catch (error) {
    console.error('Error loading recipients:', error);
    recipientsList.innerHTML = '<div class="error-message">Error loading users. Please try again.</div>';
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
function filterEmailRecipients() {
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
}

window.filterEmailRecipients = filterEmailRecipients;

/**
 * Handle email form submission
 */
async function handleSendEmail(event) {
  event.preventDefault();
  
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
    
    if (!subject) {
      showEmailStatus('Please fill in the email subject', 'error');
      return;
    }
    
    // Disable send button
    const sendBtn = document.getElementById('sendEmailBtn');
    sendBtn.disabled = true;
    
    // Show loading status
    showEmailStatus('Sending email...', 'loading');
    
    // Get current report context for attachment
    const context = getCurrentReportContext();
    
    // Prepare message with report info
    const emailMessage = message ? 
      `${message}\n\n---\n\nPlease find attached the ${context.title}.` :
      `Please find attached the ${context.title}.`;
    
    // Get Firebase ID token for authentication
    const user = auth.currentUser;
    if (!user) {
      throw new Error('You must be logged in to send emails');
    }
    
    const idToken = await user.getIdToken();
    
    // Send email via API endpoint
    const response = await fetch('/api/send-email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`
      },
      body: JSON.stringify({
        to: recipients,
        subject: subject,
        text: emailMessage,
        html: `<p>${emailMessage.replace(/\n/g, '<br>')}</p>`
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
      closeEmailModal();
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
}

window.handleSendEmail = handleSendEmail;

/**
 * Show email status message
 */
function showEmailStatus(message, type) {
  const statusEl = document.getElementById('emailStatus');
  if (!statusEl) return;
  
  statusEl.textContent = message;
  statusEl.className = `email-status ${type}`;
}

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
      
      // Set today's date for both date fields
      const today = new Date().toISOString().split('T')[0];
      const fromDateField = document.getElementById('reportFromDate');
      const toDateField = document.getElementById('reportToDate');
      if (fromDateField) fromDateField.value = today;
      if (toDateField) toDateField.value = today;
      
      // Load accounts and generate initial report
      await loadAllAccounts();
      generateTrialBalance(new Date());
      
    } else {
      window.location.href = "index.html";
    }
  } else {
    window.location.href = "index.html";
  }
});
