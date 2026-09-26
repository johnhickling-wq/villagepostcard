# Adding a village

A village is a **content pack**: JSON files plus art. The engine never needs
changing. Each step below has a tool that checks your work.

```
content/villages/<id>/
  village.json         name, the opening line, scenes, map pins, letters, finale
  visits.json          the restoration route: every visit, in story order
  villagers.json       recurring characters: portrait, lines for favours, letters
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
- **The route.** About a dozen short visits across the eight places, each a
  resident asking for one clear improvement, with a couple of Committee
  requests and one weather incident. Some places are visited once, some two or
  three times. Sketch it as a table first (see Honeycombe's in `DESIGN.md`
  §4.2): visit, place, who asks, what visibly changes.
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
  - **`opening`**: one readable sentence that starts the game ("Help
    Honeycombe look its best before the village judges arrive.").
  - **`scenes`** and **`start`** (the first visit's place).
  - **`map.pins`**: coordinates on the 1500×1000 map, and `map.judging`.
  - **`finale`**.
  - **`letters`**: intro, welcome, teaser and finale (read in the journal).
  - **`difficultyBase`** (photo walks): pack 2 should be about 0.15 so it
    starts a notch harder.
  - No `legacy` block: that only maps Honeycombe's version-2 saves.
- `visits.json`: the route (step 4 below).
- `villagers.json`: lines for every favour kind (`fix`, `fixAny`, `cat`,
  `stamps`, `condition`, `combo`, `nohint`, `quick`, `plays`, `collect`),
  three `thanks` lines, and five `letters` (one per friendship level).
- `collectibles.json`: six sets, each with a `reward` (`xp` and a cosmetic
  from `content/common/cosmetics.json`).
- In `content/villages/index.json`, keep `"playable": false` and an honest
  `status` until the pack is finished and a real store purchase exists (see
  `docs/RELEASE_BLOCKERS.md`).

New litter or props that don't exist yet go in `content/common/items.json`,
tagged with the village's themes.

These are shared by every village and need nothing from a new pack:

- `content/common/intro.json`: the step-by-step introduction (which features
  arrive after how many visits, and their cards);
- `content/common/story.json`: the operations a visit can use, incidents and
  their allowed jobs and debris, hint timing, planters and flower colours;
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
| `neglect` | things that look tired until a visit restores them: `{target, type: faded/grimy/wilted, amount, effect, later?}`. `later` is the resident's line if it's tapped before its visit |
| `restoration` | permanent layers, each `{effect, props?, removes?, decor?, labels?, tints?}`: props that appear (planters to plant), bunting and lights, new lettering on a sign, flower colours |
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

**A tired thing that isn't today's work is a trap.** If a door looks faded
from the start, either its visit is the first one there, or give it a `later`
line so a tap gets a friendly word. Anything that should look unfinished only
later (an empty tub) belongs in a restoration layer, not the plate.

## 4. Author the route

`visits.json` is `{ "visits": [ ... ] }`, in story order: the first available
visit is always the player's next step. A visit:

```json
{
 "id": "hs-refresh", "scene": "high-street", "kind": "restoration",
 "after": ["halt-tidy"], "villager": "postmistress",
 "title": "Brighten the High Street", "goal": "paint the kiosk and pillar box",
 "brief": "Hello, dear! Our telephone kiosk and pillar box have gone ever so pale…",
 "condition": "clear", "subtlety": 0.05,
 "tasks": [
  { "id": "kiosk", "op": "faded", "target": "kiosk" },
  { "id": "litter", "op": "litter", "count": 2, "zones": ["street"], "items": ["newspaper", "paper-bag"] }
 ],
 "effects": ["hs-paint"], "restores": true,
 "todo": "A faded kiosk and pillar box", "stage": "Restored",
 "improved": "Post Office red on the kiosk and pillar box",
 "reaction": "Oh, that red! Now do go and see the Colonel on the Green."
}
```

| Field | Notes |
|---|---|
| `kind` | `restoration`, `committee` (a Committee request: pinned on the noticeboard) or `incident` (with `"incident": "storm"`, an entry in `story.json`) |
| `after` | visits that must be done first. A place opens when its first visit's `after` is met |
| `goal` | finishes "Return to the Halt: …" on the map and the rail |
| `tasks` | `op` is one of `story.json` `ops`. With `target`: the id of a prop, region or lamp in the scene (a `plant` target is a planter prop, usually from this visit's own restoration layer; add `"colour"` to replant in a colour). Without: `litter` or `weeds` with a `count`, the `zones`/`edges` to use and the `items` allowed |
| `effects` | the restoration layers this visit completes. Every layer must be completed by exactly one visit |
| `restores` | exactly one visit per place: the place counts as restored after it |
| `todo` / `stage` | what the map says is left, and the place's stage afterwards |
| `improved` / `reaction` | the rail's "what improved" and the resident's words |
| `tutorial` | the first visit only: coached, no job cards |
| `finale` | the last visit: every other visit must lead to it through `after` |

Rules the validator enforces:

- the graph has no cycles, nothing unreachable, and the finale needs every
  other visit;
- every target exists and suits its job; an incident uses only its allowed
  jobs and debris, and makes no permanent change;
- every restoration layer is made once; every place has one `restores` visit;
- played in route order, every visit places every task for 25 seeds, and none
  of its tasks is already done by an earlier visit.

Good visits are short (five to seven jobs), mix a few kinds of work, and
include at least one change that's obvious at the whole-scene view. The first
three should be very clear: big, foreground, high-contrast targets. Harder
visits come from variety and looking, not from tiny distant things.

## 5. Check and tune

```sh
npm run validate      # broken references, missing art, the visit graph, every visit generated
npm test              # the route played through, resume, migration
npm run bot           # every visit in route order + thousands of photo walks: fairness and timing
npm run economy       # the route simulator: first postcard, third place, whole story
node tools/bot/tune.mjs   # optional: re-fit photo-walk tiers and stamp thresholds
```

**The bot** fails a visit or a walk if a job can be completely covered by
others, sits under an overlay, spoils something restored for good, or breaks
an incident's allowlist; walks are also held to their tier's time target.

**The route simulator** plays the whole story with the real rules and reports
the first action, first postcard, third place and total story time, next to
the handover's starting targets (about 20–30 s, 1.5–2.5 min, 8–12 min and
25–40 min). Its players are quicker than real ones: confirm with people.

## 6. Play it

Run `npm run dev` and open http://localhost:5173.

The QA harness (`node tools/qa/shots.mjs <scenario>`) screenshots flows on a
844×390 landscape phone viewport. `story` plays the opening; `gallery` shows
every scene on a photo walk in a different weather at Tier 5 (set `TIER` to
change it); `fixes` shows every job's animation. Most scenarios use
Honeycombe's visit ids, so copy them for a new pack.
