# Worldwide Wheels

An arcade street racer in the browser: India, Brazil, Mexico and Japan, rival bots, tours, a daily challenge, a garage and a monthly league.

## Files

```
index.html          page markup (HUD, touch controls, menu overlay)
favicon.svg         tab icon
css/style.css       all styles
js/cars.js          every car: names, real-world names, prices, stats, 3D shape (edit this one)
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

Points buy upgrades and supercars (Toro V12, Rosso GT, Veyra 16, Phantom X) in the Garage. With WebGL the Garage becomes a 3D studio: the car spins on a turntable (drag to rotate) and tapping a showroom card previews that car.

Arrow keys steer, Up/W gas, Down/S brake, Space nitro, D drift on/off, Z/C hold to drift, M mute, Esc quit. On touch screens: joystick or arrow buttons, Nitro and Drift buttons, automatic gas.

## Cars

All cars live in `js/cars.js`. The top of that file has the settings you're most likely to change:

- `USE_REAL_NAMES`: `false` shows the game names, `true` shows the real car names. Currently on (the game shows real names); real brand names are trademarks.
- `PRICES`: the points each supercar costs.
- `CAR_LIST`: each car's `name`, `realName`, `stats`, `desc`, 3D `shape` and `style`.

Don't change a car's `id` once players own it, because saves refer to cars by id.

| In-game name | Styled after | Price | Speed | Accel | Handling | Damage taken |
|---|---|---|---|---|---|---|
| Coupe | Generic sports coupe | free | 1.00 | 1.00 | 1.00 | 1.00 |
| Hatch | Generic hot hatch | free | 0.96 | 1.10 | 1.12 | 1.00 |
| Wedge | Generic 80s wedge sports car | free | 1.06 | 0.95 | 0.90 | 1.00 |
| Van | Generic minivan | free | 0.93 | 0.90 | 0.95 | 0.50 |
| Roadster | Generic open-top roadster | free | 1.00 | 1.05 | 1.20 | 1.35 |
| Pickup | Generic pickup truck | free | 0.97 | 0.92 | 1.00 | 0.65 |
| Toro V12 | Lamborghini Centenario | 150 | 1.12 | 1.18 | 1.04 | 1.05 |
| Rosso GT | Ferrari 812 Superfast | 300 | 1.16 | 1.20 | 1.18 | 1.00 |
| Veyra 16 | Bugatti Chiron | 600 | 1.24 | 1.26 | 1.10 | 0.85 |
| Veyra Dive | Bugatti Divo | 900 | 1.22 | 1.25 | 1.22 | 0.90 |
| Phantom X | Hypercar concept (not a real model) | 1000 | 1.30 | 1.34 | 1.24 | 0.85 |
| Veyra 300+ | Bugatti Chiron Super Sport 300+ | 1200 | 1.32 | 1.30 | 1.08 | 0.85 |
| Veyra Bolt | Bugatti Bolide | 1500 | 1.34 | 1.40 | 1.30 | 0.70 |

Stats are relative to the starter Coupe (1.00); Garage upgrades multiply on top.
