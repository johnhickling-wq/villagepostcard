# Postcard Perfect: notes for Claude

A cosy, touch-only, **landscape** restoration game for phones, written in pure
JavaScript. It will later be wrapped for iOS. The player restores a 1950s
cut-paper village one short visit at a time: a resident asks for help, the
player taps to fix things, the scene wipes from before to after, and a
postcard of the visit goes into their journal. The first village, Honeycombe
(Cotswolds, 1957), is complete and free: a 14-visit route to the Best-Kept
Village judging. Other villages are shown as "in preparation"; nothing can be
bought yet.

- **Why the game works as it does:** `DESIGN.md`. Its numbers match the content JSON.
- **The brief behind the current design:** `docs/RESTORATION_HANDOVER.md`
  (September 2026). It superseded the old Village Fund economy.
- **What stands between this build and a store release:** `docs/RELEASE_BLOCKERS.md`.
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
- **The restoration rules (from the handover; don't undo them):**
  - There is no currency. Places open because the story reaches them, never by
    paying; don't add a replacement token either. (Saves from version 2 keep
    their old Village Fund total only as history, in `save.legacy.fund`.)
  - The scene, the job bar and the response to a tap must agree. If something
    looks like today's work, it is a task; tomorrow's work gets a friendly word,
    never a penalty. Story visits have no penalties and no lockout.
  - What the player restores stays restored: later visits, storms, photo walks
    and reloads never undo it.
  - Always one named next step ("Visit the Village Green").
  - Weather and storms are authored incidents with an allowlist of jobs, never
    decay over time. Photo walks, the daily, favours, keepsakes and stamps are
    optional and never gate the story.
- The game is landscape only. On portrait-locked phones the app rotates its
  own stage (see below).
