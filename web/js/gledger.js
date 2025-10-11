import { addLedgerEntry, fetchLedgerEntries } from "./firebaseMethods.js";

const ledgerForm = document.getElementById("ledgerForm");
const ledgerMessage = document.getElementById("ledgerMessage");
const ledgerList = document.getElementById("ledgerList");
const ledgerTable = document.querySelector("#ledgerTable tbody");
const viewEntriesBtn = document.getElementById("viewEntriesBtn");

// Submit new ledger entry
ledgerForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const entryData = {
    date: document.getElementById("entryDate").value,
    account: document.getElementById("accountName").value,
    debit: parseFloat(document.getElementById("debitAmount").value) || 0,
    credit: parseFloat(document.getElementById("creditAmount").value) || 0,
    description: document.getElementById("description").value,
    timestamp: new Date().toISOString()
  };

  const result = await addLedgerEntry(entryData);
  ledgerMessage.textContent = result.message;
  ledgerMessage.className = result.success ? "success" : "error";

  if (result.success) ledgerForm.reset();
});

// View all ledger entries
viewEntriesBtn.addEventListener("click", async () => {
  const entries = await fetchLedgerEntries();
  ledgerTable.innerHTML = "";
  entries.forEach(entry => {
    const row = `<tr>
      <td>${entry.date}</td>
      <td>${entry.account}</td>
      <td>${entry.debit.toFixed(2)}</td>
      <td>${entry.credit.toFixed(2)}</td>
      <td>${entry.description || ""}</td>
    </tr>`;
    ledgerTable.insertAdjacentHTML("beforeend", row);
  });
  ledgerList.style.display = "block";
});
