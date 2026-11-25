/* online saves: Firebase email/password sign-in, each player's drivers stored in Firestore at players/{uid} */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  setPersistence,
  browserLocalPersistence,
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
  get as rtGet,
  update as rtUpdate,
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
// stay signed in on this device until you press Sign out, even after closing the game
setPersistence(auth, browserLocalPersistence).catch(() => {});
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

/* private leagues, kept in the same Realtime Database as multiplayer (mp/lg_{code}/{uid}): each member writes only
   their own entry (name, points); the creator's entry is marked owner. A name is reserved inside each league:
   nobody else can join that league under a name already taken there */
const LCH = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const me = () => {
  const u = auth.currentUser;
  if (!u) throw new Error('Sign in to use leagues');
  return u;
};
const lref = (code, uid) => ref(rtdb, 'mp/lg_' + code + (uid ? '/' + uid : ''));
window.cloud.league = {
  async create(name, pts) {
    const u = me();
    for (let tries = 0; tries < 5; tries++) {
      const code = 'WW-' + Array.from({ length: 4 }, () => LCH[(Math.random() * LCH.length) | 0]).join('');
      if ((await rtGet(lref(code))).exists()) continue;
      await set(lref(code, u.uid), { name, pts: pts || 0, owner: true, t: rtNow() });
      return code;
    }
    throw new Error('Could not make a league code, try again');
  },
  async join(code, name, pts) {
    const u = me();
    code = code.trim().toUpperCase();
    if (!/^WW-[A-Z0-9]{4}$/.test(code)) throw new Error('League codes look like WW-4KQ7');
    const snap = await rtGet(lref(code));
    if (!snap.exists()) throw new Error('No league with code ' + code);
    const m = snap.val();
    for (const id in m)
      if (id !== u.uid && (m[id].name || '').toLowerCase() === name.toLowerCase())
        throw new Error('"' + name + '" is already taken in this league. Use another driver name');
    await set(lref(code, u.uid), { name, pts: pts || 0, owner: !!(m[u.uid] && m[u.uid].owner), t: rtNow() });
    return code;
  },
  async get(code) {
    const snap = await rtGet(lref(code));
    if (!snap.exists()) return null;
    const members = snap.val(),
      owner = Object.values(members).find(x => x.owner);
    return { members, ownerName: owner ? owner.name : '' };
  },
  async setPts(code, name, pts) {
    const u = me();
    await rtUpdate(lref(code, u.uid), { name, pts: pts || 0 });
  },
  // delete: the creator removes the whole league; anyone else just leaves it
  async del(code) {
    const u = me();
    const mine = await rtGet(lref(code, u.uid));
    if (mine.exists() && mine.val().owner)
      try {
        await remove(lref(code));
        return;
      } catch (e) {
        /* not allowed to remove other entries: fall back to leaving */
      }
    await remove(lref(code, u.uid));
  },
  uid: () => (auth.currentUser ? auth.currentUser.uid : null),
};

/* tournaments: a lobby of open tournaments (mp/tn_lobby/{code}) and each tournament's scores
   (mp/tn_score/{code}/{uid} = {name, pts}); the race itself runs in the private room 'room_' + code */
window.cloud.tourney = {
  async host(name, mins) {
    const u = me();
    const code = Array.from({ length: 6 }, () => LCH[(Math.random() * LCH.length) | 0]).join('');
    const ends = window.cloud.mp.now() + mins * 60000;
    await set(ref(rtdb, 'mp/tn_lobby/' + code), { host: name, uid: u.uid, ends });
    return { code, ends };
  },
  watchLobby(cb) {
    return onValue(
      ref(rtdb, 'mp/tn_lobby'),
      s => {
        const all = s.val() || {},
          now = window.cloud.mp.now();
        // finished tournaments are removed so they don't pile up
        for (const k in all)
          if (all[k].ends <= now) {
            remove(ref(rtdb, 'mp/tn_lobby/' + k)).catch(() => {});
            delete all[k];
          }
        cb(all);
      },
      () => cb({}),
    );
  },
  setPts(code, name, pts) {
    const u = me();
    return set(ref(rtdb, 'mp/tn_score/' + code + '/' + u.uid), { name, pts });
  },
  watchScore(code, cb) {
    return onValue(ref(rtdb, 'mp/tn_score/' + code), s => cb(s.val() || {}), () => cb({}));
  },
};

/* lobby: players waiting at mp/lobby/{uid}; a challenge goes to mp/lobby_ch/{target}/{from} = {name, room};
   the answer comes back at mp/lobby_ans/{from} = {room, ok}. Matches race in room 'room_' + room */
window.cloud.lobby = {
  enter(name) {
    const u = me(),
      r = ref(rtdb, 'mp/lobby/' + u.uid);
    onDisconnect(r).remove();
    return set(r, { name, t: rtNow() });
  },
  leave() {
    const u = auth.currentUser;
    if (!u) return;
    remove(ref(rtdb, 'mp/lobby/' + u.uid)).catch(() => {});
    remove(ref(rtdb, 'mp/lobby_ch/' + u.uid)).catch(() => {});
    remove(ref(rtdb, 'mp/lobby_ans/' + u.uid)).catch(() => {});
  },
  watch(cb) {
    return onValue(ref(rtdb, 'mp/lobby'), s => cb(s.val() || {}), () => cb({}));
  },
  challenge(to, name, room) {
    const u = me();
    remove(ref(rtdb, 'mp/lobby_ans/' + u.uid)).catch(() => {});
    return set(ref(rtdb, 'mp/lobby_ch/' + to + '/' + u.uid), { name, room });
  },
  cancel(to) {
    const u = me();
    return remove(ref(rtdb, 'mp/lobby_ch/' + to + '/' + u.uid));
  },
  watchChallenges(cb) {
    const u = me();
    return onValue(ref(rtdb, 'mp/lobby_ch/' + u.uid), s => cb(s.val() || {}), () => cb({}));
  },
  answer(from, room, ok) {
    const u = me();
    remove(ref(rtdb, 'mp/lobby_ch/' + u.uid + '/' + from)).catch(() => {});
    return set(ref(rtdb, 'mp/lobby_ans/' + from), { room, ok, t: rtNow() });
  },
  watchAnswer(cb) {
    const u = me();
    return onValue(ref(rtdb, 'mp/lobby_ans/' + u.uid), s => cb(s.val()), () => cb(null));
  },
  uid: () => (auth.currentUser ? auth.currentUser.uid : null),
};
