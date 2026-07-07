# Baton Patrol — Project Status & Roadmap

A top-down, Zelda-1-style action game starring **Officer Pup**, a police-dog hero
inspired by the Dog Man books. Built with plain HTML5 Canvas + vanilla JavaScript —
**zero dependencies, zero build step, zero cost**.

---

## ✅ What Was Done

### Core gameplay (all implemented and smoke-tested)
- **Top-down movement** — arrow keys or WASD, 8-directional, with tile collision.
- **Baton attack** (Space / Z) — swings an arc in the facing direction; a hit
  knocks an enemy **unconscious** (X-eyes, spinning stars, lying on its side).
- **Handcuff action** (X / C) — walk up to an unconscious enemy and press cuff;
  after a short animation the enemy **fades away** and the "Cuffed" counter goes up.
- **15-second wake-up rule** — every unconscious enemy shows a shrinking timer
  ring; if not cuffed in 15 seconds it gets back up and attacks again (ring
  flashes red in the last 4 seconds).
- **Hearts & lives** — player starts with **5 hearts and 3 lives**. Enemy contact
  costs 1 heart (with knockback + ~1.2s of invincibility flicker). At 0 hearts a
  life is lost and the player respawns at the Police Station with full hearts
  (all unconscious enemies wake up). At 0 lives → Game Over screen.
- **Zelda-style world** — a 3×3 grid of single-screen rooms connected by door
  gaps (Police Station Plaza, City Park, Downtown Alley, Warehouse Row, etc.).
  Room state persists: cuffed enemies stay gone when you leave and return.
- **Win condition** — cuff all 22 cat burglars across the map → victory screen.
- **Extras** — title screen with controls, pause (P), HUD (hearts, lives,
  cuffed counter, room name), procedurally generated sound effects via WebAudio
  (no audio files needed), full restart from Game Over/Victory with Enter.

### Files
| File | Purpose |
|---|---|
| `index.html` | Page shell + canvas; loads the scripts (no build step) |
| `js/levels.js` | Constants, gameplay tuning, the 9 room definitions |
| `js/audio.js` | Generated sound effects (WebAudio, no asset files) |
| `js/entities.js` | Player & enemy classes, collision, all character drawing |
| `js/game.js` | Main loop, game states, room transitions, combat rules, HUD |

All art is **drawn in code** (canvas shapes) as original placeholder art — there
are no image, font, or audio assets to license.

---

## ▶️ How to Run Locally

**Option A — just open it:** double-click `index.html`. It runs from `file://`
with no server (plain scripts, no ES modules, on purpose).

**Option B — local server (recommended while developing):**
```bash
cd jays-game
python3 -m http.server 8000     # macOS has python3 built in
# then open http://localhost:8000
```
(or `npx serve` if you prefer Node.)

---

## 🌐 How to Deploy Online (all free)

The game is a static site, so any free static host works. Pick one:

### Option 1 — GitHub Pages (recommended)
1. Create a free GitHub account / repo (e.g. `jays-game`).
2. In this folder: `git init && git add . && git commit -m "Baton Patrol v1"`.
3. Push to GitHub, then in the repo: **Settings → Pages → Deploy from branch →
   `main` / root**.
4. Game will be live at `https://<username>.github.io/jays-game/` in ~1 minute.

### Option 2 — itch.io (best for sharing games with kids/friends)
1. Free account at https://itch.io.
2. Zip the project folder (index.html must be at the zip root).
3. Create a new project → upload the zip → check **"This file will be played in
   the browser"** → set viewport to 768 × 544.

### Option 3 — Netlify / Cloudflare Pages
Drag-and-drop the folder onto https://app.netlify.com/drop — instant free URL,
no account setup beyond signup.

**No API keys, no paid services, no build tooling are required for any option.**

---

## 🧰 Third-Party Setup Needed (all optional, all free)

| Service | Needed for | Cost |
|---|---|---|
| GitHub account | Version control + GitHub Pages hosting | Free |
| itch.io account | Kid-friendly game page hosting | Free |
| Netlify/Cloudflare | Alternative hosting | Free tier |
| *(nothing else)* | The game itself uses no libraries, CDNs, or APIs | — |

> ⚠️ **IP note:** Dog Man is a copyrighted character (Dav Pilkey / Scholastic).
> The game currently uses **original placeholder art** ("Officer Pup") and does
> not use the Dog Man name or likeness. That's fine for a personal/family
> project; if you ever publish it publicly, keep the original character art
> rather than copying Dog Man's actual design.

---

## 🎨 Resources That Need to Be Created or Added

Everything below is optional polish — the game is fully playable as-is.

1. **Character sprite sheets** — replace the code-drawn hero/enemies with real
   pixel art (walk cycles, swing frames, KO pose). Free tools:
   [Piskel](https://www.piskelapp.com/) or [Aseprite] (paid) — Piskel keeps it free.
   Kids can draw the hero themselves and you can scan/trace it.
2. **Tileset** — grass, pavement, trees, crates as a tile image. Free packs at
   [Kenney.nl](https://kenney.nl/assets) (public domain, CC0).
3. **Music** — a looping chiptune track. Free/CC0 sources: Kenney,
   [OpenGameArt.org](https://opengameart.org), or generate with
   [BeepBox](https://www.beepbox.co) (free, in-browser).
4. **Better sound effects** — current ones are generated beeps; free SFX maker:
   [jsfxr](https://sfxr.me/) (export .wav, drop into an `assets/` folder).
5. **A real title logo / favicon.**

---

## 🚧 Next Steps (suggested order)

### Near term
- [ ] Playtest with the target player (Jay!) and tune difficulty: enemy speed,
      sight range, 15s timer, contact damage. All tuning knobs are constants at
      the top of `js/levels.js` and `js/entities.js`.
- [ ] Add touch/gamepad controls so it plays on tablets (on-screen D-pad + two
      buttons).
- [ ] Room-scroll transition animation (Zelda-style slide) instead of an
      instant cut.
- [ ] `git init` the folder and push to GitHub (also gives you backup).

### Medium term
- [ ] **Enemy variety** — faster cats, tougher enemies that take 2 baton hits,
      a ranged enemy.
- [ ] **Boss room** — e.g. Petey the mastermind in the Robo-Lab Lot, with a
      simple attack pattern, unlocked after cuffing everyone else.
- [ ] **Pickups** — heart drops from cuffed enemies, keys/locked doors,
      collectible bones for score.
- [ ] **Save progress** — `localStorage` for best times / cleared rooms.
- [ ] Sprite art + tileset swap-in (see Resources above).

### Longer term
- [ ] Multiple dungeons/levels with a level-select map.
- [ ] Score & timer with a "police report" end screen.
- [ ] Simple level editor (rooms are already just data in `js/levels.js`, so a
      JSON-driven editor is a natural fit).
- [ ] Sound toggle + volume settings menu.

---

## 🕹 Controls Reference

| Key | Action |
|---|---|
| Arrows / WASD | Move |
| Space or Z | Swing baton (knocks enemies unconscious) |
| X or C | Handcuff an unconscious enemy (must be close) |
| P | Pause |
| Enter | Start / restart |
