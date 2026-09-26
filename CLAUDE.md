# Postcard Perfect: notes for Claude

A cosy, touch-only, **landscape** hidden-object game for phones, written in pure
JavaScript. It will later be wrapped for iOS. The player taps to fix the mess
in 1930s–60s cut-paper villages, then a postcard of the scene prints into
their album, and the money it raises goes into the Village Fund. The first village, Honeycombe (Cotswolds), is complete and free.
Other villages are cheap packs, and the purchase is a visual mock only.

- **Why the game works as it does:** `DESIGN.md`. Its numbers match the content JSON.
- **Run, architecture and checks:** `README.md`.
- **Adding a village from data alone:** `docs/ADDING_A_VILLAGE.md`. This is critical to the owner.

## Owner's standing brief

- Quality and production value come first. Game feel matters most: fix
  animations, sound, combos, juice. We are now polishing towards "perfect".
- Players aren't gamers. Introduce one idea at a time and always show one
  obvious next step (`content/common/intro.json`). Nothing appears on screen
  before it has been introduced.
- The play screen is the full-screen scene with small overlays: a thin bar of
  jobs along the top (tool icons, never a specific object), pause top-left,
  hints bottom-right. Nothing to find may sit under an overlay
  (`content/common/hud.json`; the bot checks it).
- The currency is the Village Fund (a jar and a number), never "pennies".
- The game is landscape only. On portrait-locked phones the app rotates its
  own stage (see below).
- The monetisation rules are fixed: no energy system, no ads, and nothing sold
  inside a play.
- Everything comes from systems and data. Never write village-specific code.
  A new village must stay "a brief discussion plus the art pipeline".
- The game is front end only. The save is local (`src/engine/storage.js` wraps
  `localStorage`, so it can be swapped).
- Git:
  - `main` is the default branch: the official copy of the game. Work on the
    branch the session assigns, which starts from `main`.
  - The owner doesn't use git themselves. When they ask to merge a session's
    work into `main`, do it for them and explain what happened in plain words.
  - Do not open a PR unless asked.
  - Keep model names out of commits, code and docs.

## Setup and everyday commands

```sh
npm install                      # esbuild + playwright (Chromium is preinstalled at /opt/pw-browsers)
npm run dev                      # http://localhost:5173 (run in background); `node tools/serve.mjs 5174 dist` serves a build
npm run validate                 # content pack integrity; run after any content/ change
npm run bot                      # fairness + difficulty over thousands of generated messes -> tools/bot/report.md
npm run economy                  # whole-village playthrough sim -> tools/bot/economy.md
node tools/bot/tune.mjs          # retunes content/common/tiers.json + scoring.json (use --dry first)
npm run build                    # dist/ (bundled game.js, plus postcard-perfect.html for the Artifact preview)
node tools/qa/shots.mjs <scenario> [outdir]   # 844x390 phone screenshots into scratch_art/shots; VW/VH env to change
```

