import { auth, db } from "./firebaseConfig.js";
import { byId, setChip } from "./ui.js";
import {
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import {
  doc, getDoc, setDoc, addDoc, collection, serverTimestamp, updateDoc, query, where, getDocs
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

// Enhanced password validation per requirements
function validPassword(pw) {
  const errors = [];
  
  if (pw.length < 8) errors.push("Password must be at least 8 characters long");
  if (!/^[A-Za-z]/.test(pw)) errors.push("Password must start with a letter");
  if (!/[A-Za-z]/.test(pw)) errors.push("Password must contain at least one letter");
  if (!/\d/.test(pw)) errors.push("Password must contain at least one number");
  if (!/[^A-Za-z0-9]/.test(pw)) errors.push("Password must contain at least one special character");
  
  return { valid: errors.length === 0, errors };
}

// Check if user account is active and not suspended
async function checkUserStatus(uid) {
  try {
    const userDoc = await getDoc(doc(db, "users", uid));
    if (!userDoc.exists()) return { valid: false, message: "User account not found" };
    
    const userData = userDoc.data();
    
    if (!userData.active) {
      return { valid: false, message: "Account is deactivated. Contact administrator." };
    }
    
    if (userData.suspended) {
      const suspendedUntil = userData.suspendedUntil?.toDate();
      if (suspendedUntil && suspendedUntil > new Date()) {
        return { valid: false, message: `Account suspended until ${suspendedUntil.toLocaleDateString()}` };
      }
      // Clear suspension if expired
      if (suspendedUntil && suspendedUntil <= new Date()) {
        await updateDoc(doc(db, "users", uid), {
          suspended: false,
          suspendedUntil: null,
          loginAttempts: 0
        });
      }
    }
    
    return { valid: true, userData };
  } catch (error) {
    console.error("Error checking user status:", error);
    return { valid: false, message: "Error checking account status" };
  }
}

// Track login attempts and suspend after 3 failures
async function handleLoginAttempt(uid, success, username) {
  try {
    const userRef = doc(db, "users", uid);
    const userDoc = await getDoc(userRef);
    
    if (success) {
      // Reset login attempts on successful login
      await updateDoc(userRef, {
        loginAttempts: 0,
        lastLogin: serverTimestamp()
      });
      
      // Log successful login
      await addDoc(collection(db, "loginLogs"), {
        uid,
        username,
        success: true,
        timestamp: serverTimestamp(),
        ip: "unknown" // Would need server-side implementation for real IP
      });
    } else {
      // Increment failed attempts
      const userData = userDoc.data();
      const attempts = (userData.loginAttempts || 0) + 1;
      
      if (attempts >= 3) {
        // Suspend user account
        await updateDoc(userRef, {
          loginAttempts: attempts,
          suspended: true,
          suspendedUntil: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
        });
        
        // Log suspension
        await addDoc(collection(db, "loginLogs"), {
          uid,
          username,
          success: false,
          suspended: true,
          timestamp: serverTimestamp(),
          attempts
        });
        
        throw new Error("Account suspended due to multiple failed login attempts. Contact administrator.");
      } else {
        await updateDoc(userRef, { loginAttempts: attempts });
        
        // Log failed attempt
        await addDoc(collection(db, "loginLogs"), {
          uid,
          username,
          success: false,
          timestamp: serverTimestamp(),
          attempts
        });
        
        throw new Error(`Invalid credentials. ${3 - attempts} attempts remaining.`);
      }
    }
  } catch (error) {
    throw error;
  }
}

const loginForm = byId("loginForm");
if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const username = byId("username").value.trim();
    const password = byId("password").value;
    const errorDiv = byId("loginError");
    
    try {
      // Clear previous errors
      errorDiv.textContent = "";
      
      // Get email from username
      const unameDoc = await getDoc(doc(db, "usernames", username));
      if (!unameDoc.exists()) {
        throw new Error("Invalid username or password");
      }
      
      const email = unameDoc.data().email;
      
      // Attempt Firebase authentication
      const cred = await signInWithEmailAndPassword(auth, email, password);
      const uid = cred.user.uid;
      
      // Check user status (active, suspended, etc.)
      const statusCheck = await checkUserStatus(uid);
      if (!statusCheck.valid) {
        await auth.signOut(); // Sign out if status check fails
        throw new Error(statusCheck.message);
      }
      
      // Handle successful login
      await handleLoginAttempt(uid, true, username);
      
      // Get user role and redirect
      const userData = statusCheck.userData;
      const role = userData.role || "accountant";
      
      // Role-based redirection
      switch(role) {
        case "administrator":
          location.href = "admin.html";
          break;
        case "manager":
          location.href = "manager.html";
          break;
        default:
          location.href = "app.html";
      }
      
    } catch (err) {
      console.error("Login error:", err);
      
      // Handle failed login attempt if we have user info
      if (err.code !== 'auth/user-not-found' && err.code !== 'auth/invalid-email') {
        try {
          const unameDoc = await getDoc(doc(db, "usernames", username));
          if (unameDoc.exists()) {
            const email = unameDoc.data().email;
            // Get UID from email lookup
            const usersQuery = query(collection(db, "users"), where("email", "==", email));
            const usersSnap = await getDocs(usersQuery);
            if (!usersSnap.empty) {
              const uid = usersSnap.docs[0].id;
              await handleLoginAttempt(uid, false, username);
            }
          }
        } catch (attemptError) {
          // Use the attempt error message if it's more specific
          if (attemptError.message.includes("suspended") || attemptError.message.includes("attempts")) {
            errorDiv.textContent = attemptError.message;
            return;
          }
        }
      }
      
      // Show generic error message
      errorDiv.textContent = err.message || "Invalid username or password";
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

const createUserBtn = byId("createUserBtn");
if (createUserBtn) {
  createUserBtn.addEventListener("click", () => {
    window.location.href = "create-user.html";
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