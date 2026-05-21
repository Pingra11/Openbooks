import { collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import { db } from './firebaseConfig.js';

const RATIO_THRESHOLDS = {
  currentRatio: {
    good: { min: 2.0, max: Infinity },
    warning: { min: 1.0, max: 2.0 },
    bad: { min: -Infinity, max: 1.0 }
  },
  quickRatio: {
    good: { min: 1.0, max: Infinity },
    warning: { min: 0.5, max: 1.0 },
    bad: { min: -Infinity, max: 0.5 }
  },
  debtToEquity: {
    good: { min: -Infinity, max: 1.5 },
    warning: { min: 1.5, max: 2.5 },
    bad: { min: 2.5, max: Infinity }
  },
  returnOnAssets: {
    good: { min: 5, max: Infinity },
    warning: { min: 2, max: 5 },
    bad: { min: -Infinity, max: 2 }
  },
  returnOnEquity: {
    good: { min: 15, max: Infinity },
    warning: { min: 10, max: 15 },
    bad: { min: -Infinity, max: 10 }
  },
  grossMargin: {
    good: { min: 40, max: Infinity },
    warning: { min: 25, max: 40 },
    bad: { min: -Infinity, max: 25 }
  },
  netProfitMargin: {
    good: { min: 10, max: Infinity },
    warning: { min: 5, max: 10 },
    bad: { min: -Infinity, max: 5 }
  }
};

function getHealthStatus(value, thresholds) {
  if (value === null || value === undefined || isNaN(value)) {
    return 'no-data';
  }
  if (value >= thresholds.good.min && value < thresholds.good.max) {
    return 'good';
  }
  if (value >= thresholds.warning.min && value < thresholds.warning.max) {
    return 'warning';
  }
  return 'bad';
}

function formatRatioValue(value, isPercentage = false) {
  if (value === null || value === undefined || isNaN(value)) {
    return 'N/A';
  }
  if (isPercentage) {
    return value.toFixed(1) + '%';
  }
  return value.toFixed(2);
}

async function getFinancialData() {
  const accountsSnapshot = await getDocs(collection(db, "accounts"));
  
  const financialData = {
    currentAssets: 0,
    totalAssets: 0,
    inventory: 0,
    currentLiabilities: 0,
    totalLiabilities: 0,
    totalEquity: 0,
    hasData: false
  };

  const revenueAccounts = [];
  const expenseAccounts = [];
  const cogsAccounts = [];

  accountsSnapshot.forEach(docSnap => {
    const account = docSnap.data();
    if (!account.active) return;
    
    const balance = parseFloat(account.balance || account.currentBalance || 0);
    const category = account.accountCategory;
    const accountNumber = parseInt(account.accountNumber, 10);
    const accountName = (account.accountName || '').toLowerCase();

    if (category === 'Assets') {
      financialData.totalAssets += balance;
      financialData.hasData = true;
      if (accountNumber >= 1000 && accountNumber < 1500) {
        financialData.currentAssets += balance;
      }
      if (accountName.includes('inventory') || accountName.includes('merchandise')) {
        financialData.inventory += balance;
      }
    } else if (category === 'Liabilities') {
      financialData.totalLiabilities += balance;
      financialData.hasData = true;
      if (accountNumber >= 2000 && accountNumber < 2500) {
        financialData.currentLiabilities += balance;
      }
    } else if (category === 'Equity') {
      financialData.totalEquity += balance;
      financialData.hasData = true;
    } else if (category === 'Revenue') {
      revenueAccounts.push({ id: docSnap.id, balance, account });
      financialData.hasData = true;
    } else if (category === 'Expenses') {
      expenseAccounts.push({ id: docSnap.id, balance, account });
      financialData.hasData = true;
      if (accountNumber >= 5000 && accountNumber < 5100 || 
          accountName.includes('cost of goods') || 
          accountName.includes('cogs') ||
          accountName.includes('cost of sales')) {
        cogsAccounts.push({ id: docSnap.id, balance, account });
      }
    }
  });

  const totalRevenue = revenueAccounts.reduce((sum, r) => sum + r.balance, 0);
  const totalExpenses = expenseAccounts.reduce((sum, e) => sum + e.balance, 0);
  const totalCOGS = cogsAccounts.reduce((sum, c) => sum + c.balance, 0);
  
  const netIncome = totalRevenue - totalExpenses;
  const grossProfit = totalRevenue - totalCOGS;

  return {
    ...financialData,
    totalRevenue,
    totalExpenses,
    totalCOGS,
    netIncome,
    grossProfit
  };
}

function computeRatios(data) {
  return {
    currentRatio: data.currentLiabilities > 0 
      ? data.currentAssets / data.currentLiabilities 
      : null,
    quickRatio: data.currentLiabilities > 0 
      ? (data.currentAssets - data.inventory) / data.currentLiabilities 
      : null,
    debtToEquity: data.totalEquity > 0 
      ? data.totalLiabilities / data.totalEquity 
      : null,
    returnOnAssets: data.totalAssets > 0 
      ? (data.netIncome / data.totalAssets) * 100 
      : null,
    returnOnEquity: data.totalEquity > 0 
      ? (data.netIncome / data.totalEquity) * 100 
      : null,
    grossMargin: data.totalRevenue > 0 
      ? (data.grossProfit / data.totalRevenue) * 100 
      : null,
    netProfitMargin: data.totalRevenue > 0 
      ? (data.netIncome / data.totalRevenue) * 100 
      : null,
    hasData: data.hasData
  };
}

function createRatioCard(name, value, status, isPercentage = false, description = '', formula = '') {
  const statusClass = `ratio-${status}`;
  const formattedValue = formatRatioValue(value, isPercentage);
  const cardId = name.toLowerCase().replace(/\s+/g, '-');
  
  return `
    <div class="ratio-card ${statusClass}" onclick="showRatioTooltip('${cardId}')" style="cursor: pointer;">
      <div class="ratio-value">${formattedValue}</div>
      <div class="ratio-name">${name}</div>
      <div class="ratio-indicator"></div>
      <div class="ratio-click-hint">Click for details</div>
      <div id="tooltip-${cardId}" class="ratio-tooltip-data" data-name="${name}" data-description="${description}" data-formula="${formula}" data-status="${status}" style="display:none;"></div>
    </div>
  `;
}

function initRatioTooltipModal() {
  if (document.getElementById('ratioTooltipModal')) return;
  
  const modal = document.createElement('div');
  modal.id = 'ratioTooltipModal';
  modal.className = 'ratio-tooltip-modal';
  modal.innerHTML = `
    <div class="ratio-tooltip-content">
      <button class="ratio-tooltip-close" onclick="closeRatioTooltip()">&times;</button>
      <h3 id="ratioTooltipTitle"></h3>
      <div id="ratioTooltipStatus" class="ratio-tooltip-status"></div>
      <p id="ratioTooltipFormula" class="ratio-tooltip-formula"></p>
      <p id="ratioTooltipDescription"></p>
    </div>
  `;
  document.body.appendChild(modal);
  
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeRatioTooltip();
  });
}

