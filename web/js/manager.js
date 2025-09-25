import { auth, db } from "./firebaseConfig.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import { 
  collection, getDocs, query, where, orderBy, limit, doc, getDoc 
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

// Load team members (accountants and other non-admin users)
async function loadTeamMembers() {
  try {
    const usersQuery = query(
      collection(db, "users"), 
      where("role", "in", ["accountant", "manager"])
    );
    const usersSnap = await getDocs(usersQuery);
    
    const tbody = document.querySelector("#teamTable tbody");
    tbody.innerHTML = "";
    
    let activeCount = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    usersSnap.forEach(docSnap => {
      const user = docSnap.data();
      const tr = document.createElement("tr");
      
      // Check if user was active today
      const lastLogin = user.lastLogin?.toDate();
      if (lastLogin && lastLogin >= today) {
        activeCount++;
      }
      
      tr.innerHTML = `
        <td>${user.firstName || ''} ${user.lastName || ''}</td>
        <td>${user.username}</td>
        <td>${user.role}</td>
        <td class="${user.active ? 'status-active' : 'status-inactive'}">
          ${user.active ? 'Active' : 'Inactive'}
        </td>
        <td>${lastLogin ? lastLogin.toLocaleDateString() : 'Never'}</td>
      `;
      tbody.appendChild(tr);
    });
    
    // Update stats
    document.getElementById("teamMemberCount").textContent = usersSnap.size;
    document.getElementById("activeUsersCount").textContent = activeCount;
    
  } catch (error) {
    console.error("Error loading team members:", error);
  }
}

// Load recent activity
async function loadRecentActivity() {
  try {
    const activityQuery = query(
      collection(db, "loginLogs"),
      orderBy("timestamp", "desc"),
      limit(10)
    );
    const activitySnap = await getDocs(activityQuery);
    
    const activityDiv = document.getElementById("recentActivity");
    activityDiv.innerHTML = "";
    
    for (const docSnap of activitySnap.docs) {
      const activity = docSnap.data();
      
      // Get user details
      let userName = activity.username || "Unknown";
      try {
        const userDoc = await getDoc(doc(db, "users", activity.uid));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          userName = `${userData.firstName || ''} ${userData.lastName || ''}`.trim() || userName;
        }
      } catch (e) {
        // Use username if user details not found
      }
      
      const activityItem = document.createElement("div");
      activityItem.className = `activity-item ${activity.success ? 'success' : 'failed'}`;
      
      const timestamp = activity.timestamp?.toDate().toLocaleString() || 'Unknown time';
      
      activityItem.innerHTML = `
        <div class="activity-details">
          <strong>${userName}</strong> 
          ${activity.success ? 'logged in successfully' : 'failed to log in'}
          ${activity.suspended ? ' (account suspended)' : ''}
        </div>
        <div class="activity-time">${timestamp}</div>
      `;
      
      activityDiv.appendChild(activityItem);
    }
    
  } catch (error) {
    console.error("Error loading recent activity:", error);
    document.getElementById("recentActivity").innerHTML = "<p>Error loading activity</p>";
  }
}

