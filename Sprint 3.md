# Sprint 3

Chart of Accounts
---

- `Send Email` Button
- `Create Journal Entry` Button
- `View Journal Button`

Roles

- Admin
	- ~~CRUD accounts~~
	- Email button can send emails to other roles.
- Manager
	- Email button can send emails to other roles.
- Accountant
	- Email button can send emails to other roles.

## Journal Entries

Component for journal entries to be created and submitted

- debits displayed before credits (?)
- Support multiple debit/credit per journal entry
- Suport attaching source documents:
	- `PDF`
	- `DOC/DOCX`
	- `XLSX/XLS`
	- `CSV`
	- `JPG`
	- `PNG`
- Entries can be cancelled or reset before submission
- Total debits must equal total credits before submission
- Transactions with errors cannot be submitted
- Error conditions:
	- Debit ≠ Credit
	- Missing account from chart of accounts
	- Missing or invalid attachment type
	- Empty debit or credit amount
	- Invalid date format

Roles

- Admin
- Manager
	- Create Journal Entries for CoA Accounts
- Accountant
	- Create Journal Entries for CoA Accounts
	- Cannot delete submitted journal entries

## Ledger View

_Component that displays a given account's ledger_

- Opened by clicking on the account in the CoA
- Shows all entries for the selected account
- `Post Reference` button that displays the journal entry that created the account
- Displays columns:
	- `date` of creation
	- `description` (usually empty)
	- `debit`
	- `credit`
	- `balance`
- Balance after each transaction and posting must be accurate
- Include filtering and search functions
	- filtering by date or date range
	- searching by account name or amount

Roles

- Admin
- Manager
- Accountant

## General Requirements

- Error messages
	- Displayed in red
	- Dissapear once resolved automatically

- Notifications
	- Manager receives a notification when a journal entry is submitted for approval

## Journal View

_Component that displays journal entries_

- Display all journal entries as one of:
	- `Approved`
	- `Pending`
	- `Rejected`
- Filter results by:
	- `Status`
	- `Date`
- Search results by:
	- `Account`
	- `Name`
	- `Amount`
	- `Date`

Roles

- Shared
- Accountant
	- Read privileges
- Manager
	- Read privileges
	- Approve/Deny options for each journal entry
		- Deny requires reason
		- Approve updates ledgers

## Event Log

- Log all updates to accounts
	- Account Creation
	- Account Modification
	- Journal Entry Submissions
	- Journal Entry Approvals
	- Journal Entry Denials
	- Ledger Postings
- Clickable event log entries (details modal)
	- Show before/after of the data from the event
	- Show `userID`, `date`, and `time` of event
	- Account creation shows no "before" data

Roles

- Admin
	- ~~View event logs for each account in CoA~~
- Manager
	- View event logs for each account in CoA
- Accountant

## Flow (reference)

1. Accountant writes journal entry
2. Journal entry sent to journal
3. manager opens journal
4. approves/denies journal entry
5. entry posts to the respective ledgers
6. Ledgers display updated info for Accountants