import { getApps, initializeApp } from "firebase/app";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

const requiredFirebaseEnvVars = {
  apiKey: "VITE_FIREBASE_API_KEY",
  authDomain: "VITE_FIREBASE_AUTH_DOMAIN",
  projectId: "VITE_FIREBASE_PROJECT_ID",
  storageBucket: "VITE_FIREBASE_STORAGE_BUCKET",
  messagingSenderId: "VITE_FIREBASE_MESSAGING_SENDER_ID",
  appId: "VITE_FIREBASE_APP_ID",
};

const missingFirebaseEnvVars = Object.entries(requiredFirebaseEnvVars)
  .filter(([configKey]) => !firebaseConfig[configKey])
  .map(([, envVarName]) => envVarName);

if (missingFirebaseEnvVars.length > 0) {
  throw new Error(
    "[firebase] Missing required Firebase environment variables: " +
      missingFirebaseEnvVars.join(", ") +
      ". Create a local .env from .env.example or configure the CI secrets."
  );
}

export const firebaseApp = getApps()[0] || initializeApp(firebaseConfig);
