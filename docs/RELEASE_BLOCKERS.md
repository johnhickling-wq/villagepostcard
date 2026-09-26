# Before a release

What stands between this build and the App Store, kept separate from the
gameplay (which is complete in the repository: see `DESIGN.md`). Everything
here needs access, people or devices that a development session doesn't have.
Update it as items are done.

Last reviewed: 26 September 2026, after the restoration update.

## 1. Purchases (blocker for selling any village)

Status: **not implemented**, deliberately. The Travel Office shows the other
villages as "In preparation" with no buy, pre-order or restore buttons, so the
build never pretends to sell something.

Needed before a village can be sold:

1. **The village itself**, finished: plates, sprites, `visits.json`, villagers
   and keepsakes, passing `validate`, `npm test` and `bot`
   (`docs/ADDING_A_VILLAGE.md`). Porthkennack, Glenbrae and Saint-Amour are
   posters only today.
2. **A store integration** in the iOS wrapper (StoreKit, e.g. through a
   Capacitor plugin), for one-off non-consumable products. The product ids are
   in `content/villages/index.json`.
3. **An entitlement path** in the game: `save.purchases` already survives
   migration; loading a purchased pack needs `loadContent` to include packs the
   player owns, not just `"playable": true` ones.
4. **Tested outcomes**: success, cancellation, failure, interrupted
   fulfilment (app killed mid-purchase), and Restore Purchases on a new device
   and after reinstalling.
5. **The offer**: after the free village's finale only, with "Stay in
   Honeycombe" first; show what the next village offers (atmosphere, people,
   its restoration problems) and its one-off price. No bundle of unfinished
   villages.

## 2. Devices (blocker for release; not possible in a cloud session)

Checked here: desktop Chromium with phone viewports (667×375, 844×390),
a 4:3 tablet viewport (1024×768) and the rotated portrait stage (390×844), by
screenshots and scripted taps. A frame takes about 0.4 ms on desktop Chromium.
**No physical device has been used.**

To do on real devices (the handover's matrix):

| Surface | Check |
|---|---|
| Compact phone (about 667×375) | targets, text and the Next button fit with browser chrome and safe areas |
| Typical phone (about 844×390) | thumb reach, zoom and pan, tap accuracy on the smallest jobs, the reveal and map |
| Larger phone | space is used without moving controls away from the thumbs |
| Landscape tablet (4:3, about 1024×768) | letterboxing feels intentional, text readable, controls not tiny |
| Portrait-locked phone | the rotated stage: taps, drags, hint pointers, safe areas, sheets |
| Release devices (Safari / the native wrapper) | audio unlock and resume after a call or lock, haptics, memory, frame pacing, save recovery |

Also: one-handed and two-thumb play; fingers covering targets; lock,
background and return mid-visit and mid-reveal (the save is written after
every fix and before the reveal, but test it); reduced motion (Settings, and
the iOS setting); play with sound and haptics off.

The effective target size needs measuring on devices: the game keeps small
jobs tappable over at least 44 CSS px (`story.json` `assist.minTargetPx`),
which is a design target, not a guarantee in native points.

## 3. People (blocker for tuning; not possible in a development session)

All timings are from simulated players (`tools/bot/economy.md`,
`tools/bot/report.md`). The simulator currently predicts a story of about
15–16 minutes of play for its average player, shorter than the handover's
25–40 minute hypothesis; real first-time players are slower than the
simulation, so this needs measuring before anything is added.

Run a small formative round (5–8 first-time players like the audience,
including people who rarely play games). Observe without coaching. Record:

- time to the first action, the first postcard and the third place;
- repeated taps on the wrong thing, and what they were;
- long stalls, and whether the loupe offer was noticed and used;
- whether zoom was found when needed;
- confusing transitions (reveal, map, next step);
- the whole story's length, and where people chose to stop.

After the first few visits ask "What changed?" and "What would you do next?".
Tune `visits.json` (jobs per visit, which things, subtlety) and
`story.json` (hint timing) from what you see; the validator and bot keep it
fair.

## 4. Art

No new art was needed for the restoration update: every visit uses existing
plates and sprites. Planting splits the existing planter sprites into
container and flowers in code, and recolours the flowers for the colour
request. Possible improvements, none blocking:

| Asset | Where | Why | Reuse |
|---|---|---|---|
| A cut-paper "plant" tool icon | the job bar (`faults.json` `plant.actionArt`) | the bar uses the flower-tub sprite, which reads well but isn't a tool | every village |
| Hand-made flower-cluster sprites in a few colours | planters | the code-recoloured flowers are convincing at play size; bespoke art would be richer up close | every planter and colour request |
| A few more storm props (a fallen fence panel, a blown-over sign board) | incidents | more varied storm visits | every village |

## 5. Known limitations of this build

- The Old Mill's wheel does not turn; no visit implies it does.
- Mowing and structural repair are not job types; no visit uses them.
- There is one incident (the storm) and three Committee requests (the fête,
  the red, white and blue tubs, and the final preparations). More optional
  post-story requests could reuse the same data.
- A save that cannot be read is kept aside (`postcard-perfect/save/unreadable`)
  and the player can choose the backup or a new village; there is no in-game
  way to export or import a save.
