import { auth, db } from "./firebaseConfig.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import { collection, getDocs, doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

async function loadRequests() {
  const snap = await getDocs(collection(db, "requests"));
  const tbody = document.querySelector("#requestsTable tbody");
  tbody.innerHTML = "";
  snap.forEach(d => {
    const r = d.data();
    if (r.status === "pending") {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${r.firstName} ${r.lastName}</td><td>${r.email}</td><td>${r.dob}</td>
      <td><button onclick="approve('${d.id}')">Approve</button></td>`;
      tbody.appendChild(tr);
    }
  });
}
window.approve = async (id) => {
  await updateDoc(doc(db,"requests",id), { status:"approved" });
  alert("Approved. Add user in Firebase Console and assign role in Firestore.");
  await loadRequests();
};

async function loadUsers() {
  const snap = await getDocs(collection(db, "users"));
  const tbody = document.querySelector("#usersTable tbody");
  tbody.innerHTML = "";
  snap.forEach(d => {
    const u = d.data();
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${u.username}</td><td>${u.email}</td><td>${u.role}</td><td>${u.active?"Active":"Inactive"}</td>`;
    tbody.appendChild(tr);
  });
}

onAuthStateChanged(auth, (user)=>{ if (user) { loadRequests(); loadUsers(); } });