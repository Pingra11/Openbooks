/**
 * Email Integration for OpenBooks Admin System
 * Simulated email sending - logs emails but doesn't require external service
 */

function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Send email (simulated - logs to console and server)
 * @param {Object} message - Email message object
 * @param {string|string[]} message.to - Recipient email address(es)
 * @param {string|string[]} message.cc - CC recipient email address(es) (optional)
 * @param {string} message.subject - Email subject
 * @param {string} message.text - Plain text body (optional)
 * @param {string} message.html - HTML body (optional)
 * @returns {Promise<Object>} Email send result
 */
export async function sendEmail(message) {
  if (!message.to) {
    throw new Error('Recipient email address is required');
  }
  
  if (!message.subject) {
    throw new Error('Email subject is required');
  }
  
  if (!message.text && !message.html) {
    throw new Error('Email must have either text or HTML content');
  }
  
  const recipients = Array.isArray(message.to) ? message.to : [message.to];
  for (const email of recipients) {
    if (!isValidEmail(email)) {
      throw new Error(`Invalid email address: ${email}`);
    }
  }
  
  if (message.cc) {
    const ccRecipients = Array.isArray(message.cc) ? message.cc : [message.cc];
    for (const email of ccRecipients) {
      if (!isValidEmail(email)) {
        throw new Error(`Invalid CC email address: ${email}`);
      }
    }
  }

  try {
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
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to send email");
    }

    const result = await response.json();
    console.log('Email logged successfully:', result);
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
OpenBooks System`;

  return sendEmail({
    to: userEmail,
    subject: subject,
    text: emailContent
  });
}

/**
 * Send password reset notification
 * @param {string} userEmail - User's email
 * @param {string} tempPassword - Temporary password
 * @returns {Promise<Object>} Email send result
 */
export async function sendPasswordResetEmail(userEmail, tempPassword) {
  const subject = 'OpenBooks - Password Reset';
  const message = `Your password has been reset by an administrator.

Your temporary password is: ${tempPassword}

Please log in and change your password immediately for security purposes.`;

  return sendUserNotification(userEmail, subject, message, 'OpenBooks Security');
}

/**
 * Send account status notification
 * @param {string} userEmail - User's email
 * @param {string} status - New account status (activated, suspended, etc.)
 * @param {string} reason - Reason for status change (optional)
 * @returns {Promise<Object>} Email send result
 */
export async function sendAccountStatusEmail(userEmail, status, reason = '') {
  const subject = `OpenBooks - Account ${status.charAt(0).toUpperCase() + status.slice(1)}`;
  let message = `Your OpenBooks account has been ${status}.`;
  
  if (reason) {
    message += `\n\nReason: ${reason}`;
  }
  
  if (status === 'suspended') {
    message += '\n\nIf you believe this is an error, please contact your administrator.';
  }

  return sendUserNotification(userEmail, subject, message);
}

/**
 * Send journal entry approval notification to managers
 * @param {Array<string>} managerEmails - Array of manager email addresses
 * @param {Object} entryDetails - Journal entry details
 * @returns {Promise<Object>} Email send result
 */
export async function sendJournalApprovalNotification(managerEmails, entryDetails) {
  const subject = `OpenBooks - Journal Entry Pending Approval: ${entryDetails.entryNumber}`;
  
  const message = `A new journal entry requires your approval.

Entry Number: ${entryDetails.entryNumber}
Submitted By: ${entryDetails.submittedBy}
Date: ${entryDetails.date}
Description: ${entryDetails.description}
Total Amount: ${entryDetails.totalAmount}

Please log in to OpenBooks to review and approve or reject this entry.`;

  return sendEmail({
    to: managerEmails,
    subject: subject,
    text: message
  });
}

/**
 * Send account created notification
 * @param {string} userEmail - New user's email
 * @param {string} username - New user's username
 * @param {string} tempPassword - Temporary password
 * @returns {Promise<Object>} Email send result
 */
export async function sendAccountCreatedEmail(userEmail, username, tempPassword) {
  const subject = 'OpenBooks - Your Account Has Been Created';
  const message = `Welcome to OpenBooks!

Your account has been created with the following details:

Username: ${username}
Temporary Password: ${tempPassword}

Please log in and change your password immediately for security purposes.

If you did not request this account, please contact your administrator.`;

  return sendUserNotification(userEmail, subject, message, 'OpenBooks Administrator');
}

export default {
  sendEmail,
  sendUserNotification,
  sendPasswordResetEmail,
  sendAccountStatusEmail,
  sendAccountCreatedEmail,
  sendJournalApprovalNotification
};
