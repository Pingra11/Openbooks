import { db } from "./firebaseConfig.js";
import { byId } from "./ui.js";
import { 
  addDoc, collection, serverTimestamp, doc, getDoc, query, where, getDocs 
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

// Generate username based on requirements: first initial + last name + MMYY
function generateUsername(firstName, lastName) {
  const firstInitial = firstName.charAt(0).toLowerCase();
  const lastNameClean = lastName.toLowerCase().replace(/[^a-z]/g, '');
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = String(now.getFullYear()).substr(-2);
  
  return `${firstInitial}${lastNameClean}${month}${year}`;
}

// Validate form data
function validateUserData(data) {
  const errors = [];
  
  if (!data.firstName.trim()) errors.push("First name is required");
  if (!data.lastName.trim()) errors.push("Last name is required");
  if (!data.email.trim()) errors.push("Email is required");
  if (!data.dob) errors.push("Date of birth is required");
  if (!data.requestedRole) errors.push("Requested role is required");
  
  // Email validation
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (data.email && !emailPattern.test(data.email)) {
    errors.push("Please enter a valid email address");
  }
  
  // Age validation (must be at least 18)
  if (data.dob) {
    const birthDate = new Date(data.dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    
    if (age < 18) {
      errors.push("You must be at least 18 years old to request access");
    }
  }
  
  return errors;
}

// Check if email or username already exists
async function checkExistingUser(email, username) {
  try {
    // Check existing requests
    const requestsQuery = query(collection(db, "userRequests"), where("email", "==", email));
    const requestsSnap = await getDocs(requestsQuery);
    if (!requestsSnap.empty) {
      return "A request with this email address already exists";
    }
    
    // Check existing users
    const usersQuery = query(collection(db, "users"), where("email", "==", email));
    const usersSnap = await getDocs(usersQuery);
    if (!usersSnap.empty) {
      return "A user with this email address already exists";
    }
    
    // Check username
    const usernameDoc = await getDoc(doc(db, "usernames", username));
    if (usernameDoc.exists()) {
      return "A user with this username already exists";
    }
    
    return null;
  } catch (error) {
    console.error("Error checking existing user:", error);
    return "Error checking existing users. Please try again.";
  }
}

const createUserForm = byId("createUserForm");
if (createUserForm) {
  createUserForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    
    const errorDiv = byId("createUserError");
    const successDiv = byId("createUserSuccess");
    errorDiv.textContent = "";
    successDiv.textContent = "";
    
    // Collect form data
    const userData = {
      firstName: byId("firstName").value.trim(),
      lastName: byId("lastName").value.trim(),
      email: byId("email").value.trim().toLowerCase(),
      address: byId("address").value.trim(),
      dob: byId("dob").value,
      phone: byId("phone").value.trim(),
      requestedRole: byId("requestedRole").value,
      justification: byId("justification").value.trim()
    };
    
    // Validate data
    const validationErrors = validateUserData(userData);
    if (validationErrors.length > 0) {
      errorDiv.textContent = validationErrors.join(". ");
      return;
    }
    
    try {
      // Generate username
      const generatedUsername = generateUsername(userData.firstName, userData.lastName);
      
      // Check for existing users
      const existingUserError = await checkExistingUser(userData.email, generatedUsername);
      if (existingUserError) {
        errorDiv.textContent = existingUserError;
        return;
      }
      
      // Create user request
      const requestData = {
        ...userData,
        generatedUsername,
        status: "pending",
        createdAt: serverTimestamp(),
        requestType: "new_user"
      };
      
      await addDoc(collection(db, "userRequests"), requestData);
      
      // Clear form
      createUserForm.reset();
      
      successDiv.innerHTML = `
        <strong>Request submitted successfully!</strong><br>
        Your generated username will be: <strong>${generatedUsername}</strong><br>
        An administrator will review your request and send you login credentials via email if approved.
      `;
      
      // Scroll to success message
      successDiv.scrollIntoView({ behavior: 'smooth' });
      
    } catch (error) {
      console.error("Error creating user request:", error);
      errorDiv.textContent = "Error submitting request. Please try again later.";
    }
  });
}