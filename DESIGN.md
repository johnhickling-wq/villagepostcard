# Postcard Perfect — Game Design

> A cosy, touch-only hidden-object game. Tidy pretty villages until they are
> picture-perfect, snap the postcard, and slowly restore each village until it
> wins **Best-Kept Village**.

This document is the source of truth for *why* the game works the way it does.
The numbers here are the shipped defaults. They live in `content/common/*.json`
and `content/villages/<id>/village.json`, and the balance bot (`npm run bot`)
checks them.

---

## 1. Pillars

1. **Every tap transforms.** You don't just *find* things, you *fix* them. Each
   fix is a small, satisfying animation: a sign swings level, a door floods with
   fresh paint, a window squeaks clean, a lantern blooms warm.
2. **Cosy, never punishing.** No fail state, no energy, no ads, no countdown that
   ends a scene. Pressure is optional: it only affects your score and stamps.
3. **You are building something.** Mess is temporary; *restoration is
   permanent*. Every session leaves the village visibly lovelier and the album
   fuller.
4. **Systems, not hand-authoring.** Every scene is a clean plate. Code generates
   the mess, so every fault's hitbox is known, every scene can be finished, and
   no two plays are the same. New villages are *data*, not code.

## 2. Fiction and tone

Somewhere between the 1930s and the 1960s, in a Britain of bunting, branch lines
and village fêtes. You are the new roving photographer for the **Wold & Vale
Postcard Company**. Your first assignment is **Honeycombe-on-the-Wold**, a
honey-stone Cotswold village that has entered the county's *Best-Kept Village*
competition and let itself go a bit.

The fiction explains the economy. Your postcards sell in the village post office,
and the money goes into the **Village Fund**. The Committee spends the Fund on
**restoration projects**. Restoration makes the village prettier, and prettier
villages make better postcards. At the end come the judges and the rosette. Then the Postcard
Company posts you your next assignment (the next paid village).

The tone is warm, gently funny and British. The cast say things like
"Splendid!", worry about the judges, and never have a crisis bigger than a
wonky sign.

The art is flat cut-paper collage, like a 1950s picture book made from coloured
paper: calm areas of colour, hand-cut edges, paper grain and tiny shadows where
layers overlap. Everything in a scene is paper, so the things you fix belong in
it rather than sitting on top. The UI borrows from ephemera: postage stamps,
luggage labels, railway tickets, rosettes, cork noticeboards.

## 3. The session loop (60–120 seconds)

The game is played in **landscape** on a phone. Scenes are 2:1, the shape of a
phone held sideways, and fill the whole screen. Everything else floats over the
picture, small and out of the way, as in phone hidden-object games:

- a thin bar of **jobs** along the top, over the sky, each with a tool icon and
  a count (Sweep up 3, Straighten 1…). It names what to *do*, never which object
  to look for, and it is the only tally: there is no total counter. Tapping a
  job names it and, if the loupe is charged, shows you one;
- pause in the top-left corner; score and clock in one small pill top-right,
  once they have been introduced;
- the loupe and flashbulb in the bottom-right corner.

`content/common/hud.json` lists these areas as fractions of the scene. The mess
generator never places anything to find under them, and the bot checks it. On a
portrait-locked phone the game turns its own stage sideways.

```
Village map ──► pick a scene (pinned postcard)
      ▲             │  preview: the next postcard (its weather), the album slots
      │             ▼
      │        TIDY THE SCENE  ── tap faults to fix them; combos; hints
      │             │
      │             ▼  last fix ► "Hold still…" ► shutter ► flash
      │        POSTCARD PRINTS ── before/after wipe, stamp + postmark
      │             │
      │             ▼
      │        REWARDS ── what it raised for the Fund, the jar filling towards the next project
      │             │
      └──── "What next?" nudge: a project you can now afford, a new scene, a finished request
```

A play is a complete, satisfying unit, so it doesn't need an energy timer to end
the session. It ends on a *payoff* (the postcard) followed by a *pull* (the next
thing you can nearly afford).

