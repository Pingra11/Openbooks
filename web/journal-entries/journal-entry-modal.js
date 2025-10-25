import {auth, db} from "../js/firebaseConfig.js";
import {collection, getDocs, addDoc} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import {getAuth, onAuthStateChanged} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";

export const JournalEntryModal = {
	container: null,
	isLoaded: false,

	async load() {
		if (!document.querySelector("link[href='./journal-entries/journal-entry-modal.css']")) {
			const css = document.createElement('link');
			css.rel = 'stylesheet';
			css.href = './journal-entries/journal-entry-modal.css';
			document.head.appendChild(css);
		}

		const res = await fetch('./journal-entries/journal-entry-modal.html');
		const html = await res.text();

		const wrapper = document.createElement('div');
		wrapper.innerHTML = html.trim();

		document.body.appendChild(wrapper.firstElementChild);

		this.overlay = document.querySelector('.jem-overlay');
		this.container = this.overlay.querySelector('.jem-container');

		this.container.querySelector('#jem-close')
			.addEventListener('click', () => this.close());
		this.container.querySelector('#jem-submit')
			.addEventListener('click', async () => {
				try {
					const result = await this.handleSubmit();
					if (result?.ok) {
						this.handleClear();
						alert('Entry submitted successfully.');
					}
				} catch (err) {
					console.error('Submission failed:', err);
					alert('Failed to submit entry.');
				}
			});
		this.container.querySelector('#jem-clear')
			.addEventListener('click', () => this.handleClear());


		this.overlay = document.querySelector('.jem-overlay');
		this.container = this.overlay.querySelector('.jem-container');

		console.log('Overlay found?', this.overlay);

		if (!this.overlay) {
			console.error('JEM overlay not found!');
			return;
		}
		if (!this.container) {
			console.warn('JEM container not found!');
		}

		this.container.style.display = 'none';

		const authInstance = getAuth();
		onAuthStateChanged(authInstance, (user) => {
			if (user) {
				this.currentUser = user;
				console.log("Logged in as", user.firstName, " ", user.lastName);
			} else {
				console.warn("No authenticated user");
				this.currentUser = null;
			}
		});

		console.log("JEM loaded.")
	},

	async serialize() {
		//serialize rows
		const res = await fetch('./journal-entries/jem-row.html')
		const html = (await res.text()).trim();

		const table = document.querySelector('#jem-destTable tbody')

		for (let i = 1; i <= 100; i++) {
			table.innerHTML += html;
		}

		//serialize selection options
		const selectors = document.querySelectorAll('.jem-destAccountField, .jem-field');
		const selectorArray = Array.from(selectors);

		const snapshot = await getDocs(collection(db, 'accounts'));

		snapshot.forEach(doc => {
			console.log(doc.id, doc.data());
		});

		const accounts = snapshot.docs.map(doc => ({
			id: doc.id,
			...doc.data(),
		}));

		selectorArray.forEach(selector => {
			selector.innerHTML = '';
			const nullOption = document.createElement('option')

			nullOption.value = '';
			nullOption.textContent = 'Choose an Account';

			selector.appendChild(nullOption)

			accounts.forEach(account => {
				const option = document.createElement('option');

				option.value = account.accountNumber;
				option.textContent = `${account.accountNumber} - ${account.accountName}`

				selector.appendChild(option);

			});
		})
	},

	open() {
		this.overlay.style.display = 'flex';
		this.overlay.style.opacity = 1;
		this.container.style.display = 'flex';
		this.container.style.opacity = 1;
	},

	close() {
		this.overlay.style.display = 'none';
		this.overlay.style.opacity = 0;
		this.container.style.display = 'none';
		this.container.style.opacity = 0;
	},

	async handleSubmit(e) {

		//source values
		const sourceDebit = parseFloat(document.getElementById('jem-sourceDebit')?.value || 0);
		const sourceCredit = parseFloat(document.getElementById('jem-sourceCredit')?.value || 0);
		const sourceAccount = document.getElementById('jem-sourceSelect')?.value || '';


		//dest targets
		const destTable = document.querySelector('#jem-destTable tbody');
		const destRows = Array.from(destTable.querySelectorAll('tr'));

		//dest values (row parity)
		const destAccounts = [];
		const destAmounts = [];

		//splitter; debit source or credit source
		if (sourceDebit > 0) {
			//target credits on dest
			destRows.forEach(row => {
				const cells = row.querySelectorAll('td');
				const accountCell = cells[0].querySelector('select')?.value || null;
				const creditCell = parseFloat(cells[2].querySelector('input')?.value);
				console.log(row.querySelector('.jem-destCreditField')?.value);
				console.log('select value:', cells[0].querySelector('select'));
				if (accountCell && creditCell) {
					destAccounts.push(accountCell);
					destAmounts.push(creditCell);
				}
			});

			const totalDest = destAmounts.reduce((sum, amount) => sum + amount, 0);

			if (totalDest <= 0) {
				alert('Right table must have atleast one valid transaction ');
				throw new Error('No destination transactions recorded.')
			}

			if (totalDest !== sourceDebit) {
				alert('Debits (Left Table) must equal Credits (Right Table)')
				throw new Error('Source account (debit) must equal destination accounts (credit)');
			}

		} else {
			//target debits on dest
			destRows.forEach(row => {
				const cells = row.querySelectorAll('td');
				const accountCell = cells[0].querySelector('select')?.value || '';
				const debitCell = parseFloat(cells[1].querySelector('input')?.value);

				if (accountCell && debitCell > 0) {
					destAccounts.push(accountCell);
					destAmounts.push(debitCell);
				}
			})

			const totalDest = destAmounts.reduce((sum, amount) => sum + amount, 0);

			if (totalDest <= 0) {
				alert('Right table must have atleast one valid transaction ');
				throw new Error('No destination transactions recorded.')
			}

			if (totalDest !== sourceCredit) {
				alert('Debits (Right Table) must equal Credits (Left Table).')
				throw new Error('Source account (credit) must equal destination accounts (debit).');
			}
		}

		const snapshot = await getDocs(collection(db, "journalEntries"));

		const entryNumber = snapshot.size + 1;
		const entryDate = new Date().toISOString().split('T')[0];
		const reference = crypto.randomUUID();

		const description = document.querySelector('#jem-description')?.value || '';


		if (!this.currentUser) {
			alert('Please login again.');
			throw new Error("user not authenticated.");
		}

		const createdBy = this.currentUser.uid;

		if (sourceDebit > 0) {
			for (const account of destAccounts) {
				const i = destAccounts.indexOf(account);
				const tx = {
					entryNumber: entryNumber,
					createdAt: entryDate,
					reference: reference,
					debit: sourceAccount,
					credit: account,
					amount: destAmounts[i],
					description: description,
					createdBy: createdBy,
				}

				console.log(tx); //replace with send

				try {
					await addDoc(collection(db, "journalEntries"), tx);

				} catch (e) {
					throw new Error('Failed to submit entry.')
				}
			}
		} else {
			for (const account of destAccounts) {
				const i = destAccounts.indexOf(account);
				const tx = {
					entryNumber: entryNumber,
					createdAt: entryDate,
					reference: reference,
					debit: account,
					credit: sourceAccount,
					amount: destAmounts[i],
					description: description,
					createdBy: createdBy
				}

				console.log(tx); //replace with send

				try {
					await addDoc(collection(db, "journalEntries"), tx);


				} catch (e) {
					throw new Error('Failed to submit entry.')
				}
			}
		}

		const event = {
			eventType: 'journal_entry',
			description: '',
			userId: createdBy,
			username: this.currentUser.uid,
			timestamp: entryDate,
			details: {
				entryNumber,
				status: 'pending',
				totalAmount: sourceDebit > 0 ? sourceDebit : sourceCredit
			}
		}
		await addDoc(collection(db, 'eventLogs'), event);

		return {ok: true};
	},

	handleClear() {
		const modal = document.querySelector('.jem-container');
		const selectors = modal.querySelectorAll('.jem-field, .jem-destAccountField');
		const inputs = modal.getElementsByTagName('input');
		const description = modal.querySelector('#jem-description');
		const fileDrop = modal.querySelector('#jem-fileDrop');

		for (let selector of selectors) selector.value = '';
		for (let input of inputs) input.value = '';

		description.value = '';
		fileDrop.value = 'Click or drag to add files.';
	},
};

document.addEventListener('DOMContentLoaded', async () => {
	await JournalEntryModal.load();
	await JournalEntryModal.serialize()

	const openBtn = document.getElementById('openJEM');
	if (openBtn) {
		openBtn.addEventListener('click', () => {
			JournalEntryModal.open();
		});
	}

	const closeBtn = document.getElementById('jem-close')
	if (closeBtn) {
		closeBtn.addEventListener('click', () => JournalEntryModal.close());
	}

	const submitBtn = document.getElementById('jem-submit')
	if (submitBtn) {
		submitBtn.addEventListener('click', async () => {
			try {
				const result = await JournalEntryModal.handleSubmit();
				if (result?.ok) {
					JournalEntryModal.handleClear();
					alert('Entry submitted successfully.');
				}
			} catch (err) {
				console.error('Submission failed:', err);
				alert('Failed to submit entry.');
			}
		});
	}

	const clearBtn = document.getElementById('jem-clear')
	if (clearBtn) {
		clearBtn.addEventListener('click', () => {
			JournalEntryModal.handleClear();
		});
	}
	console.log('JEM initialized.')
});