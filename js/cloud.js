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
import {
  getDatabase,
  ref,
  set,
  remove,
  onValue,
  onDisconnect,
  serverTimestamp as rtNow,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';
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
  // long-polling fallback: copes with networks and proxies that drop Firestore's streaming connection
  db = initializeFirestore(app, { ignoreUndefinedProperties: true, experimentalAutoDetectLongPolling: true });
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
/* multiplayer: live positions in the Realtime Database at mp/{room}/{uid}. Each player writes only their own
   entry (removed automatically if they disconnect) and listens to everyone's. serverOffset keeps every
   player's clock in step, so the map rotation is the same for all */
const rtdb = getDatabase(app);
let mpRef = null,
  mpStop = null,
  serverOffset = 0;
onValue(ref(rtdb, '.info/serverTimeOffset'), s => (serverOffset = s.val() || 0));
window.cloud.mp = {
  now: () => Date.now() + serverOffset,
  join(room, onPlayers) {
    const u = auth.currentUser;
    if (!u) throw new Error('Sign in to race online');
    window.cloud.mp.leave();
    mpRef = ref(rtdb, 'mp/' + room + '/' + u.uid);
    onDisconnect(mpRef).remove();
    mpStop = onValue(
      ref(rtdb, 'mp/' + room),
      snap => onPlayers(snap.val() || {}, u.uid),
      err => console.warn('multiplayer unavailable', err),
    );
  },
  send(data) {
    if (mpRef) set(mpRef, { ...data, t: rtNow() }).catch(e => console.warn('multiplayer send failed', e));
  },
  leave() {
    if (mpStop) mpStop();
    mpStop = null;
    if (mpRef) remove(mpRef).catch(() => {});
    mpRef = null;
  },
};
onAuthStateChanged(auth, u => dispatchEvent(new CustomEvent('cloudauth', { detail: u })));
