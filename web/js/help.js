/**
 * Help Modal System
 * Displays topic-organized help documentation
 */

// Show help modal
window.showHelp = function() {
  const modal = document.getElementById('helpModal');
  if (modal) {
    modal.style.display = 'flex';
    setTimeout(() => modal.classList.add('show'), 10);
  }
};

// Close help modal
window.closeHelp = function() {
  const modal = document.getElementById('helpModal');
  if (modal) {
    modal.classList.remove('show');
    setTimeout(() => modal.style.display = 'none', 300);
  }
};

// Close on outside click
window.addEventListener('click', function(event) {
  const modal = document.getElementById('helpModal');
  if (event.target === modal) {
    closeHelp();
  }
});

// Navigate to help topic
window.showHelpTopic = function(topicId) {
  const topic = document.getElementById(topicId);
  if (topic) {
    topic.scrollIntoView({ behavior: 'smooth', block: 'start' });
    
    // Update active link
    document.querySelectorAll('.help-nav a').forEach(a => a.classList.remove('active'));
    document.querySelector(`.help-nav a[onclick*="${topicId}"]`)?.classList.add('active');
  }
};

// Initialize help modal HTML
function initHelpModal() {
  const helpModalHTML = `
    <div id="helpModal" class="modal help-modal">
      <div class="modal-content help-modal-content">
        <div class="help-modal-header">
          <h2>OpenBooks Help</h2>
          <button onclick="closeHelp()" class="close-btn" title="Close Help">&times;</button>
        </div>
        
        <div class="help-modal-body">
          <aside class="help-nav">
            <h3>Topics</h3>
            <ul>
              <li><a onclick="showHelpTopic('help-getting-started')">Getting Started</a></li>
              <li><a onclick="showHelpTopic('help-user-management')">User Management</a></li>
              <li><a onclick="showHelpTopic('help-chart-of-accounts')">Chart of Accounts</a></li>
              <li><a onclick="showHelpTopic('help-account-types')">Account Types & Numbers</a></li>
              <li><a onclick="showHelpTopic('help-journal-entries')">Journal Entries</a></li>
              <li><a onclick="showHelpTopic('help-reports')">Financial Reports</a></li>
              <li><a onclick="showHelpTopic('help-security')">Security Features</a></li>
              <li><a onclick="showHelpTopic('help-event-logs')">Event Logs & Audit Trail</a></li>
              <li><a onclick="showHelpTopic('help-troubleshooting')">Troubleshooting</a></li>
              <li><a onclick="showHelpTopic('help-faqs')">FAQs</a></li>
            </ul>
          </aside>
          
          <main class="help-content-area">
            <!-- Getting Started -->
            <section id="help-getting-started" class="help-topic">
              <h2>📚 Getting Started with OpenBooks</h2>
              <p>Welcome to OpenBooks, a comprehensive accounting and user management system designed for small to medium businesses.</p>
              
              <h3>System Overview</h3>
              <p>OpenBooks provides:</p>
              <ul>
                <li>Complete user management system with role-based access control</li>
                <li>Chart of Accounts for organizing financial data</li>
                <li>Journal entry system for recording transactions</li>
                <li>Account ledgers for tracking transactions</li>
                <li>Financial reports (Trial Balance, Balance Sheet, Income Statement, Retained Earnings)</li>
                <li>Comprehensive event logging for audit trails</li>
                <li>Secure authentication with password history tracking</li>
              </ul>

              <h3>User Roles</h3>
              <ul>
                <li><strong>Administrator:</strong> Full system access - can manage users, accounts, and all financial data</li>
                <li><strong>Manager:</strong> Can view accounts, create journal entries, and view reports</li>
                <li><strong>Accountant:</strong> Can view accounts, create journal entries, and view reports (limited permissions)</li>
              </ul>
            </section>

            <!-- User Management -->
            <section id="help-user-management" class="help-topic">
              <h2>👥 User Management</h2>
              
              <h3>Creating New Users (Administrator Only)</h3>
              <ol>
                <li>Navigate to the Admin Dashboard</li>
                <li>Click "Create New User" button</li>
                <li>Fill in required information: First Name, Last Name, Email, Role, Phone, Date of Birth, Address</li>
                <li>System generates a secure username and password</li>
                <li>Save the credentials and provide them to the new user</li>
              </ol>

              <div class="help-note">
                <strong>Note:</strong> Users must change their password on first login and set up security questions for account recovery.
              </div>

              <h3>Password Management</h3>
              <p>OpenBooks includes robust password security:</p>
              <ul>
                <li>Minimum 8 characters</li>
                <li>Must start with a letter</li>
                <li>Requires numbers and special characters</li>
                <li>Cannot reuse last 12 passwords</li>
                <li>Passwords expire after 90 days</li>
              </ul>
            </section>

            <!-- Chart of Accounts -->
            <section id="help-chart-of-accounts" class="help-topic">
              <h2>📊 Chart of Accounts</h2>
              
              <h3>Overview</h3>
              <p>The Chart of Accounts is the foundation of your accounting system. It organizes all financial accounts into categories for easy tracking and reporting.</p>

              <h3>Adding a New Account (Administrator Only)</h3>
              <ol>
                <li>Navigate to Chart of Accounts</li>
                <li>Click "Add Account" button</li>
                <li>Enter all 15 required fields:
                  <ul>
                    <li>Account Name (must be unique)</li>
                    <li>Account Number (must be within valid range for category)</li>
                    <li>Category (Assets, Liabilities, Equity, Revenue, Expenses)</li>
                    <li>Subcategory, Description, Initial Balance</li>
                    <li>Statement type (BS, IS, or RE)</li>
                    <li>Display Order, Normal Side</li>
                  </ul>
                </li>
                <li>Click "Save Account"</li>
              </ol>

              <div class="help-warning">
                <strong>Important:</strong> Account numbers must be numeric only. Duplicate account names or numbers are not allowed.
              </div>

              <h3>Searching and Filtering</h3>
              <p>Use the filter controls to find accounts by name, number, category, subcategory, or balance range.</p>

              <h3>Viewing Account Ledgers</h3>
              <p>Click any account in the Chart of Accounts to view its detailed ledger showing all transactions.</p>

              <h3>Deactivating Accounts</h3>
              <p>Administrators can deactivate accounts, but only if the account balance is zero.</p>
            </section>

            <!-- Account Types -->
            <section id="help-account-types" class="help-topic">
              <h2>🔢 Account Types & Number Ranges</h2>
              
              <p>OpenBooks uses a standardized account numbering system:</p>

              <h3>Assets (1000-1999)</h3>
              <ul>
                <li>Normal Side: Debit</li>
                <li>Subcategories: Current Assets, Fixed Assets, Other Assets</li>
                <li>Examples: Cash (1000), Accounts Receivable (1100), Equipment (1500)</li>
              </ul>

              <h3>Liabilities (2000-2999)</h3>
              <ul>
                <li>Normal Side: Credit</li>
                <li>Subcategories: Current Liabilities, Long-term Liabilities</li>
                <li>Examples: Accounts Payable (2000), Notes Payable (2100)</li>
              </ul>

              <h3>Equity (3000-3999)</h3>
              <ul>
                <li>Normal Side: Credit</li>
                <li>Subcategories: Owner's Equity, Retained Earnings</li>
                <li>Examples: Capital (3000), Retained Earnings (3100)</li>
              </ul>

              <h3>Revenue (4000-4999)</h3>
              <ul>
                <li>Normal Side: Credit</li>
                <li>Subcategories: Operating Revenue, Other Revenue</li>
                <li>Examples: Sales Revenue (4000), Service Revenue (4100)</li>
              </ul>

              <h3>Expenses (5000-5999)</h3>
              <ul>
                <li>Normal Side: Debit</li>
                <li>Subcategories: Operating Expenses, Other Expenses</li>
                <li>Examples: Salaries Expense (5000), Rent Expense (5100)</li>
              </ul>
            </section>

            <!-- Journal Entries -->
            <section id="help-journal-entries" class="help-topic">
              <h2>📝 Journal Entries</h2>
              <p>Journal entries record financial transactions in the accounting system.</p>
              
              <h3>Creating a Journal Entry</h3>
              <ol>
                <li>Navigate to Journal Entries page</li>
                <li>Click "New Entry" button</li>
                <li>Enter entry date and description</li>
                <li>Add line items (debits and credits)</li>
                <li>Ensure debits equal credits</li>
                <li>Save as Draft or Post immediately</li>
              </ol>

              <h3>Recording Transactions</h3>
              <p>When recording journal entries:</p>
              <ul>
                <li>Every entry must have equal debits and credits</li>
                <li>Include a clear description</li>
                <li>Reference supporting documentation</li>
                <li>Date accurately</li>
              </ul>

              <h3>Posting Entries</h3>
              <p>Posting a journal entry updates all affected account balances and creates ledger transactions.</p>
            </section>

            <!-- Reports -->
            <section id="help-reports" class="help-topic">
              <h2>📈 Financial Reports</h2>
              <p>Generate comprehensive financial reports to analyze business performance:</p>
              
              <h3>Trial Balance</h3>
              <p>Verifies that total debits equal total credits across all accounts. Shows all accounts with their debit and credit balances.</p>

              <h3>Balance Sheet</h3>
              <p>Shows the financial position of the business at a specific date. Includes Assets, Liabilities, and Equity.</p>

              <h3>Income Statement</h3>
              <p>Shows revenues and expenses for a period, calculating net income or loss.</p>

              <h3>Retained Earnings Statement</h3>
              <p>Shows changes in retained earnings over time.</p>

              <h3>Date Filtering</h3>
              <p>All reports can be filtered by date using the "As of Date" selector.</p>
            </section>

            <!-- Security -->
            <section id="help-security" class="help-topic">
              <h2>🔒 Security Features</h2>
              
              <h3>Authentication</h3>
              <p>OpenBooks uses Firebase Authentication for secure user login with:</p>
              <ul>
                <li>Encrypted password storage</li>
                <li>Session management</li>
                <li>Account suspension after 3 failed login attempts</li>
              </ul>

              <h3>Security Questions</h3>
              <p>All users must set up security questions for password recovery. Questions and answers are securely hashed.</p>

              <h3>Password Recovery</h3>
              <ol>
                <li>Click "Forgot Password" on login page</li>
                <li>Enter email and User ID</li>
                <li>Answer security questions</li>
                <li>Receive password reset email</li>
                <li>Set new password (cannot reuse previous 12 passwords)</li>
              </ol>
            </section>

            <!-- Event Logs -->
            <section id="help-event-logs" class="help-topic">
              <h2>📋 Event Logs & Audit Trail</h2>
              
              <p>OpenBooks maintains a comprehensive audit trail of all system changes:</p>

              <h3>What is Logged</h3>
              <ul>
                <li>Account additions, modifications, and deactivations</li>
                <li>User creation and editing</li>
                <li>Login attempts and password changes</li>
                <li>Journal entry creation and posting</li>
                <li>All administrative actions</li>
              </ul>

              <h3>Event Log Information</h3>
              <p>Each event log entry includes:</p>
              <ul>
                <li>Unique event ID</li>
                <li>Event type and description</li>
                <li>Before and after images of changed data</li>
                <li>User ID and username of person making change</li>
                <li>Date and time stamp</li>
              </ul>

              <div class="help-note">
                <strong>Compliance:</strong> Event logs support regulatory compliance and internal auditing requirements.
              </div>
            </section>

            <!-- Troubleshooting -->
            <section id="help-troubleshooting" class="help-topic">
              <h2>🔧 Troubleshooting</h2>
              
              <h3>Cannot Login</h3>
              <ul>
                <li>Verify username and password are correct</li>
                <li>Check if account is suspended (contact administrator)</li>
                <li>Use "Forgot Password" if you don't remember password</li>
              </ul>

              <h3>Cannot Add Account</h3>
              <ul>
                <li>Verify account number is in correct range for category</li>
                <li>Ensure account number and name are unique</li>
                <li>Check that you're logged in as Administrator</li>
              </ul>

              <h3>Cannot Deactivate Account</h3>
              <ul>
                <li>Account balance must be zero before deactivation</li>
                <li>Post journal entries to bring balance to zero first</li>
              </ul>

              <h3>Journal Entry Won't Balance</h3>
              <ul>
                <li>Verify total debits equal total credits</li>
                <li>Check for decimal point errors in amounts</li>
                <li>Ensure all line items have an account selected</li>
              </ul>
            </section>

            <!-- FAQs -->
            <section id="help-faqs" class="help-topic">
              <h2>❓ Frequently Asked Questions</h2>
              
              <h3>Q: How often should I change my password?</h3>
              <p>A: Passwords automatically expire after 90 days. The system will prompt you to change it.</p>

              <h3>Q: Can I use the same password again?</h3>
              <p>A: No, the system prevents reuse of your last 12 passwords for security.</p>

              <h3>Q: What happens if I forget my security question answers?</h3>
              <p>A: Contact your system administrator who can manually reset your password.</p>

              <h3>Q: Why can't I see the "Add Account" button?</h3>
              <p>A: Only Administrators can add, edit, or deactivate accounts. Managers and Accountants have view-only access.</p>

              <h3>Q: How do I know which account number to use?</h3>
              <p>A: Use the Account Types section of this help guide. Each category has a specific number range (e.g., Assets are 1000-1999).</p>

              <h3>Q: Can I delete an account?</h3>
              <p>A: No, accounts cannot be deleted. You can only deactivate them if the balance is zero. This maintains data integrity.</p>

              <h3>Q: How do I view transactions for a specific account?</h3>
              <p>A: Click the account in the Chart of Accounts, or use the Account Ledger page and select the account from the dropdown.</p>
            </section>
          </main>
        </div>
      </div>
    </div>
  `;
  
  // Add modal to body if it doesn't exist
  if (!document.getElementById('helpModal')) {
    document.body.insertAdjacentHTML('beforeend', helpModalHTML);
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initHelpModal);
} else {
  initHelpModal();
}
