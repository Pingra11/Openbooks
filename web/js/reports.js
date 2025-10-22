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

let currentUser = null;
let allAccounts = [];
let currentReportType = 'trialBalance';

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
 * Load all accounts
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
  } catch (error) {
    console.error('Error loading accounts:', error);
  }
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
 * Load current report
 */
window.loadCurrentReport = function() {
  const reportDate = document.getElementById('reportDate').value 
    ? new Date(document.getElementById('reportDate').value)
    : new Date();
  
  switch(currentReportType) {
    case 'trialBalance':
      generateTrialBalance(reportDate);
      break;
    case 'balanceSheet':
      generateBalanceSheet(reportDate);
      break;
    case 'incomeStatement':
      generateIncomeStatement(reportDate);
      break;
    case 'retainedEarnings':
      generateRetainedEarnings(reportDate);
      break;
  }
};

/**
 * Generate Trial Balance
 */
function generateTrialBalance(asOfDate) {
  const tbody = document.getElementById('trialBalanceBody');
  const tfoot = document.getElementById('trialBalanceFoot');
  
  document.getElementById('tbDate').textContent = formatDate(asOfDate);
  
  let totalDebits = 0;
  let totalCredits = 0;
  
  const rows = allAccounts.map(account => {
    const debit = parseFloat(account.debit || 0);
    const credit = parseFloat(account.credit || 0);
    
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
  
  const assets = allAccounts.filter(a => a.accountCategory === 'Assets');
  const liabilities = allAccounts.filter(a => a.accountCategory === 'Liabilities');
  const equity = allAccounts.filter(a => a.accountCategory === 'Equity');
  
  const totalAssets = assets.reduce((sum, a) => sum + parseFloat(a.balance || 0), 0);
  const totalLiabilities = liabilities.reduce((sum, a) => sum + parseFloat(a.balance || 0), 0);
  const totalEquity = equity.reduce((sum, a) => sum + parseFloat(a.balance || 0), 0);
  
  let html = `
    <tr class="section-header">
      <td colspan="2"><strong>ASSETS</strong></td>
    </tr>
  `;
  
  assets.forEach(account => {
    html += `
      <tr>
        <td class="indent">${account.accountName}</td>
        <td class="amount">${formatCurrency(account.balance)}</td>
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
    html += `
      <tr>
        <td class="indent">${account.accountName}</td>
        <td class="amount">${formatCurrency(account.balance)}</td>
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
    html += `
      <tr>
        <td class="indent">${account.accountName}</td>
        <td class="amount">${formatCurrency(account.balance)}</td>
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
function generateIncomeStatement(asOfDate) {
  const tbody = document.getElementById('incomeStatementBody');
  document.getElementById('isDate').textContent = formatDate(asOfDate);
  
  const revenues = allAccounts.filter(a => a.accountCategory === 'Revenue');
  const expenses = allAccounts.filter(a => a.accountCategory === 'Expenses');
  
  const totalRevenue = revenues.reduce((sum, a) => sum + parseFloat(a.balance || 0), 0);
  const totalExpenses = expenses.reduce((sum, a) => sum + parseFloat(a.balance || 0), 0);
  const netIncome = totalRevenue - totalExpenses;
  
  let html = `
    <tr class="section-header">
      <td colspan="2"><strong>REVENUE</strong></td>
    </tr>
  `;
  
  revenues.forEach(account => {
    html += `
      <tr>
        <td class="indent">${account.accountName}</td>
        <td class="amount">${formatCurrency(account.balance)}</td>
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
    html += `
      <tr>
        <td class="indent">${account.accountName}</td>
        <td class="amount">${formatCurrency(account.balance)}</td>
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
function generateRetainedEarnings(asOfDate) {
  const tbody = document.getElementById('retainedEarningsBody');
  document.getElementById('reDate').textContent = formatDate(asOfDate);
  
  const retainedEarningsAccount = allAccounts.find(a => 
    a.accountName.toLowerCase().includes('retained earnings')
  );
  
  const revenues = allAccounts.filter(a => a.accountCategory === 'Revenue');
  const expenses = allAccounts.filter(a => a.accountCategory === 'Expenses');
  
  const totalRevenue = revenues.reduce((sum, a) => sum + parseFloat(a.balance || 0), 0);
  const totalExpenses = expenses.reduce((sum, a) => sum + parseFloat(a.balance || 0), 0);
  const netIncome = totalRevenue - totalExpenses;
  
  const beginningRE = retainedEarningsAccount ? parseFloat(retainedEarningsAccount.initialBalance || 0) : 0;
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
      
      // Set today's date
      const today = new Date().toISOString().split('T')[0];
      document.getElementById('reportDate').value = today;
      
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
