import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyBWmmrfmKZ_CmBop-3jZW_0dbgwOhJfrNM",
  authDomain: "openbooks-9e22b.firebaseapp.com",
  projectId: "openbooks-9e22b",
  storageBucket: "openbooks-9e22b.firebasestorage.app",
  messagingSenderId: "172072535358",
  appId: "1:172072535358:web:1d510ea9216ff1808ad86f",
  measurementId: "G-VGDWEV1J5N"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
