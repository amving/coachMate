import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  type Auth,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User
} from "firebase/auth";

import { app } from "../firebase/client";

let authInstance: Auth | null = null;

function ensureAuth() {
  if (authInstance) {
    return authInstance;
  }

  void AsyncStorage;
  authInstance = getAuth(app);

  return authInstance;
}

export const coachAuth = ensureAuth();

export function subscribeCoachAuth(callback: (user: User | null) => void) {
  return onAuthStateChanged(coachAuth, callback);
}

export function signInCoach(email: string, password: string) {
  return signInWithEmailAndPassword(coachAuth, email, password);
}

export function signOutCoach() {
  return signOut(coachAuth);
}
