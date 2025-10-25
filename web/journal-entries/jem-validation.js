export function JemValidationInit(root = document) {
	const container = root.querySelector('#jem-container');
	const inputs = container.querySelectorAll(
		'#jem-sourceDebit, #jem-sourceCredit, .jem-destDebitField, .jem-destCreditField');
	const selectors = container.querySelectorAll(
		'#jem-sourceSelect, .jem-destAccountField');
	const reference = container.querySelector('#jem-reference');

	const errorMessage = container.querySelector('#jem-errorMessage');

	inputs.forEach(input => {
		input.addEventListener('input', (event) => {

		});
	})
}