### 3.1 Faults (what you fix)

Each fault type is a code transform applied to the clean plate. Fixing it
reverses the transform with an animation. Fault types are defined in
`content/common/faults.json`.

| Fault | Mess (code) | Fix (animation) | Target |
|---|---|---|---|
| **Litter** | sprite dropped in a ground zone, depth-scaled, rotated | pops up, spins, shrinks into a sparkle | ground zones |
| **Weeds** | weed sprite at a wall base or path edge | plucked upward with a dirt puff | edge zones |
| **Crooked** | prop rotated about its pivot | swings back with a damped spring and a *click* | tiltable props |
| **Toppled** | standing prop tipped 70–95° | hops upright and squashes, then settles | standing props |
| **Faded paint** | region desaturated, lightened, flaked | a brush sweep floods the colour back | doors, benches, postbox… |
| **Grimy window** | procedural grime layer clipped to the region | wiped in three strokes, then a glint | windows |
| **Wilted flowers** | planter browned, desaturated, drooped | perks up with a bounce and a burst of petals | flower props |
| **Unlit lamp** | (dusk/fog only) glass dark, no glow | the glow blooms and flickers warm | lamp points |
| **Cobweb** | procedural web in a corner | swept away in a swirl | window/door corners |
| **Pigeon** | bird sitting on a perch | flaps off out of frame | perch points |

**Marmalade the cat** hides somewhere in every scene. She is optional: finding her
is a bonus and a small delight (meow, hop away).

**Collectibles** sometimes appear as a glinting object hidden in the scene. They
are optional, and tapping one collects it for the scrapbook.

### 3.2 Scoring

- **Per fix:** `base(type) × (1 + 0.6 × subtlety) × comboMultiplier`.
  Subtlety runs from 0 (obvious) to 1 (very subtle), so subtle faults are
  worth more.
- **Combo:** each fix within the combo window (3.0 s at Tier 1, falling to
  2.2 s at Tier 5) raises the chain. The multiplier is `1 + 0.2 × (chain − 1)`,
  capped at ×3. Call-outs appear at 3/5/7/10/13: *Lovely! · Splendid! ·
  Smashing! · Marvellous! · Picture Perfect!* The chime climbs a pentatonic
  scale with each link.
- **Mis-tap:** −20 points (never below 0) and the combo breaks. Three mis-taps
  inside 1.5 s trigger **Shaky Hands**: the camera wobbles and taps are ignored
  for 2 s. This stops tap-spamming without ever blocking progress.
- **Time bonus:** `max(0, par − seconds) × 8`. Par comes from the bot (§8).
- **Bonuses:** Marmalade +250, collectible +150, no hint used +10%.
- **Stamps (1–3), from the fifth postcard on:** finishing always earns 1 stamp.
  2 and 3 stamps need `score ≥ 0.89 × ref` and `score ≥ 0.974 × ref`, where
  `ref` is the expected score of a skilled player, computed per play from the
  actual generated faults, so every play is graded fairly, whatever mess you
  got. `node tools/bot/tune.mjs` sets these so about 30% of plays by the
  simulated average player earn 3 stamps.

### 3.3 Hints: earned, never bought

- **Loupe** (free, always there): highlights one remaining fault. It recharges
  within the scene (20 s at Tier 1 → 40 s at Tier 5; photographer perks shorten
  this).
- **Flashbulb** (consumable): a camera-flash pop that outlines every remaining
  fault for 2.5 s. Earned from level-ups, requests, sets and the daily streak.
- **Idle nudge** (Tiers 1–2 only): after a quiet spell, a faint glint appears
  near a remaining fault.

## 4. Difficulty

Difficulty is a vector, and each part is generated by code:

