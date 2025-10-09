/**
 * Replit Email Integration for OpenBooks Admin System
 * Based on Replit Mail integration blueprint - adapted for JavaScript
 */

// Simple email validation function
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Get authentication token for Replit
async function getAuthToken() {
  try {
    // Try to get the real Replit authentication token from the server
    const response = await fetch('/api/get-repl-token');
    if (response.ok) {
      const data = await response.json();
      return data.token;
    }
  } catch (error) {
    console.warn('Could not get Replit token from server:', error);
  }

  // Fallback: Check if we're in Replit environment and try direct access
  if (window.location.hostname.includes('replit') || window.location.hostname.includes('repl.co')) {
    throw new Error('Email service requires proper Replit authentication. Please contact administrator.');
  } else {
    throw new Error('Email service is only available in Replit environment.');
  }
}

/**
 * Send email using Replit Mail service
 * @param {Object} message - Email message object
 * @param {string|string[]} message.to - Recipient email address(es)
 * @param {string|string[]} message.cc - CC recipient email address(es) (optional)
 * @param {string} message.subject - Email subject
 * @param {string} message.text - Plain text body (optional)
 * @param {string} message.html - HTML body (optional)
 * @param {Array} message.attachments - Email attachments (optional)
 * @returns {Promise<Object>} Email send result
 */
export async function sendEmail(message) {
  // Validate required fields
  if (!message.to) {
    throw new Error('Recipient email address is required');
  }
  
  if (!message.subject) {
    throw new Error('Email subject is required');
  }
  
  if (!message.text && !message.html) {
    throw new Error('Email must have either text or HTML content');
  }
  
  // Validate email addresses
  const recipients = Array.isArray(message.to) ? message.to : [message.to];
  for (const email of recipients) {
    if (!isValidEmail(email)) {
      throw new Error(`Invalid email address: ${email}`);
    }
  }
  
  // Validate CC emails if provided
  if (message.cc) {
    const ccRecipients = Array.isArray(message.cc) ? message.cc : [message.cc];
    for (const email of ccRecipients) {
      if (!isValidEmail(email)) {
        throw new Error(`Invalid CC email address: ${email}`);
      }
    }
  }

  try {
    // Use server-side endpoint that handles proper Replit authentication
    const response = await fetch('/api/send-email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: message.to,
        cc: message.cc,
        subject: message.subject,
        text: message.text,
        html: message.html,
        attachments: message.attachments,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to send email");
    }

    const result = await response.json();
    console.log('Email sent successfully:', result);
    return result;
    
  } catch (error) {
    console.error('Error sending email:', error);
    throw error;
  }
}

/**
 * Send a simple notification email to a user
 * @param {string} userEmail - Recipient email
 * @param {string} subject - Email subject
 * @param {string} message - Email message
 * @param {string} senderName - Name of the admin sender
 * @returns {Promise<Object>} Email send result
 */
export async function sendUserNotification(userEmail, subject, message, senderName = 'OpenBooks Administrator') {
  const emailContent = `Hello,

${message}

If you have any questions or need assistance, please don't hesitate to contact us.

Best regards,
${senderName}
OpenBooks System

---
This is an automated message from the OpenBooks user management system.`;

  return await sendEmail({
    to: userEmail,
    subject: `OpenBooks: ${subject}`,
    text: emailContent
  });
}

/**
 * Send a password reset notification email
 * @param {string} userEmail - Recipient email
 * @param {string} userName - User's name
 * @param {string} newPassword - New password (for display purposes only)
 * @param {string} adminName - Admin who reset the password
 * @returns {Promise<Object>} Email send result
 */
export async function sendPasswordResetEmail(userEmail, userName, newPassword, adminName) {
  const subject = 'Password Reset - OpenBooks System';
  const message = `Your password has been reset by ${adminName}.

Your new login credentials are:
Username: (your existing username)  
Password: ${newPassword}

For security reasons, please log in and change your password immediately.

Login at: ${window.location.origin}

Important: This password is temporary and should be changed upon your next login.`;

  return await sendUserNotification(userEmail, subject, message, adminName);
}

/**
 * Send account activation email
 * @param {string} userEmail - Recipient email
 * @param {string} userName - User's name
 * @param {string} username - Login username
 * @param {string} password - Initial password
 * @param {string} adminName - Admin who created the account
 * @returns {Promise<Object>} Email send result
 */
export async function sendAccountCreatedEmail(userEmail, userName, username, password, adminName) {
  const subject = 'Welcome to OpenBooks - Account Created';
  const message = `Welcome to OpenBooks, ${userName}!

Your account has been created by ${adminName}. Here are your login credentials:

Username: ${username}
Password: ${password}

Please log in at: ${window.location.origin}

For security reasons, you will be required to change your password on first login.

Welcome to the team!`;

  return await sendUserNotification(userEmail, subject, message, adminName);
}

/**
 * Send account suspension notification
 * @param {string} userEmail - Recipient email
 * @param {string} userName - User's name
 * @param {string} reason - Suspension reason
 * @param {Date} suspendedUntil - Suspension end date
 * @param {string} adminName - Admin who suspended the account
 * @returns {Promise<Object>} Email send result
 */
export async function sendSuspensionEmail(userEmail, userName, reason, suspendedUntil, adminName) {
  const subject = 'Account Suspended - OpenBooks System';
  const suspensionDate = suspendedUntil ? suspendedUntil.toLocaleDateString() : 'indefinitely';
  
  const message = `Dear ${userName},

Your OpenBooks account has been suspended by ${adminName}.

Reason: ${reason}
Suspended until: ${suspensionDate}

If you believe this is an error or have questions about your account status, please contact your system administrator.

OpenBooks Support Team`;

  return await sendUserNotification(userEmail, subject, message, adminName);
}