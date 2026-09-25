# Adding a village

A village is a **content pack**: JSON files plus art. The engine never needs
changing. Each step below has a tool that checks your work.

```
content/villages/<id>/
  village.json         name, scenes, map pins, restoration projects, letters, finale
  villagers.json       recurring characters: portrait, lines for requests, letters
  collectibles.json    scrapbook sets (5 items each) with flavour text
  scenes/<scene>.json  one per scene: plate, depth, slots (zones, regions, props…)
art_src/<id>/
  plates.json          prompts for the clean plates
  plates/<scene>.webp  generated clean plates (source art)
  extra.json           map and other one-off images (+ prompts)
art_src/sheets.json    sprite-sheet prompts (add <id>-props, <id>-collect…)
art_src/atlases.json   which sprites go into which runtime atlas
```

## 0. The brief (the "brief discussion")

Agree on:

- **Place and flavour.** For example, *Porthkennack Cove, a Cornish fishing
  village, 1958*.
- **The eight scenes.** Pick iconic, varied spots: a harbour, a high street, a
  church, a pub, a garden, a landmark, and so on.
- **Seven villagers.** One of them is the competition's chair or the finale
  judge.
- **Local mess themes.** For example `harbour` (rope, crab shells, fish crates)
  or `beach` (spades, buckets).
- **Six scrapbook sets** of five keepsakes each.
- **Local props.** For example lobster pots, buoys, a boat on a trailer, a
  bench.

Everything after this is mechanical.

## 1. Register the pack

In `content/villages/index.json`, set `"playable": true` on the village's entry
and give it a `price` and `productId` for the store.

Copy `content/villages/honeycombe/` as a template:

- `village.json`:
  - **`scenes`** (in unlock order) and **`start`**.
  - **`projects`**: each scene needs one access project with `unlocks`, plus
    two beautification projects. Each has a `cost`, paid from the Village Fund.
  - **`map.pins`**: coordinates on the 1500×1000 map.
  - **`finale`**.
  - **`letters`**: intro, welcome, teaser and finale.
  - **`difficultyBase`**: pack 2 should be about 0.15 so it starts a notch
    harder.
- `villagers.json`: lines for every request kind (`fix`, `fixAny`, `cat`,
  `stamps`, `condition`, `combo`, `nohint`, `quick`, `plays`, `collect`),
  three `thanks` lines, and five `letters` (one per friendship level).
- `collectibles.json`: six sets, each with a `reward` (`fund`, `xp` and a
  cosmetic from `content/common/cosmetics.json`).

New litter or props that don't exist yet go in `content/common/items.json`,
tagged with the village's themes.

These are shared by every village and need nothing from a new pack:

- `content/common/intro.json`: the step-by-step introduction (which jobs and
  features arrive after how many postcards, and their cards);
- `content/common/hud.json`: the play screen's overlay areas, which the mess
  generator keeps clear;
- `content/common/faults.json`: each job's action name, tool icon and the
  one-line explanation on its "new job" card.

## 2. Generate the art

1. Write the prompts:
   - `art_src/<id>/plates.json`: one prompt per scene. Plates are 2:1 (the
     shape of a phone held sideways). Reuse the `common` text from Honeycombe;
     it asks for the cut-paper style, calm ground across the full width where
     litter will lie, no people and no text. Every plate is matched to
     `art_src/style_ref_cutpaper.jpg`.
   - `art_src/sheets.json`: add sheets for the new props, the collectibles and
     a `villagers` portrait sheet. Sprite sheets are matched to
     `art_src/style_ref_objects.jpg`, a close-up of cut-paper objects.
   - `art_src/<id>/extra.json`: a `map` prompt (3:2 landscape). Pin
     coordinates in `village.json` use the map's 1500 × 1000 units.
2. Generate. `OPENROUTER_API_KEY` must be set.

   ```sh
   python3 tools/art/generate.py plates <id> --dry   # check prompts and cost
   python3 tools/art/generate.py plates <id>
   python3 tools/art/generate.py sheets <id>-props <id>-collect <id>-villagers
   python3 tools/art/generate.py extra <id>
   ```

   A village costs about **$6–8**: plates and the map about $0.35 each, sprite
   sheets about $0.50 each. `generate.py spend` shows the running total. Look
   at each plate. If one misses, regenerate it with `--only <scene> --force`.
