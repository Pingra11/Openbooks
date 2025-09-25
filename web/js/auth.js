import { auth, db } from "./firebaseConfig.js";
import { byId, setChip } from "./ui.js";
import {
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import {
  doc, getDoc, setDoc, addDoc, collection, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

function validPassword(pw) {
  return pw.length >= 8 && /^[A-Za-z]/.test(pw) && /[A-Za-z]/.test(pw) && /\d/.test(pw) && /[^A-Za-z0-9]/.test(pw);
}

const loginForm = byId("loginForm");
if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const username = byId("username").value.trim();
    const password = byId("password").value;
    try {
      const unameDoc = await getDoc(doc(db, "usernames", username));
      if (!unameDoc.exists()) throw new Error("Unknown username");
      const email = unameDoc.data().email;
      const cred = await signInWithEmailAndPassword(auth, email, password);
      await addDoc(collection(db, "logins"), { uid: cred.user.uid, username, success: true, ts: serverTimestamp() });
      const userDoc = await getDoc(doc(db, "users", cred.user.uid));
      const role = userDoc.data()?.role || "accountant";
      location.href = role === "administrator" ? "admin.html" : "app.html";
    } catch (err) {
      byId("loginError").textContent = err.message;
    }
  });
}

const forgotBtn = byId("forgotBtn");
if (forgotBtn) {
  forgotBtn.addEventListener("click", async () => {
    const email = prompt("Enter your email:");
    if (email) await sendPasswordResetEmail(auth, email);
    alert("If email exists, reset link sent.");
  });
}

const requestAccessBtn = byId("requestAccessBtn");
if (requestAccessBtn) {
  requestAccessBtn.addEventListener("click", async () => {
    const first = prompt("First name:");
    const last = prompt("Last name:");
    const email = prompt("Email:");
    const dob = prompt("Date of Birth:");
    await addDoc(collection(db, "requests"), { firstName:first, lastName:last, email, dob, status:"pending", createdAt: serverTimestamp() });
    alert("Request submitted.");
  });
}

onAuthStateChanged(auth, async (user) => {
  if (!user) return;
  const unameSnap = await getDoc(doc(db, "emails", user.email));
  const username = unameSnap.exists() ? unameSnap.data().username : user.email;
  const chip = document.getElementById("userChip") || document.getElementById("adminChip");
  if (chip) setChip(chip, { username });
  const signOutBtn = byId("signOut");
  signOutBtn?.addEventListener("click", () => signOut(auth));
});