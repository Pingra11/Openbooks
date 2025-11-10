/**
 * Error Messages System
 * Database-backed error messages for comprehensive validation
 */

import { db } from "./firebaseConfig.js";
import { collection, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

// Error message codes for journal entries
export const ERROR_CODES = {
  // Required fields
  JE_MISSING_DATE: 'JE_MISSING_DATE',
  JE_MISSING_DESCRIPTION: 'JE_MISSING_DESCRIPTION',
  
  // Line items
  JE_INSUFFICIENT_LINES: 'JE_INSUFFICIENT_LINES',
  JE_MISSING_ACCOUNT: 'JE_MISSING_ACCOUNT',
  JE_MISSING_AMOUNT: 'JE_MISSING_AMOUNT',
  JE_INVALID_AMOUNT: 'JE_INVALID_AMOUNT',
  JE_BOTH_DEBIT_CREDIT: 'JE_BOTH_DEBIT_CREDIT',
  
  // Balance validation
  JE_UNBALANCED: 'JE_UNBALANCED',
  JE_ZERO_TOTAL: 'JE_ZERO_TOTAL',
  
  // Account validation
  JE_INACTIVE_ACCOUNT: 'JE_INACTIVE_ACCOUNT',
  JE_DUPLICATE_ACCOUNT: 'JE_DUPLICATE_ACCOUNT',
  
  // File validation
  JE_FILE_TOO_LARGE: 'JE_FILE_TOO_LARGE',
  JE_INVALID_FILE_TYPE: 'JE_INVALID_FILE_TYPE',
  
  // General
  JE_SAVE_FAILED: 'JE_SAVE_FAILED',
  JE_NETWORK_ERROR: 'JE_NETWORK_ERROR'
};

// Default error messages
const DEFAULT_ERROR_MESSAGES = {
  [ERROR_CODES.JE_MISSING_DATE]: {
    code: ERROR_CODES.JE_MISSING_DATE,
    message: 'Entry date is required. Please select a date for this journal entry.',
    severity: 'error',
    field: 'entryDate'
  },
  [ERROR_CODES.JE_MISSING_DESCRIPTION]: {
    code: ERROR_CODES.JE_MISSING_DESCRIPTION,
    message: 'Description is required. Please provide a description for this journal entry.',
    severity: 'error',
    field: 'entryDescription'
  },
  [ERROR_CODES.JE_INSUFFICIENT_LINES]: {
    code: ERROR_CODES.JE_INSUFFICIENT_LINES,
    message: 'A journal entry must have at least 2 line items (one debit and one credit). Please add more line items.',
    severity: 'error',
    field: 'lineItems'
  },
  [ERROR_CODES.JE_MISSING_ACCOUNT]: {
    code: ERROR_CODES.JE_MISSING_ACCOUNT,
    message: 'Please select an account for this line item.',
    severity: 'error',
    field: 'account'
  },
  [ERROR_CODES.JE_MISSING_AMOUNT]: {
    code: ERROR_CODES.JE_MISSING_AMOUNT,
    message: 'Each line item must have either a debit or credit amount. Please enter an amount.',
    severity: 'error',
    field: 'amount'
  },
  [ERROR_CODES.JE_INVALID_AMOUNT]: {
    code: ERROR_CODES.JE_INVALID_AMOUNT,
    message: 'Amount must be a positive number. Please enter a valid amount greater than zero.',
    severity: 'error',
    field: 'amount'
  },
  [ERROR_CODES.JE_BOTH_DEBIT_CREDIT]: {
    code: ERROR_CODES.JE_BOTH_DEBIT_CREDIT,
    message: 'A line item cannot have both debit and credit amounts. Please enter only one.',
    severity: 'error',
    field: 'amount'
  },
  [ERROR_CODES.JE_UNBALANCED]: {
    code: ERROR_CODES.JE_UNBALANCED,
    message: 'Total debits must equal total credits. The difference is {difference}. Please adjust your entries to balance the transaction.',
    severity: 'error',
    field: 'totals'
  },
  [ERROR_CODES.JE_ZERO_TOTAL]: {
    code: ERROR_CODES.JE_ZERO_TOTAL,
    message: 'Journal entry must have a total amount greater than zero. Please enter transaction amounts.',
    severity: 'error',
    field: 'totals'
  },
  [ERROR_CODES.JE_INACTIVE_ACCOUNT]: {
    code: ERROR_CODES.JE_INACTIVE_ACCOUNT,
    message: 'Account "{accountName}" is inactive and cannot be used. Please select an active account.',
    severity: 'error',
    field: 'account'
  },
  [ERROR_CODES.JE_FILE_TOO_LARGE]: {
    code: ERROR_CODES.JE_FILE_TOO_LARGE,
    message: 'File "{fileName}" exceeds the maximum size of 10MB. Please select a smaller file.',
    severity: 'error',
    field: 'attachment'
  },
  [ERROR_CODES.JE_INVALID_FILE_TYPE]: {
    code: ERROR_CODES.JE_INVALID_FILE_TYPE,
    message: 'File type not allowed for "{fileName}". Only PDF, Word, Excel, CSV, JPG, and PNG files are accepted.',
    severity: 'error',
    field: 'attachment'
  },
  [ERROR_CODES.JE_SAVE_FAILED]: {
    code: ERROR_CODES.JE_SAVE_FAILED,
    message: 'Failed to save journal entry. {details}',
    severity: 'error',
    field: 'general'
  },
  [ERROR_CODES.JE_NETWORK_ERROR]: {
    code: ERROR_CODES.JE_NETWORK_ERROR,
    message: 'Network error occurred. Please check your connection and try again.',
    severity: 'error',
    field: 'general'
  }
};

/**
 * Initialize error messages in database
 */
export async function initializeErrorMessages() {
  try {
    for (const [code, errorData] of Object.entries(DEFAULT_ERROR_MESSAGES)) {
      const errorRef = doc(db, "errorMessages", code);
      await setDoc(errorRef, {
        ...errorData,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }, { merge: true });
    }
    console.log('Error messages initialized successfully');
  } catch (error) {
    console.error('Error initializing error messages:', error);
  }
}

/**
 * Get error message from database
 */
export async function getErrorMessage(code, replacements = {}) {
  try {
    const errorRef = doc(db, "errorMessages", code);
    const errorDoc = await getDoc(errorRef);
    
    if (errorDoc.exists()) {
      let message = errorDoc.data().message;
      
      // Replace placeholders with actual values
      for (const [key, value] of Object.entries(replacements)) {
        message = message.replace(`{${key}}`, value);
      }
      
      return {
        code,
        message,
        severity: errorDoc.data().severity,
        field: errorDoc.data().field
      };
    }
    
    // Fallback to default
    return DEFAULT_ERROR_MESSAGES[code] || {
      code: 'UNKNOWN_ERROR',
      message: 'An unknown error occurred.',
      severity: 'error',
      field: 'general'
    };
  } catch (error) {
    console.error('Error fetching error message:', error);
    return DEFAULT_ERROR_MESSAGES[code] || {
      code: 'UNKNOWN_ERROR',
      message: 'An unknown error occurred.',
      severity: 'error',
      field: 'general'
    };
  }
}

/**
 * Get error message synchronously (uses defaults)
 */
export function getErrorMessageSync(code, replacements = {}) {
  const errorData = DEFAULT_ERROR_MESSAGES[code] || {
    code: 'UNKNOWN_ERROR',
    message: 'An unknown error occurred.',
    severity: 'error',
    field: 'general'
  };
  
  let message = errorData.message;
  
  // Replace placeholders
  for (const [key, value] of Object.entries(replacements)) {
    message = message.replace(`{${key}}`, value);
  }
  
  return {
    code,
    message,
    severity: errorData.severity,
    field: errorData.field
  };
}

/**
 * Display error message to user
 */
export function displayError(errorData, containerSelector = '#errorContainer') {
  const container = document.querySelector(containerSelector);
  if (!container) {
    console.error('Error container not found:', containerSelector);
    return;
  }
  
  const errorDiv = document.createElement('div');
  errorDiv.className = 'error-message';
  errorDiv.setAttribute('data-error-code', errorData.code);
  errorDiv.setAttribute('data-error-field', errorData.field);
  errorDiv.innerHTML = `
    <span class="error-icon">⚠️</span>
    <span class="error-text">${errorData.message}</span>
  `;
  
  container.appendChild(errorDiv);
  
  // Scroll error into view
  errorDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/**
 * Clear all errors
 */
export function clearErrors(containerSelector = '#errorContainer') {
  const container = document.querySelector(containerSelector);
  if (container) {
    container.innerHTML = '';
  }
}

/**
 * Clear specific error by code
 */
export function clearError(code, containerSelector = '#errorContainer') {
  const container = document.querySelector(containerSelector);
  if (container) {
    const errorElements = container.querySelectorAll(`[data-error-code="${code}"]`);
    errorElements.forEach(el => el.remove());
  }
}

/**
 * Clear errors for specific field
 */
export function clearFieldErrors(field, containerSelector = '#errorContainer') {
  const container = document.querySelector(containerSelector);
  if (container) {
    const errorElements = container.querySelectorAll(`[data-error-field="${field}"]`);
    errorElements.forEach(el => el.remove());
  }
}
