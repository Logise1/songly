import { initializeApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCB_RiTV17ouLpPylMQs1kW_ayDqYoZKUE",
  authDomain: "jumper-4e0b2.firebaseapp.com",
  projectId: "jumper-4e0b2",
  storageBucket: "jumper-4e0b2.firebasestorage.app",
  messagingSenderId: "397169417542",
  appId: "1:397169417542:web:305312904eeadcd579d947",
  measurementId: "G-BBBHJ2T8XL"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
