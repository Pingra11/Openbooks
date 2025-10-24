import {db} from "../js/firebaseConfig.js";
import {
	collection, getDocs, doc, getDoc, addDoc, updateDoc, setDoc,
	query, where, orderBy, serverTimestamp, deleteDoc, runTransaction, deleteField
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";


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

		console.log('Overlay found?', this.overlay);

		if (!this.overlay) {
			console.error('JEM overlay not found!');
			return;
		}
		if (!this.container) {
			console.warn('JEM container not found!');
		}

		this.container.style.display = 'none';

		this.container.querySelector('#jem-close')
			.addEventListener('click', () => this.close());
		this.container.querySelector('#jem-submit')
			.addEventListener('click', () => this.handleSubmit());
		this.container.querySelector('#jem-clear')
			.addEventListener('click', () => this.handleClear());

		console.log("JEM loaded.")
	},

	async serialize() {
		const debitContainer = document.getElementById('jem-debitSelect');
		const creditContainer = document.getElementById('jem-creditSelect');

		const snapshot = await getDocs(collection(db, 'accounts'));
		snapshot.forEach(doc => {
			console.log(doc.id, doc.data());
		});

		const accounts = snapshot.docs.map(doc => ({
			id: doc.id,
			...doc.data(),
		}));

		accounts.forEach(account => {
			const optionDebit = document.createElement('option');
			const optionCredit = document.createElement('option');

			const label = `${account.accountNumber} - ${account.accountName}`;

			optionDebit.value = account.accountNumber;
			optionDebit.textContent = label;

			optionCredit.value = account.id;
			optionCredit.textContent = label;

			debitContainer.appendChild(optionDebit);
			creditContainer.appendChild(optionCredit);
		});

		// TODO: serialize rows in tchart
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

	handleSubmit() {

	},

	handleClear() {

	},

};

document.addEventListener('DOMContentLoaded', () => {
	JournalEntryModal.load();

	const openBtn = document.getElementById('openJEM');
	if (openBtn) {
		openBtn.addEventListener('click', () => {
			JournalEntryModal.open();
			JournalEntryModal.serialize()
		});
	}

	const closeBtn = document.getElementById('jem-close')
	if (closeBtn) {
		closeBtn.addEventListener('click', () => JournalEntryModal.close());
	}
	console.log('JEM initialized.')
});