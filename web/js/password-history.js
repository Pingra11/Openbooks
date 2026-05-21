/**
 * Password History Management System
 * Prevents reuse of previous passwords for enhanced security compliance
 * Integrates with Firebase Auth and Firestore for secure password tracking
 */

import { db } from "./firebaseConfig.js";
import { 
  doc, getDoc, updateDoc, arrayUnion, serverTimestamp, 
  collection, addDoc
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

// Configuration
const PASSWORD_HISTORY_LIMIT = 12; // Number of previous passwords to remember
const SALT_LENGTH = 32; // Salt length for password hashing

/**
 * Generate a cryptographically secure salt for password hashing
 */
function generateSalt(length = SALT_LENGTH) {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Hash a password with salt using SHA-256
 * @param {string} password - The password to hash
 * @param {string} salt - The salt to use
 * @returns {Promise<string>} - The hashed password
 */
async function hashPassword(password, salt) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + salt);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Check if a password has been used before by the user
 * @param {string} userId - The user's Firebase UID
 * @param {string} newPassword - The new password to check
 * @returns {Promise<{isReused: boolean, message?: string}>} - Check result
 */
export async function checkPasswordHistory(userId, newPassword) {
  try {
    // Get user document
    const userDoc = await getDoc(doc(db, "users", userId));
    if (!userDoc.exists()) {
      return { isReused: false }; // Allow if user not found (new user)
    }

    const userData = userDoc.data();
    const passwordHistory = userData.passwordHistory || [];

    // If no history, allow the password
    if (passwordHistory.length === 0) {
      return { isReused: false };
    }

    // Check new password against each historical password
    for (const historyEntry of passwordHistory) {
      const hash = await hashPassword(newPassword, historyEntry.salt);
      if (hash === historyEntry.hash) {
        const usedDate = historyEntry.timestamp?.toDate();
        const dateStr = usedDate ? usedDate.toLocaleDateString() : 'previously';
        return { 
          isReused: true, 
          message: `This password was used ${dateStr}. Please choose a different password.`
        };
      }
    }

    return { isReused: false };

  } catch (error) {
    console.error('Error checking password history:', error);
    // On error, allow the password to avoid blocking legitimate users
    return { isReused: false };
  }
}

/**
 * Store a new password in the user's password history
 * @param {string} userId - The user's Firebase UID  
 * @param {string} password - The password to store
 * @param {string} changedBy - Who changed the password ('user', 'admin', 'reset')
 * @returns {Promise<void>}
 */
export async function storePasswordInHistory(userId, password, changedBy = 'user') {
  try {
    const salt = generateSalt();
    const hash = await hashPassword(password, salt);

    // Create password history entry
    const historyEntry = {
      hash,
      salt,
      timestamp: serverTimestamp(),
      changedBy,
      userAgent: navigator.userAgent.substring(0, 100) // Truncate for storage efficiency
    };

    // Get current user document
    const userDoc = await getDoc(doc(db, "users", userId));
    if (!userDoc.exists()) {
      console.warn(`User ${userId} not found for password history storage`);
      return;
    }

    const userData = userDoc.data();
    const currentHistory = userData.passwordHistory || [];

    // Create new history array with the new entry
    const newHistory = [historyEntry, ...currentHistory];

    // Limit history to configured maximum
    const limitedHistory = newHistory.slice(0, PASSWORD_HISTORY_LIMIT);

    // Update user document with new password history
    await updateDoc(doc(db, "users", userId), {
      passwordHistory: limitedHistory,
      lastPasswordChange: serverTimestamp(),
      passwordChangedBy: changedBy
    });

    // Log password change for audit trail
    await addDoc(collection(db, "logs"), {
      logType: 'password_change',
      uid: userId,
      changedBy,
      timestamp: serverTimestamp(),
      userAgent: navigator.userAgent,
      details: `Password changed by ${changedBy}`
    });

    console.log(`Password history updated for user ${userId}. History entries: ${limitedHistory.length}`);

  } catch (error) {
    console.error('Error storing password in history:', error);
    // Don't throw error - password change should succeed even if history fails
  }
}

/**
 * Get password history information for a user (admin only)
 * @param {string} userId - The user's Firebase UID
 * @returns {Promise<Array>} - Array of password history metadata (no actual hashes)
 */
export async function getPasswordHistoryInfo(userId) {
  try {
    const userDoc = await getDoc(doc(db, "users", userId));
    if (!userDoc.exists()) {
      return [];
    }

    const userData = userDoc.data();
    const passwordHistory = userData.passwordHistory || [];

    // Return only metadata, never actual hashes
    return passwordHistory.map(entry => ({
      timestamp: entry.timestamp,
      changedBy: entry.changedBy,
      userAgent: entry.userAgent
    }));

  } catch (error) {
    console.error('Error getting password history info:', error);
    return [];
  }
}

/**
 * Clear password history for a user (admin only - for compliance/GDPR)
 * @param {string} userId - The user's Firebase UID
 * @param {string} adminId - The admin performing the action
 * @returns {Promise<void>}
 */
export async function clearPasswordHistory(userId, adminId) {
  try {
    await updateDoc(doc(db, "users", userId), {
      passwordHistory: [],
      historyCleared: serverTimestamp(),
      historyClearedBy: adminId
    });

    // Log the action
    await addDoc(collection(db, "logs"), {
      logType: 'password_history_cleared',
      uid: userId,
      adminId,
      timestamp: serverTimestamp(),
      userAgent: navigator.userAgent
    });

    console.log(`Password history cleared for user ${userId} by admin ${adminId}`);

  } catch (error) {
    console.error('Error clearing password history:', error);
    throw error;
  }
}

/**
 * Validate password against current requirements and history
 * @param {string} userId - The user's Firebase UID
 * @param {string} password - The password to validate
 * @returns {Promise<{valid: boolean, errors: Array<string>}>} - Validation result
 */
export async function validatePasswordWithHistory(userId, password) {
  const errors = [];

  // Basic password requirements
  if (password.length < 8) {
    errors.push("Password must be at least 8 characters long");
  }
  if (!/^[A-Za-z]/.test(password)) {
    errors.push("Password must start with a letter");
  }
  if (!/[A-Za-z]/.test(password)) {
    errors.push("Password must contain at least one letter");
  }
  if (!/\d/.test(password)) {
    errors.push("Password must contain at least one number");
  }
  if (!/[!@#$%^&*]/.test(password)) {
    errors.push("Password must contain at least one special character");
  }

  // Check password history
  if (userId) {
    const historyCheck = await checkPasswordHistory(userId, password);
    if (historyCheck.isReused) {
      errors.push(historyCheck.message);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

// Export configuration for other modules
export const PASSWORD_HISTORY_CONFIG = {
  LIMIT: PASSWORD_HISTORY_LIMIT,
  SALT_LENGTH
};