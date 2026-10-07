import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User as FirebaseUser,
} from 'firebase/auth';
import firebaseAppletConfig from '../../firebase-applet-config.json';
import {
  db,
  fetchUserProfileFromFirestore,
  saveUserProfileToFirestore,
  updateUserPlanInFirestore,
  saveWorkflowToFirestore,
  saveActivityLogToFirestore,
  subscribeToUserWorkspace,
} from '../firebase';

// Clean Firebase Configuration (uses provisioned firebase-applet-config.json with clean fallback placeholder)
export const firebaseConfig = {
  apiKey:
    firebaseAppletConfig?.apiKey ||
    import.meta.env.VITE_FIREBASE_API_KEY ||
    'AIzaSyPlaceholderKey-ToolNovaStudioConfig',
  authDomain:
    firebaseAppletConfig?.authDomain ||
    import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ||
    'toolnova-app.firebaseapp.com',
  projectId:
    firebaseAppletConfig?.projectId ||
    import.meta.env.VITE_FIREBASE_PROJECT_ID ||
    'toolnova-app',
  storageBucket:
    firebaseAppletConfig?.storageBucket ||
    import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ||
    'toolnova-app.appspot.com',
  messagingSenderId:
    firebaseAppletConfig?.messagingSenderId ||
    import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ||
    '123456789012',
  appId:
    firebaseAppletConfig?.appId ||
    import.meta.env.VITE_FIREBASE_APP_ID ||
    '1:123456789012:web:abcdef1234567890',
};

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export async function signInWithGoogle() {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

export async function signOutUser() {
  await firebaseSignOut(auth);
}

export {
  app,
  db,
  signInWithPopup,
  firebaseSignOut,
  onAuthStateChanged,
  fetchUserProfileFromFirestore,
  saveUserProfileToFirestore,
  updateUserPlanInFirestore,
  saveWorkflowToFirestore,
  saveActivityLogToFirestore,
  subscribeToUserWorkspace,
};
export type { FirebaseUser };
