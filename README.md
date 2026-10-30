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

## Install as an app (PWA)

The site is an installable web app: `manifest.json` (name, colours, full-screen launch), `icons/` (192 px, 512 px, a maskable 512 px for Android and an Apple touch icon) and `sw.js`, a service worker that saves every game file on first visit so the game opens instantly and plays offline (online sign-in and saves still need internet). Updates download in the background and apply on the next launch.

- Chrome / Edge on Windows, Mac, Android: the menu shows an **Install app** button, or use the browser's install icon in the address bar.
- iPhone / iPad (Safari): Share, then **Add to Home Screen**.

If you add or rename game files, add them to the `FILES` list in `sw.js` so they're saved for offline play from the first visit (anything missed is still saved the first time it loads).

## Rendering

The game runs in 3D through WebGL. On devices without WebGL, `view3d.js` never starts and `game.js` keeps drawing the original 2D pseudo-3D road, so the game always works.

## Driving and sound

- Cars have sideways momentum and grip: steering and bends set where the car wants to go, and grip decides how quickly it follows. Rain, grass, drifting and too much speed in a bend reduce grip, so the car slides wide. Sliding scrubs speed and the body swings out in 3D.
- Rival bots scale their pace and acceleration to the car you drive, so races stay close in a supercar.
- Each car has an engine sound (`ENGINES` in `js/cars.js`: i4, v8, v12, w16), plus tyre squeal, crash crunch and a nitro hiss.
- Graphics quality (Settings): Auto measures the frame rate early in the first race and switches off shadows and glow and lowers resolution if the device struggles; High and Low force it.

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
- `MAX_KMH`: the hard speed limit (300).
- `TOP_SPEEDS`: each car's top speed in km/h.
- `ENGINES`: each car's engine sound.
- `PRICES`: the points each supercar costs.
- `CAR_LIST`: each car's `name`, `realName`, `stats`, `desc`, 3D `shape` and `style`.

Don't change a car's `id` once players own it, because saves refer to cars by id.

| Game name | Real car | Price | Top speed (km/h) | Accel | Handling | Damage taken |
|---|---|---|---|---|---|---|
| Coupe | Generic sports coupe | free | 230 | 1.00 | 1.00 | 1.00 |
| Hatch | Generic hot hatch | free | 221 | 1.10 | 1.12 | 1.00 |
| Wedge | Generic 80s wedge sports car | free | 244 | 0.95 | 0.90 | 1.00 |
| Van | Generic minivan | free | 214 | 0.90 | 0.95 | 0.50 |
| Roadster | Generic open-top roadster | free | 230 | 1.05 | 1.20 | 1.35 |
| Pickup | Generic pickup truck | free | 223 | 0.92 | 1.00 | 0.65 |
| Toro V12 | Lamborghini Centenario | 150 | 255 | 1.18 | 1.04 | 1.05 |
| Rosso GT | Ferrari 812 Superfast | 300 | 262 | 1.20 | 1.18 | 1.00 |
| Veyra 16 | Bugatti Chiron | 600 | 282 | 1.26 | 1.10 | 0.85 |
| Veyra Dive | Bugatti Divo | 900 | 278 | 1.25 | 1.22 | 0.90 |
| Phantom X | Hypercar concept (not a real model) | 1000 | 286 | 1.34 | 1.24 | 0.85 |
| Veyra 300+ | Bugatti Chiron Super Sport 300+ | 1200 | 296 | 1.30 | 1.08 | 0.85 |
| Orbit 720 | McLaren 720S | 450 | 266 | 1.24 | 1.20 | 0.95 |
| Orbit S | McLaren Senna | 1100 | 288 | 1.32 | 1.32 | 0.85 |
| Spectre R | Koenigsegg Regera | 1300 | 291 | 1.36 | 1.15 | 0.85 |
| Spectre J | Koenigsegg Jesko | 1400 | 298 | 1.38 | 1.28 | 0.80 |
| Veyra Bolt | Bugatti Bolide | 1500 | 300 | 1.40 | 1.30 | 0.70 |

Accel, handling and damage are relative to the starter Coupe (1.00). Top speeds are set in TOP_SPEEDS; Garage upgrades add up to 20% and nitro about 8%, but nothing goes faster than MAX_KMH (300 km/h).