| Lever | How it's applied |
|---|---|
| Fault count | 7 → 16 |
| Type mix | new types unlock with tiers (e.g. cobwebs, pigeons from Tier 3) |
| Subtlety | smaller tilt angles, lighter fade, fainter grime, smaller litter, litter colour close to the ground under it |
| Condition | fog lowers contrast with depth; dusk darkens and adds unlit lamps; after the storm adds storm debris and toppled props |
| Target size | tiny targets (needing pinch-zoom) are only allowed from Tier 4 |
| Help | idle nudges only at Tiers 1–2; the loupe recharges more slowly as tiers rise |

### 4.1 Five postcards per scene

Each scene has five postcards to take, one per weather, each a step harder.
(In the code and below, a postcard's number is its *tier*.)
Taking one fills its album slot and moves the scene on to the next. There is no
separate prize to earn: a new postcard *is* the progress, and it always comes
from *finishing*, never from stamps, so a cosy player is never stuck. Stamps are
the optional mastery layer: they raise more for the Fund and make the album
shinier.

| Postcard | Name | Weather | Faults | Subtlety | Target time |
|---|---|---|---|---|---|
| 1 | Snapshot | Clear Day | 6–7 | 0.00–0.25 | ~40 s |
| 2 | Holiday Snap | Golden Hour | 9–10 | 0.10–0.40 | ~55 s |
| 3 | Portrait | Misty Morning | 8–10 | 0.10–0.40 | ~70 s |
| 4 | Exhibition | Dusk | 12–13 | 0.24–0.59 | ~85 s |
| 5 | Picture Perfect | After the Storm | 14–15 | 0.47–0.82 | ~100 s |
| ∞ | Free Play | any | 12–16 | 0.08–0.53 | ~90 s |

The third postcard has the same count and subtlety as the second: mist is the
hardest weather to see through, so the weather itself is that step.

A scene with all five postcards is **Mastered**: its album page gets a gold
frame, and replays become Free Play, which still raises money and XP and still
counts for requests and the daily.

The difficulty ramp within a village comes from each scene's `difficultyOffset`
(later scenes add up to +1 fault and +0.08 subtlety). The ramp across packs
comes from each village's `difficultyBase`, so pack two starts a notch above
pack one.

### 4.2 Conditions

Conditions are defined in `content/common/conditions.json`. Each one is a colour
grade, an overlay effect, ambient life, and changes to the fault mix.

- **Clear Day:** neutral light, butterflies and swallows.
- **Golden Hour:** warm, low-contrast light that makes faded paint harder to
  spot; motes of pollen.
- **Misty Morning:** layered drifting fog with contrast falling off with depth;
  dew glints.
- **Dusk:** deep blue grade, windows glow, fireflies and a bat. Lamps become
  faults.
- **After the Storm:** wet, saturated grade with puddle glints and drips. Storm
  debris joins the litter, and toppled and crooked props become more common.

Each (scene × condition) pair is an **album slot**, so conditions are also a
collection.

## 5. Progression: the hook

These are proven hidden-object-game hooks, each adapted to the cosy,
energy-free format.

| Proven hook (source) | Postcard Perfect version |
|---|---|
| Scene mastery stars (June's Journey) | 5 **postcards** per scene, one per weather |
| Meta-decoration (Homescapes, June's Journey island) | **Restoration projects** that permanently beautify scenes and the map |
| Chapter/star gates | Scenes unlock via an **access project** paid from the Fund |
| Collections with set bonuses | **Scrapbook** sets with flavour text; set rewards are cosmetics |
| Task list / "what's next" | **The Committee Letter**: always one clear next goal |
| Orders from characters (Township) | **Noticeboard requests** from recurring villagers |
| Daily login calendar and streaks | **Daily Postcard**: a seeded, same-for-everyone scene, plus a 7-day stamp card |
| Account level | **Photographer level**: perks, cosmetics and titles that carry across villages |
| Completionism | **Album** slots per scene × condition, plus Mastered gold editions |
| Variable reward | collectible drops, Marmalade, combo peaks |
| Energy timers (**removed**) | replaced by natural session ends: every play finishes on a payoff |

### 5.1 Currencies (deliberately few)

- **The Village Fund** (soft currency). Every postcard raises money for it, as
  do requests, sets and the daily. The Committee spends it on restoration
  projects, which is the only real sink. The Fund is never sold. It has no coin
  name: it is shown as a jar and a number.
- **Postcards** (progress, not spendable). Five per scene, 40 per village. They
  fill the album; the Fund, not postcards, pays for new scenes.
- **Flashbulbs** (consumable hint). Earned only.
- **XP → photographer level**, account-wide.

### 5.2 Restoration: "mess is temporary, restoration is permanent"

Each scene starts in a slightly *tired* state:

- a cool, desaturated grade;
- a few "neglected" regions (a faded door, a bare planter spot).

Neglect uses the same transforms as faults, but it is persistent and can't be
tapped away.

**Restoration projects** (defined in `village.json`) are paid for from the Village Fund. Each one:

- removes neglect (the same fix animation plays, but this time it is
  permanent);
- adds restoration props (hanging baskets, bunting, a bench, a bird bath,
  window boxes) that appear in every future play of that scene;
- warms the scene's grade (the scene's `bloom` rises);
- adds a sticker to the village map and raises **Village Bloom %**.

Every scene also has an **access project** ("Clear the lane to the High Street")
that unlocks it. Its cost forms the village's pacing curve.

The restoration moment is staged. The camera pans to the scene, the change
happens live with sparkles and a chime, and the Colonel reacts. It's the "I built
this" beat.

### 5.3 Honeycombe pacing

| # | Scene | Access project | Cost |
|---|---|---|---|
| 1 | Honeycombe Halt | (start) | 0 |
| 2 | The High Street | Sweep the Station Lane | 80 |
| 3 | The Village Green | Mend the Green's Gate | 280 |
| 4 | Weavers' Row | Clear the Riverside Path | 420 |
| 5 | The Old Mill | Free the Mill Race | 590 |
| 6 | The Bee & Bramble | Clear the Brambles on Pub Lane | 730 |
| 7 | St Aldhelm's | Oil the Lychgate | 870 |
| 8 | Rose Cottage | Prune the Rose Arch | 830 |

There are two beautification projects per scene (16 in all, 170–860 each).
**Best-Kept Village judging** opens when every project is done (100% "ready for
the judges"). The economy sim (`npm run economy`) puts a typical player at
about 70 plays, or about 2 hours, to the ceremony, never more than about 6
plays between projects. By then they have taken every postcard. That's
generous for a free village and short enough to finish.

The Fund raised per postcard is `[60, 75, 95, 115, 140]` by postcard number,
× `[1, 1.2, 1.5]` for stamps once they are introduced, plus bonuses. The
Committee Letter on the map always names one next step: a project the Fund can
pay for ("tap it on the map"), or how much more to raise and which postcard to
take next.

### 5.4 Villagers and the Noticeboard

Seven recurring villagers each have a portrait, a voice and a home scene.

- **Colonel Rupert Whitby**, chair of the Best-Kept Village committee.
  Pompous, kind, owns a lot of tweed. Gives the Committee Letter goals.
- **Mrs Edna Pemberton**, postmistress. Knows everything first.
- **Albert Figg**, stationmaster. Loves his milk churns.
- **Mabel Tuck**, landlady of the Bee & Bramble. Loud laugh, big heart.
- **The Reverend Hollis**, vicar. Cyclist, cake enthusiast.
- **Nan Honeysett**, beekeeper at Rose Cottage. Talks to her bees.
- **Percy Budd**, postman. Always cycling past, always late.

Requests are **self-contained** (no serialised plot) and are *generated* from
templates in `content/common/requests.json` against what the player has
unlocked. Examples: "Polish 6 windows on the High Street", "Find Marmalade
twice", "Take a Dusk postcard anywhere", "Hit a ×6 combo", "Get 3 stamps at
the Old Mill". Three slots are always active, and a fresh request arrives
the moment one is finished (no timers). Rewards are money for the Fund, XP and sometimes a
flashbulb or a guaranteed collectible. Each villager has **friendship hearts**
(5 levels). Levelling up unlocks a short letter from them (a flavour vignette)
and a villager-themed postage-stamp cosmetic.

### 5.5 Scrapbook collectibles

Honeycombe has six sets of five items (30 in all), each with a line of flavour
text:

- *Pressed Flowers of the Wold*
- *Railway Ephemera*
- *Village Fête*
- *Wold Wildlife Cards*
- *Honeybee Treasures*
- *Curios from the Attic*

**Drops:** each play has a 35% chance of spawning a hidden collectible, rising by
20% after each dry play (pity timer). The item is chosen from the scene's
tagged sets, weighted towards ones you're missing. Duplicates are sold for 15
for the Fund.

**Set completion:** 250 for the Fund, XP, and a cosmetic (a postcard frame or a
postmark design).

### 5.6 Daily Postcard and streak

- Once per day there is a scene with a fixed condition and seed. Everyone gets
  the same mess on the same date (seed = `YYYY-MM-DD`).
- It plays at Tier 3 difficulty, adjusted for the player's progress, and only
  uses scenes they have unlocked.
- **Stamp card:** a 7-day cycle rewarding 40 → 60 → 80 → 1 flashbulb → 120 →
  150 → a guaranteed collectible plus 200.
- Missing a day resets the streak, unless you hold a **Second-Class Stamp**
  (earned at photographer levels 4, 9, 14…), which spends itself automatically
  to protect the streak.
- Daily postcards file into a **Daily Diary** page in the album.

### 5.7 Photographer level (account-wide)

XP per play is `30 + 4 × faults + 15 × stamps`, plus requests and sets. The
curve is `xpToNext(L) = 80 + 45 × (L − 1)`.

Titles: Hobbyist → Keen Amateur → Weekend Snapper → Village Photographer →
Postcard Maker → County Correspondent → Society Photographer → By Royal
Appointment.

Rewards arrive every level:

- flashbulbs;
- **perks**: loupe recharge −10% (L3, L7, L12) and an extra flashbulb slot;
- **cosmetics**: film looks for postcards (Sepia L5, Hand-Tinted L8, Kodachrome
  L11, Cyanotype L15), postcard frames, postmarks and album covers;
- Second-Class Stamps.

The level is shared across all villages, so it carries into paid packs as sunk,
continuing progress.

### 5.8 The album

The album is the trophy cabinet, a scrapbook with one page per scene:

- one slot per condition, each holding your best postcard in that condition,
  with its stamps;
- a Mastered gold edition slot;
- set pages for the collectibles;
- the Daily Diary.

Postcards are stored as *seeds*, not images. The before and after pictures
re-render deterministically at any time, so the save stays tiny. Tap a postcard
to flip it: the back has a handwritten note generated from templates ("Dear
Aunt Vera, the Old Mill was a picture this morning…").

## 6. First-time experience: one idea at a time

Players are not assumed to know games. The game starts as one easy thing and
adds one new idea per postcard, each shown at the moment it matters, with one
obvious next step. Nothing is on screen before it has been introduced.
`content/common/intro.json` holds the whole schedule (counted in postcards
taken), so a new pack can change it without code.

1. **Cold open (≤ 20 s).** Title, then tap. A train whistle, and two short
   letters set up the fiction: postcards raise money for the Village Fund, and
   the Committee wants the village fit for the judges.
2. **The tutorial: Honeycombe Halt, one scripted mess of five things**, and
   only two jobs: Sweep up and Straighten. No score, no clock, no combo, no hint
   buttons. A pointing finger shows the first litter, then the crooked sign,
   then the bar at the top: "Now find the rest!"
3. **The first postcard.** Shutter, flash, print, before/after wipe, then just
   one thing: what it raised for the Village Fund, and a jar filling towards
   the first project.
4. **The map** shows only the Halt and the next place to open. The Colonel
   explains where the money goes and points at "Sweep the Station Lane", which
   the Fund can already pay for. The restoration plays and the High Street
   opens. The Committee Letter at the bottom always names one next step.
5. **Then, one per postcard** (the numbers are postcards taken):

   | When | New | How it arrives |
   |---|---|---|
   | 1 | Repaint | a "new job" card before the clock starts |
   | 2 | Clean; the album | job card; a "Something new" card on the map, the Album button appears |
   | 3 | Water; Marmalade the cat | job card; she simply appears, and a toast names her when found |
   | 4 | The loupe | the button appears, and the coach points at it once |
   | 5 | Weed; score, clock and stamps | job card; the coach points at the score, the first stamps are explained |
   | 6 | Photographer level | a card on the map; the level badge appears |
   | 7 | Stand up; combos | job card; the first combo is explained |
   | 8 | The Noticeboard | a card on the map; its button appears |
   | 9 | Keepsakes | the first one is guaranteed |
   | 10 | The Daily Postcard | a card on the map; its button appears |
   | 11 | Flashbulbs | the button appears, and the coach points at it once |
   | 12 | The Travel Office | a card on the map; its button appears |

   Jobs the schedule doesn't list (cobwebs, pigeons, lamps) arrive with their
   postcard's weather or tier, each with the same "new job" card. At most one
   "Something new" card is shown per visit to the map.

## 7. Monetisation and converting the free village

- **Honeycombe is free and complete.** It's roughly 2½ hours to Best-Kept
  Village, and infinite free play and dailies afterwards. It is never
  paywalled mid-way.
- **Further villages are cheap non-consumable packs** (£1.99 each, or a
  "Grand Tour" bundle). There are no ads, no energy and no consumable
  purchases, so App Store review is simple and the store is honest.

What makes the free village convert:

1. **Emotional payoff first.** The Best-Kept Village ceremony is a real ending
   (rosette, certificate postcard, the whole village on the green). The ask
   comes after the player feels good, never before.
2. **Carry-over progress.** Photographer level, perks, cosmetics and the album
   continue into the next village. Buying a pack *continues* your game rather
   than starting a new one.
3. **Visible, specific desire.** The Travel Office (map corner) shows the next
   village as a railway poster from day one. The album has its empty pages. At
   50% Bloom, Percy delivers a postcard *from* Porthkennack Cove.
4. **Low friction, fair price.** One tap on a ticket-style button showing the
   price. "Restore Purchases" is always visible.
5. **The free village stays alive.** Dailies and requests keep going in
   Honeycombe after the ceremony, so lapsed players keep returning to a place
   where the next pack is one tap away.

## 8. Systems that guarantee fairness

- **Mess generator** (`src/core/mess.js`): deterministic from
  `(scene, tier, condition, seed, restoration)`. It places faults in authored
  *slots*: ground zones, edge zones, perches, props and regions. It enforces
  spacing, overlap and minimum on-screen size, and scores each fault's
  **salience** (size × contrast × subtlety × condition visibility).
- **Headless bot** (`tools/bot`): plays thousands of generated scenes with a
  perception model. The chance of noticing a fault each second is based on its
  salience, and taps are imperfect. It verifies that:
  - every fault is reachable;
  - no two hit areas overlap ambiguously;
  - each tier lands in its target time band;
  - the economy has no walls.
  
  It writes `tools/bot/report.md` and the per-tier **par** table that scoring
  uses.

## 9. Adding a village

See `docs/ADDING_A_VILLAGE.md`. In short, a village is:

- a folder of JSON (village, scenes, villagers, collectibles);
- an art manifest (prompts) that the art pipeline turns into plates and sprites
  via OpenRouter;
- per-scene slot annotations (zones, regions, props, lamps, perches).

No engine code changes. The validator and the bot sign it off.
