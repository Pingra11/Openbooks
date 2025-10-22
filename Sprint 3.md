# Sprint 3
---

## Administrator
---

- ~~CRUD Accounts (implemented in Sprint 2).~~
- ~~View event logs for each account in the chart of accounts.~~
	- ~~Event logs must show the before and after image of each account.~~
	- ~~If an account is added for the first time, there will be no before image.~~
	- ~~If an account name is modified, there must be a before and after account image~~
		- ~~including the user id of the person who made the change and the time and date of the change~~
- ~~Be able to send email to manager or accountant user from the chart of accounts page.~~

## **Manager**

- Journal Entry Management
	- Create journal entries for Chart of Accounts (CoA) accounts
	- Approve or reject journal entries prepared by accountants
	- Once approved, the entry is reflected in the ledger for the account

- Journal Entry Review
	- View all journal entries submitted for approval with pending status
	- View all approved journal entries
	- View all rejected journal entries
	- Filter journal entries by:
		- status (pending, approved, rejected)
		- date
	- Search journal entries by:
		- account
		- name
		- amount
		- date

- Event Log Management
	- View event logs for each account in the chart of accounts
	- Each event log shows before and after of account data
	- When an account is added for the first time, there is no before image
	- When an account name is modified, display:
		- before and after account images
		- user ID of person who made the change
		- date and time of the change

- Ledger Access and Navigation
	- Click an account name to open its ledger page
	- From the ledger page, click the post reference (PR) to open the journal entry that created the account

- Ledger Page Requirements
	- Display the following columns:
		- date of the journal entry
		- description (usually empty)
		- debit
		- credit
		- balance
	- Balance after each transaction and posting must be accurate
	- Include filtering and search functions
		- filtering by date or date range
		- searching by account name or amount

## Accountant user:

### Journal Entry Management

Creation of Journal Entries

- Can create journal entries using only accounts found in the chart of accounts
- Debits come before credits in each journal entry
- Supports multiple debits and multiple credits per journal entry
- Allows attaching source documents (PDF, DOC/DOCX, XLSX/XLS, CSV, JPG, PNG)
- Can cancel or reset a journal entry before submission
- Once submitted, journal entries cannot be deleted by accountants

### Preparation and Submission

- Accountants can prepare and submit journal entries
- Can view journal entries created by managers or other accountants
- Can view journal entry status: pending, approved, or rejected
- Can filter journal entries by status and date
- Can search journal entries by account name, amount, or date

### Validation and Error Handling

- Total debits must equal total credits before submission
- Transactions with errors cannot be submitted
- Error messages:
	- Housed in a database table
	- Displayed in red color
	- Disappear automatically once the root cause is fixed
- error conditions:
	- Debit ≠ Credit
	- Missing account from chart of accounts
	- Missing or invalid attachment type
	- Empty debit or credit amount
	- Invalid date format
	- Unauthorized user action

### Notifications

- Manager receives a notification when a journal entry is submitted for approval

### 2. Chart of Accounts

#### 2.1 Viewing and Navigation

- Clicking an account name leads to its ledger page

#### 2.2 Event Logs

- View event logs for each account
	- Show before and after image of account changes
	- No before image for newly added accounts
	- For modifications: show before and after states, user ID, date, and time

### 3. Ledger Management

#### 3.1 Ledger Page Structure

- Shows all entries for the selected account
- Columns:
	- Date of journal entry
	- Description (usually empty)
	- Debit
	- Credit
	- Balance (accurate after each transaction)

#### 3.2 Navigation

- Clicking a post reference (PR) leads to the originating journal entry

#### 3.3 Filtering and Search

- Filter ledger entries by date or date range
- Search by account name or amount

### 4. Communication

#### 4.1 Messaging Function

- Ability to send email to the manager or administrator from the CoA page