- QA scenarios live in `tools/qa/scenarios/`:
  - smoke, tutorial, ftue, map, screens, gallery, fixes, hints, restore,
    judging, daily, dialogs, audio, mix (every sound's loudness against its target);
  - `rotated` needs a portrait viewport: `VW=390 VH=844 node tools/qa/shots.mjs rotated`;
  - `artifact` expects `dist` served on port 5174.
- Look at the screenshots with Read. It is the only way to judge layout.
- Before committing gameplay or content changes, run `validate` and `bot`,
  plus `economy` if progression changed. Regenerate and commit their reports.

## Architecture in one breath

- **`src/core/`** is DOM-free, and the Node bots import it directly, so keep
  it that way.
  - `mess.js` is the deterministic mess generator: plate, tier, condition,
    seed and restoration state produce faults with hit shapes.
  - `session.js` runs one play.
  - `progression.js` covers the save and migrations, the Village Fund,
    postcards (five per scene, one per weather), projects, the step-by-step
    introduction, requests, daily and levels.
  - `sim.js` is the perception-model player.
- **`src/render/`** draws the canvas scene: grading, props, fix animations,
  particles and ambient life.
- **`src/engine/`** holds assets and atlases, the WebAudio synth (all sfx,
  music and ambience are procedural), input, haptics and storage.
- **`src/ui/`** holds the screens and components. Each screen class has
  `constructor`, `enter` and `exit`, plus optional `resize` and `update`.
  `flows.js` moves between screens.
- **Styles:** `styles/main.css` (tokens, components), `screens.css` (screen
  looks), `layout.css` (the landscape layout of every screen).
- **Content:**
  - `content/common/*.json` holds rules: faults, tiers, conditions, scoring,
    levels, requests, notes, cosmetics, items, intro (the step-by-step
    introduction) and hud (overlay keep-out areas).
  - `content/villages/<id>/` is one pack: `village.json`, `villagers.json`,
    `collectibles.json` and `scenes/*.json`.
- **Assets:** runtime files are in `assets/`, built from `art_src/` by
  `tools/art/build.py`.

## Gotchas (each of these has bitten before)

- **Coordinates:**
  - Scenes are 2000×1000 units, and the plates are 2:1. The village map is
    still 1500×1000 (3:2).
  - Never use `getBoundingClientRect`/`clientX` directly for layout or hit
    tests. Use `app.toLocal(cx, cy)`, `app.localRect(el)`, `app.width`,
    `app.height`, `app.safe` and `app.rail`.
  - On a portrait touch device, `#app` gets `.rotated`, is turned 90° and is
    given swapped dimensions, so window maths is wrong there. Check the
    `rotated` scenario after touching layout or input.
- **Pointer events:** `#ui` passes clicks through to the canvas. Only
  buttons, trays, chips and cards take pointer events. `#ui > .toasts` must
  stay `pointer-events: none`.
- **`h()` in `src/ui/dom.js`:** the second argument can be props or a child.
  Style objects set `--vars` via `setProperty`.
- **Screens:** `enter()` must not await long ceremonies. The judging and
  restore screens call a non-awaited `run()`, because otherwise the screen
  stacks on the previous one. Toasts are cleared on every screen change.
- **Determinism:**
  - Album postcards are stored as seeds and re-rendered by
    `src/render/stills.js`. Changing the RNG draw order in `mess.js` changes
    every past postcard and the daily puzzle, so add new draws on forked RNGs
    (`rng.fork(...)`).
  - When the save shape changes, bump `SAVE_VERSION` and add a step in
    `migrate()` in `progression.js`, because players' saves must survive
    updates.
- **Fairness:** the generator must never hide one fault under another, or
  under a prop or the cat. `npm run bot` reports this, and it must show zero
  issues.
- **Balance targets:**
  - The simulated average player should take about 40/55/70/85/100 s on
    postcards (tiers) 1–5 and about 90 s in Free Play, and get 3 stamps in
    roughly 30% of plays. Each postcard has a fixed weather, so mist makes
    tier 3 run a little slow (about 75 s).
  - The economy should take about 2 hours to reach judging, with no more than
    about 6 plays between purchases.

## Art pipeline (OpenRouter)

- **Key:** `OPENROUTER_API_KEY` is in the environment. Never print it.
- **Style:** flat cut-paper collage. Plates match
  `art_src/style_ref_cutpaper.jpg`; sprite sheets match
  `art_src/style_ref_objects.jpg` and are redrawn pose for pose from the old
  painted sheets in `art_src/sheets_painted/`.
- **Tools:**
  - `tools/art/orgen.py` is the API helper.
  - `tools/art/generate.py plates|sheets|extra|spend` generates art and
    reports spend.
  - `cutout.py` cuts magenta chroma-key sheets.
  - `build.py` builds atlases, plates, colour grids and inpainting.
  - `grid.py` and `overlay.py` draw annotation overlays for placing slots.
  - `cutpaper_plates.py` restyles a village's plates; `widen.py` makes a 3:2
    plate 2:1 without moving anything in it; `widen_scene.py` shifts a scene
    file to match.
- **Models:**
  - Everything uses `openai/gpt-5.4-image-2`: about $0.35 per plate, map or
    poster and $0.50 per sprite sheet. It offers 21:9 but not 2:1, so plates
    are painted at 21:9 and trimmed.
  - The prompts live next to the art in `art_src/**.json`.
  - Spend was $24.56 after the cut-paper rebuild.
- **Budget:**
  - Every call is logged to `tools/art/spend.jsonl` (committed).
    `python3 tools/art/generate.py spend` shows the total.
  - The owner has authorised spending all the credit on the account (about
    $45 in total) on the cut-paper art rebuild. Ask before going past that.
  - The key belongs to an OpenRouter workspace with its own lifetime budget.
    A 403 "Workspace lifetime budget exceeded" means the owner must raise it
    in the workspace's settings on openrouter.ai; the key can't change it.
- **Scratch output:** `scratch_art/` and `art_src/cut/` are gitignored and
  are lost with the container. Anything worth keeping goes in `art_src/` or
  `assets/`. The painted plates, sheets, map and posters are kept in
  `art_src/**/*_painted*`, and the older portrait plates in
  `art_src/honeycombe/plates_portrait/`.

## Preview Artifact

- **URL:** https://claude.ai/artifact/6njuGdUSAxzCad27t113NG (owned by the
  user).
- **To update it:**
  1. Run `npm run build`.
  2. Read the artifact with the Artifact tool's `read` action.
  3. Publish with `url` set to the link above and `file_path` set to
     `dist/postcard-perfect.html`.
  4. Pass `root` as the absolute path `/home/user/villagepostcard/dist`
     (a relative root fails).
  5. Pass `files` listing every file under `dist/` except the html pages.

## Not yet verified

- The game hasn't been tried on a real iPhone. Audio unlock, haptics,
  safe-area insets and performance there are unconfirmed. On desktop Chromium
  a frame takes about 0.24 ms.
- Sound is fully synthesised. `audio.register(name, url)` can swap in recorded
  samples, but nothing uses it yet.
- The other villages (Porthkennack, Glenbrae, Saint-Amour, Grand Tour bundle)
  exist only as Travel Office posters and prices.