window.showRatioTooltip = function(cardId) {
  initRatioTooltipModal();
  
  const dataEl = document.getElementById(`tooltip-${cardId}`);
  if (!dataEl) return;
  
  const name = dataEl.dataset.name;
  const description = dataEl.dataset.description;
  const formula = dataEl.dataset.formula;
  const status = dataEl.dataset.status;
  
  document.getElementById('ratioTooltipTitle').textContent = name;
  document.getElementById('ratioTooltipDescription').textContent = description;
  document.getElementById('ratioTooltipFormula').textContent = formula;
  
  const statusEl = document.getElementById('ratioTooltipStatus');
  statusEl.className = `ratio-tooltip-status status-${status}`;
  statusEl.textContent = status === 'good' ? 'Healthy' : status === 'warning' ? 'Warning' : status === 'bad' ? 'Needs Attention' : 'No Data';
  
  document.getElementById('ratioTooltipModal').classList.add('show');
};

window.closeRatioTooltip = function() {
  const modal = document.getElementById('ratioTooltipModal');
  if (modal) modal.classList.remove('show');
};

export async function loadFinancialRatios() {
  const container = document.getElementById('financialRatiosContainer');
  if (!container) return;

  try {
    container.innerHTML = '<div class="loading-ratios">Loading financial ratios...</div>';

    const financialData = await getFinancialData();
    
    if (!financialData.hasData) {
      container.innerHTML = `
        <div class="no-data-message">
          No financial data available. Create accounts and post journal entries to see financial ratios.
        </div>
      `;
      return;
    }

    const ratios = computeRatios(financialData);

    const ratioCards = [
      createRatioCard(
        'Current Ratio',
        ratios.currentRatio,
        getHealthStatus(ratios.currentRatio, RATIO_THRESHOLDS.currentRatio),
        false,
        'Can the company pay its bills this year? Compares current assets to current liabilities. A ratio above 2.0 means strong ability to cover short-term debts.',
        'Formula: Current Assets / Current Liabilities'
      ),
      createRatioCard(
        'Quick Ratio',
        ratios.quickRatio,
        getHealthStatus(ratios.quickRatio, RATIO_THRESHOLDS.quickRatio),
        false,
        'Can the company pay bills TODAY without selling inventory? A more conservative liquidity test. Above 1.0 means immediate debts are covered by liquid assets.',
        'Formula: (Current Assets - Inventory) / Current Liabilities'
      ),
      createRatioCard(
        'Debt-to-Equity',
        ratios.debtToEquity,
        getHealthStatus(ratios.debtToEquity, RATIO_THRESHOLDS.debtToEquity),
        false,
        'How much does the company rely on borrowed money vs. owner investment? Lower is generally safer. Above 2.5 indicates high financial risk from debt.',
        'Formula: Total Liabilities / Total Equity'
      ),
      createRatioCard(
        'Return on Assets',
        ratios.returnOnAssets,
        getHealthStatus(ratios.returnOnAssets, RATIO_THRESHOLDS.returnOnAssets),
        true,
        'How efficiently does the company use everything it owns to generate profit? Shows if management is using resources wisely. Above 5% is considered good.',
        'Formula: Net Income / Total Assets x 100%'
      ),
      createRatioCard(
        'Return on Equity',
        ratios.returnOnEquity,
        getHealthStatus(ratios.returnOnEquity, RATIO_THRESHOLDS.returnOnEquity),
        true,
        'How much profit does the owners investment generate? Tells investors if their money is being put to good use. Above 15% indicates strong returns.',
        'Formula: Net Income / Total Equity x 100%'
      ),
      createRatioCard(
        'Gross Margin',
        ratios.grossMargin,
        getHealthStatus(ratios.grossMargin, RATIO_THRESHOLDS.grossMargin),
        true,
        'How much money is left after paying the direct costs of products/services? Shows if pricing and production costs are sustainable. Above 40% is healthy.',
        'Formula: (Revenue - Cost of Goods Sold) / Revenue x 100%'
      ),
      createRatioCard(
        'Net Profit Margin',
        ratios.netProfitMargin,
        getHealthStatus(ratios.netProfitMargin, RATIO_THRESHOLDS.netProfitMargin),
        true,
        'The bottom line - how much of every dollar of sales becomes actual profit after ALL expenses? This is the ultimate measure of business efficiency. Above 10% is strong.',
        'Formula: Net Income / Revenue x 100%'
      )
    ];

    container.innerHTML = `
      <div class="ratios-grid">
        ${ratioCards.join('')}
      </div>
      <div class="ratio-legend">
        <span class="legend-item"><span class="legend-dot good"></span> Good</span>
        <span class="legend-item"><span class="legend-dot warning"></span> Warning</span>
        <span class="legend-item"><span class="legend-dot bad"></span> Needs Attention</span>
      </div>
    `;

  } catch (error) {
    console.error('Error loading financial ratios:', error);
    container.innerHTML = `
      <div class="error-message">
        Unable to load financial ratios. Please try again later.
      </div>
    `;
  }
}

