import { initializeApp, getApps } from "firebase/app";
import { getFirestore } from "firebase/firestore";

import { firebaseConfig } from "./config";

export const isFirebaseConfigured = Object.values(firebaseConfig).every(Boolean);

const safeConfig = isFirebaseConfigured
  ? firebaseConfig
  : {
      apiKey: "demo",
      authDomain: "demo.local",
      projectId: "demo-project",
      storageBucket: "demo.local",
      messagingSenderId: "0",
      appId: "demo-app"
    };

export const app = getApps().length > 0 ? getApps()[0] : initializeApp(safeConfig);

export const db = getFirestore(app);