// Show password expiry report
window.showPasswordExpiryReport = async function() {
  try {
    const modal = document.getElementById("passwordExpiryModal");
    const content = document.getElementById("passwordExpiryContent");
    
    content.innerHTML = "Loading...";
    modal.style.display = "block";
    
    // Get all users and check password expiry
    const usersSnap = await getDocs(collection(db, "users"));
    const expiringPasswords = [];
    const expiredPasswords = [];
    
    const now = new Date();
    const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    
    usersSnap.forEach(docSnap => {
      const user = docSnap.data();
      if (user.role !== "administrator") { // Only show non-admin users for manager
        const passwordExpiry = user.passwordExpiry?.toDate();
        
        if (passwordExpiry) {
          if (passwordExpiry < now) {
            expiredPasswords.push({...user, expiry: passwordExpiry});
          } else if (passwordExpiry < threeDaysFromNow) {
            expiringPasswords.push({...user, expiry: passwordExpiry});
          }
        }
      }
    });
    
    let html = "<h3>Password Status Report</h3>";
    
    if (expiredPasswords.length > 0) {
      html += "<h4 style='color: #ff6b6b;'>Expired Passwords</h4>";
      html += "<table><tr><th>Name</th><th>Username</th><th>Expired Date</th></tr>";
      expiredPasswords.forEach(user => {
        html += `<tr><td>${user.firstName || ''} ${user.lastName || ''}</td><td>${user.username}</td><td>${user.expiry.toLocaleDateString()}</td></tr>`;
      });
      html += "</table>";
    }
    
    if (expiringPasswords.length > 0) {
      html += "<h4 style='color: #ffa500;'>Expiring Soon (Next 3 Days)</h4>";
      html += "<table><tr><th>Name</th><th>Username</th><th>Expires</th></tr>";
      expiringPasswords.forEach(user => {
        html += `<tr><td>${user.firstName || ''} ${user.lastName || ''}</td><td>${user.username}</td><td>${user.expiry.toLocaleDateString()}</td></tr>`;
      });
      html += "</table>";
    }
    
    if (expiredPasswords.length === 0 && expiringPasswords.length === 0) {
      html += "<p style='color: #4caf50;'>All passwords are current. No action needed.</p>";
    }
    
    content.innerHTML = html;
    
  } catch (error) {
    console.error("Error loading password expiry report:", error);
    document.getElementById("passwordExpiryContent").innerHTML = "Error loading report";
  }
};

// Show login report
window.showLoginReport = async function() {
  try {
    const modal = document.getElementById("loginReportModal");
    const content = document.getElementById("loginReportContent");
    
    content.innerHTML = "Loading...";
    modal.style.display = "block";
    
    // Get login logs for the last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const logsQuery = query(
      collection(db, "loginLogs"),
      orderBy("timestamp", "desc"),
      limit(100)
    );
    const logsSnap = await getDocs(logsQuery);
    
    let html = "<h3>Login Activity Report (Last 30 Days)</h3>";
    html += "<table><tr><th>User</th><th>Success</th><th>Date/Time</th><th>Attempts</th></tr>";
    
    for (const docSnap of logsSnap.docs) {
      const log = docSnap.data();
      const timestamp = log.timestamp?.toDate();
      
      if (timestamp && timestamp >= thirtyDaysAgo) {
        let userName = log.username || "Unknown";
        try {
          const userDoc = await getDoc(doc(db, "users", log.uid));
          if (userDoc.exists()) {
            const userData = userDoc.data();
            if (userData.role !== "administrator") { // Only show non-admin for manager
              userName = `${userData.firstName || ''} ${userData.lastName || ''}`.trim() || userName;
              
              html += `
                <tr class="${log.success ? 'success-row' : 'failed-row'}">
                  <td>${userName}</td>
                  <td>${log.success ? '✓' : '✗'}</td>
                  <td>${timestamp.toLocaleString()}</td>
                  <td>${log.attempts || 1}</td>
                </tr>
              `;
            }
          }
        } catch (e) {
          // Skip if can't get user details
        }
      }
    }
    
    html += "</table>";
    content.innerHTML = html;
    
  } catch (error) {
    console.error("Error loading login report:", error);
    document.getElementById("loginReportContent").innerHTML = "Error loading report";
  }
};

// Close modal
window.closeModal = function(modalId) {
  document.getElementById(modalId).style.display = "none";
};

// Initialize manager dashboard
onAuthStateChanged(auth, async (user) => {
  if (user) {
    // Verify user is a manager
    const userDoc = await getDoc(doc(db, "users", user.uid));
    if (userDoc.exists() && userDoc.data().role === "manager") {
      loadTeamMembers();
      loadRecentActivity();
    } else {
      // Redirect if not a manager
      window.location.href = "index.html";
    }
  } else {
    window.location.href = "index.html";
  }
});