- The monetisation rules are fixed: no energy system, no ads, and nothing sold
  inside a play. A village is a one-off purchase, offered only after the free
  village's finale, with "Stay in Honeycombe" always the first choice.
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
npm run validate                 # content integrity, the visit graph, every visit generated in route order
npm test                         # route, resume, idempotent completion, migration, legacy postcards (node --test)
npm run bot                      # fairness over every visit and thousands of photo walks -> tools/bot/report.md
npm run economy                  # route simulator: story moments and optional content -> tools/bot/economy.md
node tools/bot/tune.mjs          # retunes photo walks: content/common/tiers.json + scoring.json (use --dry first)
npm run build                    # dist/ (bundled game.js, plus postcard-perfect.html for the Artifact preview)
node tools/qa/shots.mjs <scenario> [outdir]   # 844x390 phone screenshots into scratch_art/shots; VW/VH env to change
```

- QA scenarios live in `tools/qa/scenarios/` (`lib.mjs` has `seedStory(page, n)`,
  a save that has played the first n visits, and `tapAll`):
  - smoke, story (a new player's opening to the Green), hints (stalls, the
    loupe offer, tomorrow's work, zoom, pause), resume (reload mid-visit and
    mid-reveal), migrate (a version-2 save), map, screens (journal, postcard,
    noticeboard, travel), fixes (every job incl. planting and replanting),
    gallery, judging (the final visit and the finale), daily, dialogs, audio,
    mix (every sound's loudness against its target);
  - `compact` checks the space-sensitive screens at other sizes:
    `VW=667 VH=375` (small phone) and `VW=1024 VH=768` (4:3 tablet);
  - `rotated` needs a portrait viewport: `VW=390 VH=844 node tools/qa/shots.mjs rotated`;
  - `artifact` expects `dist` served on port 5174.
- Look at the screenshots with Read. It is the only way to judge layout.
- Before committing gameplay or content changes, run `validate`, `npm test` and
  `bot`, plus `economy` if the route or progression changed. Regenerate and
  commit their reports.

## Architecture in one breath

- **`src/core/`** is DOM-free, and the Node bots import it directly, so keep
  it that way.
  - `mess.js`: `generateVisit` builds a story visit's authored tasks on stable
    targets (seeded only for where litter and weeds land); `generateMess` is
    the tier generator for photo walks, the daily and (with `legacy: true`)
    version-2 album postcards. Also the restoration layers (`activeProps`,
    `activeNeglect`).
  - `session.js` runs one play (story visits: no penalties; small-target
    assistance; resume from saved progress).
  - `progression.js` covers the save and migrations, the visit route
    (availability, next step, place stages, completion), the active-visit
    checkpoint, photo walks, the introduction, favours, daily and levels.
  - `sim.js` is the perception-model player.
- **`src/render/`** draws the canvas scene: grading, props, fix animations,
  particles and ambient life.
- **`src/engine/`** holds assets and atlases, the WebAudio synth (all sfx,
  music and ambience are procedural), input, haptics and storage.
- **`src/ui/`** holds the screens and components. Each screen class has
  `constructor`, `enter` and `exit`, plus optional `resize` and `update`.
  `flows.js` moves between screens; `commitPlay` saves a finished play before
  the reveal (`screens/results.js`, the RevealScreen) runs.
- **Styles:** `styles/main.css` (tokens, components), `screens.css` (screen
  looks), `layout.css` (the landscape layout of every screen).
- **Content:**
  - `content/common/*.json` holds rules: faults (jobs), tiers (photo walks),
    `tiers-legacy.json` (frozen, for version-2 postcards), conditions, scoring,
    levels, requests (favours), notes, cosmetics, items, intro (the
    introduction), hud (overlay keep-out areas) and story (visit operations,
    incidents, hint timing, planters and flower colours).
  - `content/villages/<id>/` is one pack: `village.json`, `visits.json` (the
    route), `villagers.json`, `collectibles.json` and `scenes/*.json` (slots,
    `neglect` and `restoration` layers keyed by effect id).
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
  - New postcards (render version 2) store their own faults and the
    permanent state before and after, so they never change.
  - Version-2 album postcards are stored as seeds and re-rendered by the
    legacy path of `generateMess`. Never change its RNG draw order, the frozen
    `tiers-legacy.json`, or what `legacy: true` leaves out (layers marked
    `"added": 3`); `tools/test/legacy.test.mjs` fails if an old card would
    change. The daily also depends on the draw order, so add new draws on
    forked RNGs (`rng.fork(...)`).
  - Scene layers added after version 2 must carry `"added": 3` (or higher).
  - When the save shape changes, bump `SAVE_VERSION` (now 3) and add a step in
    `migrate()` in `progression.js`, because players' saves must survive
    updates. Migration must be repeatable, keep a backup
    (`storage.backup`), and never silently replace an unreadable save.
  - Stable ids: visits, tasks, effects and scene props/regions are addressed
    by id in saves. Don't rename them; add new ones.
- **Fairness:** the generator must never hide one fault under another, or
  under a prop or the cat. `npm run bot` reports this, and it must show zero
  issues, for visits and walks alike.
- **Screens:** a ceremony (`RevealScreen`, `JudgingScreen`) must stop when
  its screen exits (`this.gone`), or it will draw over the next play.
- **Balance targets (hypotheses until human playtests):**
  - Story (the handover's starting targets): first action within 20–30 s,
    first postcard around 1.5–2.5 min, third place within 8–12 min, a later
    visit 1–2.5 min, the whole story 25–40 min. The route simulator's players
    are quicker than real first-timers; if playtests show the story is short,
    give later visits more, don't pad the early ones.
  - Photo walks (optional): about 40/55/70/85/100 s on weather postcards 1–5
    and about 90 s in Free Play, with 3 stamps in roughly 30% of plays (mist
    runs tier 3 a little slow, about 75 s).

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
- The other villages (Porthkennack, Glenbrae, Saint-Amour) exist only as
  Travel Office posters marked "In preparation". There is no purchase flow.
- No human has played the restoration route yet: its timings are simulated.
  See `docs/RELEASE_BLOCKERS.md` for the playtest plan and everything else
  still to verify.
