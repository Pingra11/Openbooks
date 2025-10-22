import { auth, db } from './firebaseConfig.js';
import { setChip } from './ui.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js';
import { 
  collection, 
  query, 
  orderBy, 
  getDocs,
  getDoc,
  doc,
  where,
  Timestamp
} from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js';

let currentUser = null;
let userRole = null;
let allEventLogs = [];

/**
 * Format timestamp for display
 */
function formatTimestamp(timestamp) {
  if (!timestamp) return 'N/A';
  
  let date;
  if (timestamp.toDate) {
    date = timestamp.toDate();
  } else if (timestamp instanceof Date) {
    date = timestamp;
  } else {
    date = new Date(timestamp);
  }
  
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

/**
 * Format event type for display
 */
function formatEventType(eventType) {
  if (!eventType) return 'Unknown';
  
  return eventType
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Load event logs from Firestore
 */
window.loadEventLogs = async function() {
  try {
    console.log('loadEventLogs: Starting to load event logs...');
    
    const eventTypeFilter = document.getElementById('eventTypeFilter').value;
    const fromDateFilter = document.getElementById('fromDateFilter').value;
    const toDateFilter = document.getElementById('toDateFilter').value;
    const userSearchFilter = document.getElementById('userSearchFilter').value.toLowerCase();
    const accountSearchFilter = document.getElementById('accountSearchFilter').value.toLowerCase();

    console.log('loadEventLogs: Filters:', { eventTypeFilter, fromDateFilter, toDateFilter, userSearchFilter, accountSearchFilter });

    // Query event logs
    let eventQuery = query(
      collection(db, "eventLogs"),
      orderBy("timestamp", "desc")
    );

    console.log('loadEventLogs: Executing Firestore query...');
    const eventSnapshot = await getDocs(eventQuery);
    console.log('loadEventLogs: Found', eventSnapshot.size, 'events');
    
    allEventLogs = [];
    eventSnapshot.forEach(doc => {
      allEventLogs.push({ id: doc.id, ...doc.data() });
    });

    // Apply client-side filters
    let filteredLogs = [...allEventLogs];

    if (eventTypeFilter) {
      filteredLogs = filteredLogs.filter(log => log.eventType === eventTypeFilter);
    }

    if (fromDateFilter) {
      const fromDate = new Date(fromDateFilter);
      fromDate.setHours(0, 0, 0, 0);
      filteredLogs = filteredLogs.filter(log => {
        const logDate = log.timestamp?.toDate ? log.timestamp.toDate() : new Date(log.timestamp);
        return logDate >= fromDate;
      });
    }

    if (toDateFilter) {
      const toDate = new Date(toDateFilter);
      toDate.setHours(23, 59, 59, 999);
      filteredLogs = filteredLogs.filter(log => {
        const logDate = log.timestamp?.toDate ? log.timestamp.toDate() : new Date(log.timestamp);
        return logDate <= toDate;
      });
    }

    if (userSearchFilter) {
      filteredLogs = filteredLogs.filter(log => 
        log.username?.toLowerCase().includes(userSearchFilter) ||
        log.userId?.toLowerCase().includes(userSearchFilter)
      );
    }

    if (accountSearchFilter) {
      filteredLogs = filteredLogs.filter(log => 
        log.accountName?.toLowerCase().includes(accountSearchFilter) ||
        log.accountId?.toLowerCase().includes(accountSearchFilter) ||
        log.beforeImage?.accountNumber?.toString().includes(accountSearchFilter) ||
        log.afterImage?.accountNumber?.toString().includes(accountSearchFilter)
      );
    }

    displayEventLogs(filteredLogs);
    updateEventStats(filteredLogs);

  } catch (error) {
    console.error('Error loading event logs:', error);
    alert('Error loading event logs: ' + error.message);
  }
};

/**
 * Display event logs in table
 */
function displayEventLogs(logs) {
  const tbody = document.querySelector('#eventLogsTable tbody');
  
  if (logs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center;">No event logs found</td></tr>';
    return;
  }

  tbody.innerHTML = logs.map(log => `
    <tr>
      <td><code>${log.eventId?.substring(0, 8) || 'N/A'}</code></td>
      <td>${formatTimestamp(log.timestamp)}</td>
      <td><span class="badge badge-${getEventBadgeClass(log.eventType)}">${formatEventType(log.eventType)}</span></td>
      <td>${log.accountName || log.details || 'N/A'}</td>
      <td>${log.username || 'System'}</td>
      <td>
        <button onclick="viewEventDetails('${log.id}')" class="btn-action" title="View Details">
          View Details
        </button>
      </td>
    </tr>
  `).join('');
}

/**
 * Get badge class for event type
 */
function getEventBadgeClass(eventType) {
  if (!eventType) return 'secondary';
  
  if (eventType.includes('added') || eventType.includes('approved') || eventType.includes('activated')) {
    return 'success';
  } else if (eventType.includes('deleted') || eventType.includes('deactivated')) {
    return 'danger';
  } else if (eventType.includes('modified') || eventType.includes('updated')) {
    return 'warning';
  }
  return 'info';
}

/**
 * View event details with before/after comparison
 */
window.viewEventDetails = function(eventId) {
  const event = allEventLogs.find(log => log.id === eventId);
  if (!event) {
    alert('Event not found');
    return;
  }

  const detailsContent = document.getElementById('eventDetailsContent');
  
  let html = `
    <div class="event-details">
      <div class="detail-row">
        <strong>Event ID:</strong>
        <span><code>${event.eventId || 'N/A'}</code></span>
      </div>
      <div class="detail-row">
        <strong>Event Type:</strong>
        <span class="badge badge-${getEventBadgeClass(event.eventType)}">${formatEventType(event.eventType)}</span>
      </div>
      <div class="detail-row">
        <strong>Date/Time:</strong>
        <span>${formatTimestamp(event.timestamp)}</span>
      </div>
      <div class="detail-row">
        <strong>Changed By:</strong>
        <span>${event.username || 'System'} (${event.userId || 'N/A'})</span>
      </div>
      <div class="detail-row">
        <strong>Account/Record:</strong>
        <span>${event.accountName || event.details || 'N/A'}</span>
      </div>
    </div>

    <div class="before-after-container">
      <div class="before-image">
        <h4>Before Image</h4>
        <div class="image-content">
          ${formatDataImage(event.beforeImage)}
        </div>
      </div>
      <div class="after-image">
        <h4>After Image</h4>
        <div class="image-content">
          ${formatDataImage(event.afterImage)}
        </div>
      </div>
    </div>
  `;

  detailsContent.innerHTML = html;
  
  const modal = document.getElementById('eventDetailsModal');
  modal.style.display = 'flex';
  setTimeout(() => modal.classList.add('show'), 10);
};

/**
 * Format data image for display
 */
function formatDataImage(data) {
  if (!data) {
    return '<p class="no-data">No data (null)</p>';
  }

  if (typeof data === 'string') {
    return `<p>${data}</p>`;
  }

  // Format object as pretty JSON with highlighting
  const jsonString = JSON.stringify(data, null, 2);
  const lines = jsonString.split('\n');
  
  return `<pre class="json-display">${lines.map(line => {
    // Highlight keys
    line = line.replace(/"([^"]+)":/g, '<span class="json-key">"$1"</span>:');
    // Highlight string values
    line = line.replace(/: "([^"]+)"/g, ': <span class="json-string">"$1"</span>');
    // Highlight numbers
    line = line.replace(/: (\d+\.?\d*)/g, ': <span class="json-number">$1</span>');
    // Highlight booleans
    line = line.replace(/: (true|false)/g, ': <span class="json-boolean">$1</span>');
    return line;
  }).join('\n')}</pre>`;
}

/**
 * Update event statistics
 */
function updateEventStats(logs) {
  const statsDiv = document.getElementById('accountStats');
  
  const totalEvents = logs.length;
  const accountEvents = logs.filter(l => l.eventType?.includes('account')).length;
  const userEvents = logs.filter(l => l.eventType?.includes('user')).length;
  const recentEvents = logs.filter(l => {
    const logDate = l.timestamp?.toDate ? l.timestamp.toDate() : new Date(l.timestamp);
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    return logDate >= dayAgo;
  }).length;

  statsDiv.innerHTML = `
    <div class="stat-card">
      <h4>Total Events</h4>
      <p class="stat-value">${totalEvents}</p>
    </div>
    <div class="stat-card">
      <h4>Account Events</h4>
      <p class="stat-value">${accountEvents}</p>
    </div>
    <div class="stat-card">
      <h4>User Events</h4>
      <p class="stat-value">${userEvents}</p>
    </div>
    <div class="stat-card">
      <h4>Last 24 Hours</h4>
      <p class="stat-value">${recentEvents}</p>
    </div>
  `;
}

/**
 * Clear all filters
 */
window.clearFilters = function() {
  document.getElementById('eventTypeFilter').value = '';
  document.getElementById('fromDateFilter').value = '';
  document.getElementById('toDateFilter').value = '';
  document.getElementById('userSearchFilter').value = '';
  document.getElementById('accountSearchFilter').value = '';
  loadEventLogs();
};

/**
 * Show help
 */
window.showHelp = function() {
  // Help functionality is handled by help.js
  const helpEvent = new CustomEvent('openHelp');
  window.dispatchEvent(helpEvent);
};

/**
 * Sign out function
 */
window.signOut = async function() {
  if (confirm('Are you sure you want to sign out?')) {
    await auth.signOut();
    window.location.href = 'index.html';
  }
};

/**
 * Close modal
 */
window.closeModal = function(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('show');
    setTimeout(() => modal.style.display = 'none', 300);
  }
};

/**
 * Initialize page
 */
onAuthStateChanged(auth, async (user) => {
  console.log('Event Logs: Auth state changed', user ? 'User logged in' : 'No user');
  
  if (user) {
    const userDoc = await getDoc(doc(db, "users", user.uid));
    
    if (userDoc.exists()) {
      const userData = userDoc.data();
      currentUser = { uid: user.uid, ...userData };
      userRole = userData.role;
      
      console.log('Event Logs: User role:', userRole);
      
      // Update user chip
      const userChip = document.getElementById('userChip');
      if (userChip) {
        setChip(userChip, {
          displayName: `${userData.firstName || ''} ${userData.lastName || ''}`.trim() || userData.username,
          photoURL: userData.photoURL,
          firstName: userData.firstName,
          lastName: userData.lastName,
          username: userData.username
        });
      }
      
      // Update current date
      const currentDateDiv = document.getElementById('currentDate');
      if (currentDateDiv) {
        const now = new Date();
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        currentDateDiv.textContent = now.toLocaleDateString('en-US', options);
      }
      
      // Only administrators can view event logs
      if (userRole !== 'administrator') {
        alert('Access denied. Only administrators can view event logs.');
        window.location.href = 'admin.html';
        return;
      }
      
      // Check for URL parameters to pre-populate filters
      const urlParams = new URLSearchParams(window.location.search);
      const accountNameParam = urlParams.get('accountName');
      const accountIdParam = urlParams.get('accountId');
      
      if (accountNameParam) {
        document.getElementById('accountSearchFilter').value = accountNameParam;
        console.log('Pre-populated account filter with:', accountNameParam);
      } else if (accountIdParam) {
        document.getElementById('accountSearchFilter').value = accountIdParam;
        console.log('Pre-populated account filter with:', accountIdParam);
      }
      
      // Load event logs
      console.log('Event Logs: Loading event logs...');
      await loadEventLogs();
    } else {
      console.error('Event Logs: User document not found');
    }
  } else {
    console.log('Event Logs: No user, redirecting to login');
    window.location.href = 'index.html';
  }
});
