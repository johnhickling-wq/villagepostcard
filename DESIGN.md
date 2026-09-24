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

The fiction explains the economy. Your postcards sell in the village post office
and earn **pennies**. The villagers put those pennies into **restoration
projects**. Restoration makes the village prettier, and prettier villages make
better postcards. At the end come the judges and the rosette. Then the Postcard
Company posts you your next assignment (the next paid village).

The tone is warm, gently funny and British. The cast say things like
"Splendid!", worry about the judges, and never have a crisis bigger than a
wonky sign.

The art is hand-made paper collage: torn edges, gouache, screen-print grain,
wobbly ink. The UI borrows from ephemera: postage stamps, luggage labels,
railway tickets, rosettes, cork noticeboards.

## 3. The session loop (60–120 seconds)

The game is played in **landscape** on a phone. The scene fills the full
height of the screen between two slim rails: score, time, combo and hint
tools on the left, and what is left to tidy on the right. Holding the phone
upright shows a "turn your phone sideways" card.

```
Village map ──► pick a scene (pinned postcard)
      ▲             │  preview: tier, condition, rosettes, best stamps
      │             ▼
      │        TIDY THE SCENE  ── tap faults to fix them; combos; hints
      │             │
      │             ▼  last fix ► "Hold still…" ► shutter ► flash
      │        POSTCARD PRINTS ── before/after wipe, stamp + postmark
      │             │
      │             ▼
      │        REWARDS ── pennies roll up, XP bar, rosette, collectible, requests ticked
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
- **Stamps (1–3):** finishing always earns 1 stamp. 2 and 3 stamps need
  `score ≥ 0.55 × ref` and `score ≥ 0.8 × ref`, where `ref` is the expected
  score of a skilled player, computed per play from the actual generated faults.
  Every play is therefore graded fairly, whatever mess you got.

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

### 4.1 Scene mastery tiers

Each scene has five tiers. Finishing a play at a tier earns that tier's
**rosette** and advances the scene. Rosettes always come from *finishing*, never
from stamps, because a cosy player must never be stuck. Stamps are the
optional mastery layer: they pay more and make the album shinier.

| Tier | Name | Faults | Subtlety | Conditions | Target time |
|---|---|---|---|---|---|
| 1 | Snapshot | 7–8 | 0.00–0.25 | Clear Day | ~40 s |
| 2 | Holiday Snap | 9–10 | 0.10–0.40 | Clear Day, Golden Hour | ~55 s |
| 3 | Portrait | 11–12 | 0.25–0.55 | Golden Hour, Misty Morning | ~70 s |
| 4 | Exhibition | 13–14 | 0.40–0.75 | Dusk, After the Storm | ~85 s |
| 5 | Picture Perfect | 15–16 | 0.55–0.90 | any special condition | ~100 s |
| ∞ | Free Play | 12–16 | 0.40–0.85 | random | — |

A scene that has passed Tier 5 is **Mastered**: its album page gets a gold
frame, and replays become Free Play, which still pays pennies and XP and still
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
| Scene mastery stars (June's Journey) | 5 tiers per scene, **rosettes** |
| Meta-decoration (Homescapes, June's Journey island) | **Restoration projects** that permanently beautify scenes and the map |
| Chapter/star gates | Scenes unlock via **rosettes + an access project** |
| Collections with set bonuses | **Scrapbook** sets with flavour text; set rewards are cosmetics |
| Task list / "what's next" | **The Committee Letter**: always one clear next goal |
| Orders from characters (Township) | **Noticeboard requests** from recurring villagers |
| Daily login calendar and streaks | **Daily Postcard**: a seeded, same-for-everyone scene, plus a 7-day stamp card |
| Account level | **Photographer level**: perks, cosmetics and titles that carry across villages |
| Completionism | **Album** slots per scene × condition, plus Mastered gold editions |
| Variable reward | collectible drops, Marmalade, combo peaks |
| Energy timers (**removed**) | replaced by natural session ends: every play finishes on a payoff |

### 5.1 Currencies (deliberately few)

- **Pennies** (soft currency). Earned from every play, requests, sets and the
  daily. Spent on restoration projects, which is the only real sink. Pennies are
  never sold.
- **Rosettes** (progress, not spendable). One per scene tier, 40 per village.
  They gate scene access.
- **Flashbulbs** (consumable hint). Earned only.
- **XP → photographer level**, account-wide.

### 5.2 Restoration: "mess is temporary, restoration is permanent"

Each scene starts in a slightly *tired* state:

- a cool, desaturated grade;
- a few "neglected" regions (a faded door, a bare planter spot).

Neglect uses the same transforms as faults, but it is persistent and can't be
tapped away.

**Restoration projects** (defined in `village.json`) cost pennies. Each one:

- removes neglect (the same fix animation plays, but this time it is
  permanent);
- adds restoration props (hanging baskets, bunting, a bench, a bird bath,
  window boxes) that appear in every future play of that scene;
- warms the scene's grade (the scene's `bloom` rises);
- adds a sticker to the village map and raises **Village Bloom %**.

Every scene also has an **access project** ("Clear the lane to the High Street")
that unlocks it. Its cost and rosette requirement form the village's pacing
curve.

The restoration moment is staged. The camera pans to the scene, the change
happens live with sparkles and a chime, and the Colonel reacts. It's the "I built
this" beat.

### 5.3 Honeycombe pacing

| # | Scene | Access project | Cost | Rosettes needed |
|---|---|---|---|---|
| 1 | Honeycombe Halt | (start) | 0 | 0 |
| 2 | The High Street | Sweep the Station Lane | 80 | 1 |
| 3 | The Village Green | Mend the Green's Gate | 220 | 3 |
| 4 | Weavers' Row | Clear the Riverside Path | 380 | 6 |
| 5 | The Old Mill | Free the Mill Race | 520 | 9 |
| 6 | The Bee & Bramble | Re-hang the Pub Sign | 650 | 12 |
| 7 | St Aldhelm's | Oil the Lychgate | 800 | 15 |
| 8 | Rose Cottage | Prune the Rose Arch | 950 | 18 |

There are two beautification projects per scene (16 in all, 150–900 pennies
each). **Best-Kept Village judging** opens at **100% Bloom and 24 rosettes**.
The economy sim (`npm run bot -- --economy`) puts a typical player at about
55 plays, or about 2½ hours, to the ceremony. That's generous for a free
village and short enough to finish.

Income per play is `tierBase [60, 75, 95, 115, 140] × stampMult [1, 1.2, 1.5]`
plus the bonuses. Early projects are always affordable after one or two plays,
and later ones after about three. The sim flags any "wall" where the next goal
needs more than four plays.

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
the moment one is finished (no timers). Rewards are pennies, XP and sometimes a
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
tagged sets, weighted towards ones you're missing. Duplicates convert to 15
pennies.

**Set completion:** 250 pennies, XP, and a cosmetic (a postcard frame or a
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

## 6. First-time experience (the first 10 minutes)

1. **Cold open (≤ 20 s).** Title, then tap. A train whistle, the paper scene
   slides in, and a letter from the Postcard Company sets up the fiction in one
   card. Everything is skippable.
2. **Tutorial scene: Honeycombe Halt, Tier 1, scripted seed**, six faults:
   - a pointer on a crisp packet → tap → the big satisfying pop;
   - a pointer on a crooked sign: "Some things just need a nudge";
   - "Find the rest!", with the tray explained in one line;
   - the first combo gets a call-out and a one-line explanation;
   - if the player is idle for 8 s, the loupe is introduced.
3. **The first postcard.** This is the wow moment: shutter, flash, print, and
   before/after wipe. Rewards include a level-up (2) inside the first two
   minutes.
4. **The map.** Colonel Whitby says the Station Lane is a disgrace. The first
   access project costs 80 and the player has about 100, so they build straight
   away. The restoration animation plays and the High Street unlocks.
5. **Progressive disclosure.** The Noticeboard opens after play 2. The album
   opens after the first postcard. The Daily Postcard opens after play 3.
   Collectibles are guaranteed in play 2. No screen shows more than one new
   idea at a time.

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
