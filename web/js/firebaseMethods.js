import {
  db,
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  serverTimestamp
} from "./firebaseConfig.js";

const COLLECTION_NAME = "generalLedger";

//const ledgerCollection = collection(db, "generalLedger");

export async function addLedgerEntry(entryData) {
  try {
    console.log("before Firestore instance:", db);
    const ledgerCollection = collection(db, COLLECTION_NAME);
    console.log("after Firestore instance:", db);
    await addDoc(ledgerCollection, entryData);
    return { success: true, message: "Ledger entry saved successfully." };
  } catch (error) {
    console.error("Error saving entry:", error);
    return { success: false, message: error.message };
  }
}

export async function fetchLedgerEntries() {
  try {
    const ledgerCollection = collection(db, "generalLedger");
    console.log("Firestore instance:", db);
    const q = query(ledgerCollection, orderBy("date", "desc"));
    const querySnapshot = await getDocs(q);
    const entries = [];
    querySnapshot.forEach((doc) => {
      entries.push(doc.data());
    });
    return entries;
  } catch (error) {
    console.error("Error fetching ledger entries:", error);
    return [];
  }
}
