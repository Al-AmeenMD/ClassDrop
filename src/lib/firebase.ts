import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { getAuth, Auth } from "firebase/auth";
import { getFirestore, Firestore } from "firebase/firestore";
import { getStorage, FirebaseStorage } from "firebase/storage";
import { getFunctions, Functions } from "firebase/functions";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Validate that all six required configuration keys are present
const hasAllConfigKeys = Boolean(
  firebaseConfig.apiKey &&
  firebaseConfig.authDomain &&
  firebaseConfig.projectId &&
  firebaseConfig.storageBucket &&
  firebaseConfig.messagingSenderId &&
  firebaseConfig.appId
);

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let storage: FirebaseStorage | null = null;
let functions: Functions | null = null;
let initializationSucceeded = false;

if (hasAllConfigKeys) {
  try {
    app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    auth = getAuth(app);
    db = getFirestore(app);
    storage = getStorage(app);
    functions = getFunctions(app, "us-central1");
    initializationSucceeded = true;
  } catch (error) {
    console.error("Failed to initialize Firebase client services:", error);
    app = null;
    auth = null;
    db = null;
    storage = null;
    functions = null;
    initializationSucceeded = false;
  }
} else {
  console.warn(
    "[ClassDrop] Firebase environment variables not detected or incomplete. Running in local foundation mode. Provide all 6 variables in .env based on .env.example to enable Firebase services."
  );
}

// Reports true only when all six required variables are provided and initialization succeeded without error
export const isFirebaseConfigured = initializationSucceeded;
export { app, auth, db, storage, functions };
