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
      
      // Check if user needs to change password (first login)
      const needsPasswordChange = userData.passwordCreated && !userData.passwordChanged;
      
      if (needsPasswordChange) {
        // Store user info for password change page
        sessionStorage.setItem('passwordChangeRequired', JSON.stringify({
          uid: uid,
          username: username,
          email: userData.email,
          firstName: userData.firstName,
          lastName: userData.lastName,
          role: role
        }));
        location.href = "change-password.html";
        return;
      }
      
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
      
      // ALWAYS attempt to track failed login attempts for security
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
        // Use the attempt error message if it's more specific (suspension/attempts)
        if (attemptError.message.includes("suspended") || attemptError.message.includes("attempts")) {
          errorDiv.textContent = attemptError.message;
          return;
        }
        // If attempt tracking fails, continue with original error
        console.error("Failed to track login attempt:", attemptError);
      }
      
      // Show generic error message
      errorDiv.textContent = err.message || "Invalid username or password";
    }
  });
}

// Forgot password functionality moved to forgot-password.js for enhanced security

const createUserBtn = byId("createUserBtn");
if (createUserBtn) {
  createUserBtn.addEventListener("click", () => {
    window.location.href = "create-user.html";
  });
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    // Check if we just completed an approval (only on index page)
    const approvalInfo = sessionStorage.getItem('approvalComplete');
    const isIndexPage = window.location.pathname === '/' || window.location.pathname.endsWith('index.html');
    if (approvalInfo && window.location.search.includes('approval=complete') && isIndexPage) {
      const info = JSON.parse(approvalInfo);
      sessionStorage.removeItem('approvalComplete');
      
      // Show success message
      const successMsg = document.createElement('div');
      successMsg.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#4CAF50;color:white;padding:20px;border-radius:8px;z-index:10000;max-width:500px;text-align:center;';
      successMsg.innerHTML = `
        <h3>✅ User Approved Successfully!</h3>
        <p><strong>Username:</strong> ${info.username}<br>
        <strong>Password:</strong> ${info.password}<br>
        <strong>Email:</strong> ${info.email}</p>
        <p><em>Please log back in as admin: ${info.adminEmail}</em></p>
        <button onclick="this.parentElement.remove()" style="background:white;color:#4CAF50;border:none;padding:8px 16px;border-radius:4px;margin-top:10px;cursor:pointer;">Close</button>
      `;
      document.body.appendChild(successMsg);
      
      // Remove URL parameter
      window.history.replaceState({}, document.title, window.location.pathname);
    }
    return;
  }
  
  try {
    // Wait for auth token to be ready
    await user.getIdToken();
    
    const unameSnap = await getDoc(doc(db, "emails", user.email));
    const username = unameSnap.exists() ? unameSnap.data().username : user.email;
    
    // Only set chip if we're NOT on admin page (admin.js handles admin chip)
    const chip = document.getElementById("userChip");
    if (chip && !window.location.pathname.includes('admin.html')) {
      // Get user data to include profile picture and name
      const userDoc = await getDoc(doc(db, "users", user.uid));
      const userData = userDoc.exists() ? userDoc.data() : {};
      
      setChip(chip, { 
        username,
        photoURL: userData.photoURL,
        firstName: userData.firstName,
        lastName: userData.lastName,
        displayName: `${userData.firstName || ''} ${userData.lastName || ''}`.trim() || username
      });
    }
    
    const signOutBtn = byId("signOut");
    if (signOutBtn) {
      // Remove any existing listeners to prevent duplicates
      signOutBtn.replaceWith(signOutBtn.cloneNode(true));
      const newSignOutBtn = byId("signOut");
      newSignOutBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        try {
          await signOut(auth);
          window.location.href = "index.html";
        } catch (error) {
          console.error("Sign out error:", error);
          window.location.href = "index.html"; // Force redirect even if sign out fails
        }
      });
    }
  } catch (error) {
    console.error("Error in auth state changed:", error);
    // If permission denied, sign out and redirect to login
    if (error.code === 'permission-denied') {
      await signOut(auth);
      window.location.href = "index.html";
    }
  }
});