3. Add the new sheet items to `art_src/atlases.json` (props go in the common
   `props` atlas; collectibles and portraits go under `villages/<id>`), then
   build:

   ```sh
   python3 tools/art/build.py
   ```

   This cuts the sprites off the magenta background, packs the atlases, writes
   `assets/**/manifest.json` and converts the plates to webp. Each plate also
   gets a colour grid, which the mess generator uses to camouflage litter.

**Replacing art later** (for example with final commissioned art) works the
same way: drop in a new source file with the same name and rerun `build.py`.
Keys and scene data stay valid as long as the composition is similar.

**Restyling or widening existing plates** keeps the scene data too:
`tools/art/cutpaper_plates.py` redraws a village's plates in another style from
`art_src/<id>/cutpaper.json`, and `tools/art/widen.py` paints new scenery at the
sides of a 3:2 plate to make it 2:1 while pasting the original middle back
untouched. `tools/art/widen_scene.py` then moves the scene file's coordinates
across to match. Check each result with `overlay.py`.

## 3. Annotate each scene

The mess is generated, but the generator needs to know where things can go.
These **slots** are the only hand-authored part of a scene:

| Field | What it is |
|---|---|
| `depth` | `farY`/`nearY` and their scales, for perspective sizing of litter |
| `zones` | ground polygons where litter can land (`water: true` makes it bob) |
| `edges` | polylines at wall bases and path edges, for weeds |
| `regions` | polygons of doors, benches and windows. Tags: `paintable` (faded paint), `window` or `grime` (grime) |
| `props` | sprites added over the plate, placed by base point `x,y` (or `pivot: "top"` for hanging things) and height `h`. Tags: `tiltable`, `standing`, `flowers`. Optional painted `label` |
| `lamps` | light points for dusk (`x, y, r`) |
| `perches` | where pigeons sit |
| `cats` | Marmalade's hiding spots, with a pose |
| `chimneys` | smoke sources |
| `water` | shimmer polygons |
| `erase` | polygons of baked-in objects to paint out, because a prop replaces them |
| `neglect` | persistent faded or grimy regions that a project restores |
| `restoration` | per-project props and `decor` (bunting and lights strung between points) |
| `mess.themes` | litter theme weights for this scene |

Two tools make this quick:

```sh
python3 tools/art/grid.py art_src/<id>/plates/<scene>.webp out.jpg                    # coordinate grid
python3 tools/art/grid.py art_src/<id>/plates/<scene>.webp out.jpg 100 400 600 900 --step 20   # zoomed crop
python3 tools/art/overlay.py <id> <scene> out.jpg --restored                          # draw all slots and props
```

Scene coordinates are 2000 wide and 1000 tall, whatever the image size. Keep
anything to find (zones, props, windows, lamps, cat spots) out of the top 14%
and the bottom-right corner, where the play screen's overlays sit: the mess
generator won't place faults there (`content/common/hud.json`).

## 4. Check and tune

```sh
npm run validate      # broken references, missing art, unreachable scenes
npm run bot           # thousands of generated messes: fairness plus timing per tier
npm run economy       # simulated playthrough: hours to finale, walls between projects
node tools/bot/tune.mjs   # optional: re-fit tier subtlety and stamp thresholds
```

**The bot** fails a scene if a fault can be completely covered by others, or
if the average player's time is more than 30% off the tier's target. It also
checks that every fault has a tappable area of its own.

**The economy sim** plays the whole village with the real progression rules.
Aim for:

- 2–3 hours to judging;
- no more than about 6 plays between purchases.

Adjust the project `cost` in `village.json` if needed.

## 5. Play it

Run `npm run dev` and open http://localhost:5173.

The QA harness (`node tools/qa/shots.mjs <scenario>`) screenshots flows on a
844×390 landscape phone viewport. `gallery` shows every scene of the pack under a
different weather condition at Tier 5 (set `TIER` to change it).
