# Worldwide Wheels

An arcade street racer in the browser: India, Brazil, Mexico and Japan, rival bots, tours, a daily challenge, a garage and a monthly league.

## Files

```
index.html          page markup (HUD, touch controls, menu overlay)
favicon.svg         tab icon
css/style.css       all styles
js/game.js          the game: tracks, physics, rivals, menus, saves, and the 2D fallback renderer
js/view3d.js        3D renderer (Three.js): builds the world from game.js's track each map and
                    draws cars, scenery, lighting, shadows and bloom every frame
js/vendor/three/    Three.js r160 (MIT) bundled locally, loaded through the import map in index.html
js/cloud.js         online saves (Firebase email/password + Firestore)
assets/music/       race playlist (played in order, then loops)
```

## Running it

Serve the folder from any static web server, for example:

```
python3 -m http.server 8000
```

then open http://localhost:8000. Opening `index.html` straight from disk runs the game, but online sign-in needs a real web address (localhost or a hosted site).

## Rendering

The game runs in 3D through WebGL. On devices without WebGL, `view3d.js` never starts and `game.js` keeps drawing the original 2D pseudo-3D road, so the game always works.

## Saves

Progress is saved in the browser (localStorage keys starting with `ghatrun-`). When a player signs in, their drivers, points, upgrades, league and settings are also stored in Firestore at `players/{uid}` and merged on each sign-in. Steering controls stay per device.

Firestore rules needed:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /players/{uid} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

Add your site's domain under Firebase Authentication → Settings → Authorized domains.

## Controls

Points buy upgrades and supercars (Toro V12, Rosso GT, Veyra 16, Phantom X) in the Garage showroom.

Arrow keys steer, Up/W gas, Down/S brake, Space nitro, D drift on/off, Z/C hold to drift, M mute, Esc quit. On touch screens: joystick or arrow buttons, Nitro and Drift buttons, automatic gas.
