/* online saves: Firebase email/password sign-in, each player's drivers stored in Firestore at players/{uid} */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  initializeFirestore,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
const app = initializeApp({
  apiKey: 'AIzaSyC9mWD69-RudmDIWEp06ul5ZrJMasAF5Rs',
  authDomain: 'turbo-racing-3976f.firebaseapp.com',
  databaseURL: 'https://turbo-racing-3976f-default-rtdb.firebaseio.com',
  projectId: 'turbo-racing-3976f',
  storageBucket: 'turbo-racing-3976f.firebasestorage.app',
  messagingSenderId: '349429996868',
  appId: '1:349429996868:web:9cb6067bfc8fbba3bd4b11',
  measurementId: 'G-WRWJPDEPME',
});
const auth = getAuth(app),
  /* skip undefined fields instead of rejecting the whole save */
  db = initializeFirestore(app, { ignoreUndefinedProperties: true });
window.cloud = {
  user: () => auth.currentUser,
  signIn: (e, p) => signInWithEmailAndPassword(auth, e, p),
  signUp: (e, p) => createUserWithEmailAndPassword(auth, e, p),
  reset: e => sendPasswordResetEmail(auth, e),
  signOut: () => signOut(auth),
  load: async () => {
    const u = auth.currentUser;
    if (!u) return null;
    const d = await getDoc(doc(db, 'players', u.uid));
    return d.exists() ? d.data() : null;
  },
  save: async data => {
    const u = auth.currentUser;
    if (!u) return;
    /* plain JSON copy: drops undefined values and anything Firestore can't store */
    const clean = JSON.parse(JSON.stringify(data));
    await setDoc(doc(db, 'players', u.uid), { ...clean, email: u.email, updated: serverTimestamp() });
  },
};
onAuthStateChanged(auth, u => dispatchEvent(new CustomEvent('cloudauth', { detail: u })));
