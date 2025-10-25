export const JEMValidation = {
	init() {
		this.wait();
	},

	wait() {
		const overlay = document.querySelector('.jem-overlay');
		if (!overlay) return setTimeout(() => this.wait(), 250);
		this.loadValidation();
	},

	loadValidation() {

		document.body.addEventListener('input', e => {
			if (
				e.target.matches(
					'#jem-sourceSelect, #jem-sourceDebit, #jem-sourceCredit, .jem-destAccountField, .jem-destDebitField, .jem-destCreditField'
				)
			) {
				this.validate();
			}
		});

		document.body.addEventListener('change', e => {
			if (
				e.target.matches(
					'#jem-sourceSelect, #jem-sourceDebit, #jem-sourceCredit, .jem-destAccountField, .jem-destDebitField, .jem-destCreditField'
				)
			) {
				this.validate();
			}
		});

		const submit = document.querySelector('#jem-submit');
		submit?.addEventListener('click', e => {
			if (!this.validate()) {
				e.preventDefault();
				e.stopImmediatePropagation();
			}
		});
	},

	validate() {
		const $ = s => document.querySelector(s);
		const $$ = s => Array.from(document.querySelectorAll(s));

		const sourceAccount = $('#jem-sourceSelect');
		const sourceDebit = $('#jem-sourceDebit');
		const sourceCredit = $('#jem-sourceCredit');
		const destRows = $$('#jem-destTable tbody tr');
		const errorMessage = $('#jem-errorMessage');

		const highlight = (...elements) => elements.forEach(element => element && element.classList.add('jem-error'));
		const clear = () => $$('.jem-error').forEach(element => element.classList.remove('jem-error'));
		clear();

		const num = val => (isFinite(parseFloat(val)) ? parseFloat(val) : 0);
		const sourceDebitValue = num(sourceDebit?.value);
		const sourceCreditValue = num(sourceCredit?.value);

		let error = null;

		if (!error && sourceAccount?.value && !(sourceDebitValue || sourceCreditValue)) {
			highlight(sourceDebit, sourceCredit);
			error = 'Source needs debit or credit.';
		}
		if (!error && !sourceAccount?.value && (sourceDebitValue || sourceCreditValue)) {
			highlight(sourceAccount);
			error = 'Missing source account.';
		}
		if (!error && sourceDebitValue && sourceCreditValue) {
			highlight(sourceDebit, sourceCredit);
			error = 'Source cannot have both debit and credit.';
		}

		const seen = new Set();
		let hasAnyDest = false;

		for (let i = 0; i < destRows.length; i++) {
			const row = destRows[i];
			const accountSelect = row.querySelector('.jem-destAccountField');
			const debitField = row.querySelector('.jem-destDebitField');
			const creditField = row.querySelector('.jem-destCreditField');
			const accountValue = accountSelect?.value || '';
			const debitValue = num(debitField?.value);
			const creditValue = num(creditField?.value);

			if (accountValue && !(debitValue || creditValue)) {
				highlight(debitField, creditField);
				error = `Row ${i + 1}: need debit or credit.`;
				break;
			}
			if (!accountValue && (debitValue || creditValue)) {
				highlight(accountSelect);
				error = `Row ${i + 1}: missing account.`;
				break;
			}
			if (accountValue && seen.has(accountValue)) {
				highlight(accountSelect);
				error = `Row ${i + 1}: duplicate account.`;
				break;
			}
			if (accountValue && (debitValue || creditValue)) hasAnyDest = true;
			if (accountValue) seen.add(accountValue);
		}

		const srcHasValue = sourceDebitValue > 0 || sourceCreditValue > 0;

		if (!error && srcHasValue && !hasAnyDest) {
			const first = destRows[0];
			if (first) {
				const acc = first.querySelector('.jem-destAccountField');
				const deb = first.querySelector('.jem-destDebitField');
				const cre = first.querySelector('.jem-destCreditField');
				if (sourceDebitValue > 0) highlight(acc, cre);
				else if (sourceCreditValue > 0) highlight(acc, deb);
			}
			error = 'Incomplete transaction: missing destination.';
		}

		if (!error && sourceDebitValue > 0 && destRows.some(r => num(r.querySelector('.jem-destDebitField')?.value) > 0))
			error = 'Source and destination must have opposite debit/credit.';
		if (!error && sourceCreditValue > 0 && destRows.some(r => num(r.querySelector('.jem-destCreditField')?.value) > 0))
			error = 'Source and destination must have opposite debit/credit.';

		if (error) {
			errorMessage.style.display = 'flex';
			errorMessage.textContent = error;
			return false;
		}
		errorMessage.style.display = 'none';
		errorMessage.textContent = '';
		return true;
	}
};

document.addEventListener('DOMContentLoaded', () => JEMValidation.init());
