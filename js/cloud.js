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
  updateDoc,
  runTransaction,
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
/* presence for the friends list: online/{uid} = { n: name, room: 'public' | 'private' }, removed on disconnect.
   Private room codes are never published here */
let onRef = null,
  onStop = null;
window.cloud.presence = {
  set(info) {
    const u = auth.currentUser;
    if (!u) return;
    if (!onRef) {
      onRef = ref(rtdb, 'online/' + u.uid);
      onDisconnect(onRef).remove();
    }
    set(onRef, { ...info, t: rtNow() }).catch(e => console.warn('presence failed', e));
  },
  clear() {
    if (onRef) remove(onRef).catch(() => {});
    onRef = null;
  },
  watch(cb) {
    if (onStop) onStop();
    onStop = onValue(
      ref(rtdb, 'online'),
      s => cb(s.val() || {}),
      e => {
        console.warn('friends status unavailable', e);
        cb(null);
      },
    );
    return () => {
      if (onStop) onStop();
      onStop = null;
    };
  },
};
onAuthStateChanged(auth, u => dispatchEvent(new CustomEvent('cloudauth', { detail: u })));

/* private leagues: leagues/{code} holds each member's reserved name and season points; names/{lower-case name}
   reserves a driver name for one account, so nobody else can use it */
const LCH = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const me = () => {
  const u = auth.currentUser;
  if (!u) throw new Error('Sign in to use leagues');
  return u;
};
window.cloud.league = {
  // claim a name for this account; fails if another account already has it
  async reserve(name) {
    const u = me(),
      key = name.trim().toLowerCase();
    if (!key) throw new Error('Pick a driver name first');
    await runTransaction(db, async tx => {
      const r = doc(db, 'names', key),
        got = await tx.get(r);
      if (got.exists() && got.data().uid !== u.uid) throw new Error('The name "' + name + '" is taken. Pick another driver name');
      if (!got.exists()) tx.set(r, { uid: u.uid, name, at: serverTimestamp() });
    });
  },
  async create(name, pts) {
    const u = me();
    await window.cloud.league.reserve(name);
    for (let tries = 0; tries < 5; tries++) {
      const code = 'WW-' + Array.from({ length: 4 }, () => LCH[(Math.random() * LCH.length) | 0]).join(''),
        r = doc(db, 'leagues', code);
      const made = await runTransaction(db, async tx => {
        if ((await tx.get(r)).exists()) return false;
        tx.set(r, { owner: u.uid, created: serverTimestamp(), members: { [u.uid]: { name, pts: pts || 0 } } });
        return true;
      });
      if (made) return code;
    }
    throw new Error('Could not make a league code, try again');
  },
  async join(code, name, pts) {
    const u = me(),
      r = doc(db, 'leagues', code.trim().toUpperCase());
    const d = await getDoc(r);
    if (!d.exists()) throw new Error('No league with code ' + code.toUpperCase());
    await window.cloud.league.reserve(name);
    await updateDoc(r, { ['members.' + u.uid]: { name, pts: pts || 0 } });
    return r.id;
  },
  async get(code) {
    const d = await getDoc(doc(db, 'leagues', code));
    return d.exists() ? d.data() : null;
  },
  async setPts(code, name, pts) {
    const u = me();
    await updateDoc(doc(db, 'leagues', code), { ['members.' + u.uid]: { name, pts: pts || 0 } });
  },
  uid: () => (auth.currentUser ? auth.currentUser.uid : null),
};