export async function loadImportantMessages(userRole) {
  const container = document.getElementById('importantMessagesContainer');
  if (!container) return;

  try {
    const messages = [];

    if (userRole === 'manager' || userRole === 'administrator') {
      const pendingQuery = query(
        collection(db, "journalEntries"),
        where("status", "==", "pending_approval")
      );
      const pendingSnapshot = await getDocs(pendingQuery);
      const pendingCount = pendingSnapshot.size;

      if (pendingCount > 0) {
        messages.push({
          type: 'action',
          priority: 'high',
          icon: '📋',
          title: 'Journal Entries Awaiting Approval',
          description: `${pendingCount} journal ${pendingCount === 1 ? 'entry requires' : 'entries require'} your review and approval.`,
          action: 'journal.html',
          actionText: 'Review Entries'
        });
      }
    }

    if (userRole === 'accountant') {
      const rejectedQuery = query(
        collection(db, "journalEntries"),
        where("status", "==", "rejected")
      );
      const rejectedSnapshot = await getDocs(rejectedQuery);
      const rejectedCount = rejectedSnapshot.size;

      if (rejectedCount > 0) {
        messages.push({
          type: 'warning',
          priority: 'medium',
          icon: '⚠️',
          title: 'Rejected Journal Entries',
          description: `${rejectedCount} journal ${rejectedCount === 1 ? 'entry has' : 'entries have'} been rejected and may need revision.`,
          action: 'journal.html',
          actionText: 'View Rejected'
        });
      }
    }

    const draftQuery = query(
      collection(db, "journalEntries"),
      where("status", "==", "draft")
    );
    const draftSnapshot = await getDocs(draftQuery);
    const draftCount = draftSnapshot.size;

    if (draftCount > 0 && userRole === 'accountant') {
      messages.push({
        type: 'info',
        priority: 'low',
        icon: '📝',
        title: 'Draft Entries',
        description: `You have ${draftCount} draft journal ${draftCount === 1 ? 'entry' : 'entries'} that can be completed and submitted.`,
        action: 'journal.html',
        actionText: 'View Drafts'
      });
    }

    if (messages.length === 0) {
      container.innerHTML = `
        <div class="no-messages">
          <span class="no-messages-icon">✓</span>
          <p>No important messages at this time.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = messages.map(msg => `
      <div class="message-card message-${msg.type} priority-${msg.priority}">
        <div class="message-icon">${msg.icon}</div>
        <div class="message-content">
          <h4>${msg.title}</h4>
          <p>${msg.description}</p>
        </div>
        ${msg.action ? `<a href="${msg.action}" class="message-action">${msg.actionText}</a>` : ''}
      </div>
    `).join('');

  } catch (error) {
    console.error('Error loading important messages:', error);
    container.innerHTML = `
      <div class="error-message">
        Unable to load messages. Please try again later.
      </div>
    `;
  }
}

export { RATIO_THRESHOLDS, getHealthStatus, computeRatios };
