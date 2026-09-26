# Postcard Perfect — Game Design

> A cosy, touch-only restoration game. Put a tired village to rights one
> short visit at a time, see each improvement stay done, take the postcard,
> and win **Best-Kept Village**.

This document is the source of truth for *why* the game works the way it does.
The numbers here are the shipped defaults. They live in `content/common/*.json`
and `content/villages/<id>/`; `npm run validate`, `npm run bot` and
`npm run economy` check them. Timings are simulated-player hypotheses until
human playtests confirm them (see §9).

The restoration update (September 2026, `docs/RESTORATION_HANDOVER.md`)
replaced the earlier earn-and-spend design. **Do not reintroduce** a currency
that opens places or buys restoration, a roughly two-hour main progression, or
weather tiers as the main restoration structure.

---

## 1. Pillars

1. **Every tap transforms.** You don't just *find* things, you *fix* them. Each
   fix is a small, satisfying animation: a sign swings level, a door floods with
   fresh paint, a window squeaks clean, flowers grow in an empty tub.
2. **What you fix stays fixed.** Restoration is permanent. A later visit, a
   storm, a reload or a fortnight away never undoes paint, repairs or planting.
3. **Always one clear next step.** After every visit the player can answer:
   What improved? Who is pleased? Where am I going next?
4. **The scene, the task and the touch agree.** If something looks like today's
   work, it is. Tomorrow's work is either staged when its visit comes or answered
   with a friendly word, never a penalty.
5. **Cosy, never punishing.** No fail state, no energy, no ads, no timer that
   ends a scene, nothing sold inside a play. Story visits have no score at all.
6. **Systems, not hand-coding.** Every scene is a clean plate. Visits are data
   that name stable things in the scene and a job to do to them; new villages
   are data and art, never code.

## 2. Fiction and tone

Honeycombe-on-the-Wold, a honey-stone Cotswold village, spring 1957. You are
the Wold & Vale Postcard Company's roving photographer. The village has entered
the county's **Best-Kept Village** competition and let itself go a bit. The
residents ask for your help, place by place, and every visit ends with a
postcard of what you put right.

The opening is one sentence: *"Help Honeycombe look its best before the village
judges arrive."* Then the stationmaster meets you on the platform. Longer
letters live in the journal, to read if you like.

The tone is warm, gently funny and British. The cast say things like
"Splendid!", worry about the judges, and never have a crisis bigger than a
wonky sign. The period is 1957: the colour request is for "a village
celebration", not a royal occasion that didn't happen that year.

The art is flat cut-paper collage, like a 1950s picture book made from coloured
paper. Everything in a scene is paper, so the things you fix belong in it
rather than sitting on top. The UI borrows from ephemera: postage stamps,
railway tickets, rosettes, cork noticeboards.

## 3. A visit (about 1–2 minutes)

The game is played in **landscape** on a phone. Scenes are 2:1 and fill the
screen; on a squarer tablet they are letterboxed, with the place's name in the
margin. On a portrait-locked phone the game turns its own stage sideways.

```
Map: the ribbon names one next step ("Visit the Village Green")
      │  (or tap any place for its visit, its postcards, an optional photo walk)
      ▼
The resident's request, in the scene: who, what and why, in a sentence
      │  a new job gets a one-line card the first time it appears
      ▼
PUT IT RIGHT — tap each job; the bar along the top counts them down
      │  stuck? the free loupe is offered; tomorrow's work gets a friendly word
      ▼  every fix is saved at once
The last fix: the result is SAVED, then the reveal
      │  the whole scene wipes from how it was to how it is now;
      │  the visit's permanent work arrives live (paint, flowers, bunting, warmer light)
      ▼
The shutter: the postcard's border forms around the picture
      │  a shallow rail: the resident's reaction, what improved,
      │  "4 of 8 places restored", and one big named Next button
      ▼
Next visit (or the map when a new place has opened)
```

The play screen is the full-screen scene with small overlays:

- a thin bar of **jobs** along the top, each with its tool and a count (Sweep up
  3, Repaint 2…). It names what to *do*, never which object;
- pause in the top-left corner (with the request and what's left to do);
- the **loupe** in the bottom-right, once it has been offered;
- on a photo walk only: score and clock top-right, and the flashbulb.

`content/common/hud.json` lists these areas as fractions of the scene. Nothing
to find is ever placed under them, and the bot checks it. A story visit's hint
corner is narrower than a walk's (`hud.story`).

### 3.1 Visits

A visit is authored in `content/villages/<id>/visits.json`:

| Field | Meaning |
|---|---|
| `id`, `scene`, `kind` | stable id; the place; `restoration`, `committee` (a Committee request) or `incident` (e.g. after a storm) |
| `after` | the visits that must be done first: the story is a small graph |
| `villager`, `title`, `goal`, `brief` | who asks, the visit's name, the phrase for "Return to the Halt: *plant the tubs*", and the request in their words |
| `condition` / `incident` | the light it's played in; an incident names an entry in `content/common/story.json` |
| `tasks` | the jobs: `{id, op, target}` for a stable prop/region/lamp, or `{id, op, count, zones/edges, items}` for litter and weeds |
| `effects` | the permanent restoration layers it completes (scene `restoration[].effect`) |
| `restores` | this visit marks its place restored |
| `todo`, `stage` | what the map says is still to do here, and the place's stage after it ("First tidy complete") |
| `improved`, `reaction` | the rail's "what improved" line and the resident's reaction |
| `tutorial`, `finale` | the coached first visit; the last visit before the judging |

Operations (`story.json` `ops`) are the existing jobs plus **plant**. Seeded
variation is limited to where litter and weeds land, chosen from the task's
own items and ground. There is no random fallback: a storm brings only storm
work, a colour request only its planting.

### 3.2 Jobs (what you fix)

Each job is a code transform applied to the clean plate. Fixing it reverses
the transform with an animation. Jobs are defined in
`content/common/faults.json` (the code calls them faults).

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
| **Plant** | (story only) an empty planter: fresh soil and a seed packet | the flowers grow up out of the soil; with a colour, the old ones sink and the new colour rises | planter props |

**Marmalade the cat** hides somewhere in every scene. She is optional: finding her
is a bonus and a small delight (meow, hop away).

**Collectibles** sometimes appear as a glinting object hidden in the scene. They
are optional, and tapping one collects it for the scrapbook.


**Marmalade the cat** hides in most visits (from the third on). Finding her is
an optional delight.

### 3.3 Touch that makes sense

- **No penalties in the story.** A tap on nothing is a quiet ring. There is no
  lockout ("Shaky hands" is gone) and no score to lose.
- **Tomorrow's work** (a faded thing whose visit hasn't come) gets a speech
  bubble from the resident: *"That window's on my list for another day."*
  (scene `neglect[].later`). Tapping something already fixed is ignored.
- **Target assistance.** Small things are tappable over at least 44 CSS px
  (`story.assist.minTargetPx`, converted by the view's scale), and the nearest
  thing always wins, so a large hit area never steals a neighbour's tap.
- **Zoom** (pinch or double-tap) is taught the first time something small is
  left to find, with a spread-fingers cue and a "Whole scene" button to return.
- **Photo walks** keep their mild score: −20 for a mis-tap, never below 0.

### 3.4 Hints: free, offered, never gating

The **loupe** is free in every visit and points at a real remaining job
(including the last one). It appears the first time it's needed: after
`story.hints.offerAfter` (12) seconds without progress it is offered gently,
and after `clearerAfter` (26) seconds more clearly. Its cooldown in a visit is
four seconds. Tapping a job in the bar shows you one of that kind. Neither
hints nor speed ever affect the story. On photo walks the loupe recharges more
slowly by tier, and **flashbulbs** (earned from levels, favours and the daily)
outline everything left.

### 3.5 Completion is the reward

1. The last fix commits the result to the save **before** anything else, so a
   reload during the ceremony keeps it and a second commit changes nothing.
2. The HUD leaves; the whole scene is shown at its natural aspect ratio.
3. A wipe goes from the visit's *before* to *after*; the permanent work arrives
   live as it passes and the camera holds on the restored place.
4. The shutter: the picture becomes a postcard, its border forming around it.
5. The rail: the resident, "The High Street restored!", their reaction, what
   improved, the eight-dot "places restored" milestone and **Next: Visit the
   Village Green**. Compare (before/after), Details (jobs, time, hints) and Map
   are small secondary buttons; keepsakes and level-ups wait as chips.

Any tap skips ahead. The main sequence takes about four seconds. With **Reduce
motion** (Settings; it starts from the device's preference) the wipe becomes a
crossfade, the card fades in without moving, and there is no flash, shake or
confetti. On a phone the rail sits beside the postcard; on a squarer tablet it
runs beneath it.

### 3.6 Game feel

- **A fix:** a warm glow and a burst sized for the screen, a 45 ms hit-stop and
  a small shake (not with reduced motion), a sound with a little random pitch,
  and the job's tool flies in an arc to its place in the bar.
- **Sound:** every sound is levelled to a target loudness
  (`tools/qa/scenarios/mix.mjs`). Audio unlocks on the first touch and resumes
  after a phone call or the lock screen. Nothing essential is sound-only.

## 4. The restoration journey

### 4.1 Places, stages and the next step

Each place has a **stage** (the latest finished visit's `stage`, e.g. "First
tidy complete") and a **to-do** (the next unfinished visit's `todo`, e.g.
"Flowers to plant, tubs to water"). It is **restored** when its visit marked
`restores` is done. "3 of 8 places restored" is the village's progress, on the
map, the rail and the journal. A storm never lowers it.

The **next step** is always the first available visit in `visits.json` order,
named concretely: "Visit the Village Green", "Return to the Halt: plant the
tubs", "Committee request: Dress the street for the fête". It is the map's
ribbon and the rail's big button. Other available visits can be played from
their place on the map; any order reaches the finale (the tests check).

Places open because the story reaches them: the first visit at a place is
available when its prerequisites are done. Nobody pays to walk up a public
street.

### 4.2 Honeycombe's route

| # | Visit | Place | Kind | What changes, visibly |
|---|---|---|---|---|
| 1 | Tidy the platform | Halt | restoration | litter gone, signs and clock straight (coached) |
| 2 | Brighten the High Street | High Street | restoration | the faded kiosk and pillar box repainted Post Office red |
| 3 | Spruce up the Green | Village Green | restoration | the Market Cross scrubbed, a bench painted, litter gone |
| 4 | Plant the station tubs | Halt | restoration | shelter painted, window polished, three tubs planted, pots, baskets and trolley |
| 5 | Paint the Weavers' doors | Weavers' Row | restoration | doors painted, window boxes, a trough planted, bunting |
| 6 | Clear the mill race | Old Mill | restoration | doors painted, ford cleared, a garden with bench and hive |
| 7 | Dress the street for the fête | High Street | committee | basket and trough planted, the board reads FÊTE TODAY, bunting |
| 8 | Spruce up the pub garden | Bee & Bramble | restoration | door and gate varnished, baskets planted, festoon lights |
| 9 | Make the Green flourish | Village Green | restoration | tubs watered and planted, duck house, bird bath, bunting |
| 10 | Restore the churchyard | St Aldhelm's | restoration | clock gleaming, door and gate painted, trough, bench |
| 11 | Clear up after the storm | Old Mill | incident | branches, twigs and slates cleared, sacks and barrel righted; paint untouched |
| 12 | Nan's cottage garden | Rose Cottage | restoration | hives painted, greenhouse cleaned, gate painted, set for tea |
| 13 | Red, white and blue tubs | Halt | committee | the tubs replanted in the celebration's colours, bunting |
| 14 | Final preparations | Village Green | committee (finale) | the board reads JUDGING TODAY; then the judging |

The Halt and the Green have three visits; the High Street and the Mill two;
four places one. Visits run five to seven jobs.

### 4.3 Permanent, current, incident and historical state

- **Permanent** (`villages[vid].effects`, `.fixed`): restoration layers done,
  and things a story task restored for good. Never regresses.
- **Current visit** (`villages[vid].progress[visit]`): its plan (seed, content),
  the tasks done, the cat, keepsake, hints and time. Saved after every fix, so a
  reload carries on exactly; `save.active` says what was on screen.
- **Incident**: disposable mess named by `story.json` `incidents`, with its
  allowed operations and debris. Completing it leaves no permanent change.
- **Historical postcards**: an immutable render description of that moment
  (the faults, and the permanent state before and after). See §6.1.

Photo walks and the daily are generated with the permanent state and never
spoil it: anything restored for good is protected (`protectedTargets`), and a
storm walk excludes paint.

### 4.4 Weather and Committee requests

Weather is an authored incident layered on the restored village, triggered at
a story milestone and explained in a sentence ("What a night! … Don't worry,
dear: the paint held."). It uses cheap props (branches, twigs, leaves, slates,
knocked-over things) and never touches permanent work. Offline time never
decays the village.

Committee requests have a resident, a place, a reason, visible requested work
and a visible result; they're pinned on the noticeboard (with their postcard
once done). The colour request uses the existing tubs: `plant` with a `colour`
recolours only the flowers (`story.json` `planters` separates flowers from
container), and a text label ("Red!") names each colour so it is never
colour-only.

### 4.5 The finale

The final visit leads to **Judging Day**: the judges tour all eight places,
each shown as it was when you arrived (the first visit's own before-picture)
wiping to how it stands now, drawn from the actual restored state, with a word
from its resident. Then the rosette, the Colonel's letter and the Editor's.
The screen ends on **Stay in Honeycombe**, with the Travel Office as a quieter
second choice. The village keeps its finished state; the journal can replay
the judging.

## 5. Optional activities (never required)

Nothing here gates the story; the route simulator plays to the judging with
none of it.

### 5.1 Photo walks and weather postcards

From the third visit, any visited place can be photographed on a **photo walk**:
a generated mess (the original tier system) scored with stamps, in one of five
weathers, filling that place's five weather-postcard slots in the album. They
are tuned with `node tools/bot/tune.mjs`:

| Postcard | Name | Weather | Target time (simulated average player) |
|---|---|---|---|
| 1 | Snapshot | Clear Day | ~40 s |
| 2 | Holiday Snap | Golden Hour | ~55 s |
| 3 | Portrait | Misty Morning | ~70 s |
| 4 | Exhibition | Dusk | ~85 s |
| 5 | Picture Perfect | After the Storm | ~100 s |
| ∞ | Free Play | any | ~90 s |

Walks only use jobs the story has taught, plus weather jobs it doesn't teach
(cobwebs, pigeons, unlit lamps). Scoring: `base × (1 + 0.6 × subtlety) ×
comboMultiplier`, runs of quick fixes ("3 in a row"), a time bonus against par,
and 1–3 stamps set so about 30% of simulated average plays earn three.

### 5.2 Weather

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
  A storm never brings faded paint (`exclude` in `conditions.json`).

Each (scene × condition) pair is an **album slot**, so conditions are also a
collection.


### 5.3 The Daily Postcard

One photo walk a day, the same for everyone (seeded by date), at a place you've
visited. Each day played adds a stamp to a 7-day card (experience, a flashbulb,
a keepsake). **There is no streak to lose**: a missed day costs nothing.

### 5.4 Favours and friends

Three optional favours from the neighbours at a time on the noticeboard, for
experience and sometimes a flashbulb or keepsake; friendship hearts bring
letters (kept in the journal).

### 6.2 Scrapbook keepsakes

Honeycombe has six sets of five items (30 in all), each with a line of flavour
text:

- *Pressed Flowers of the Wold*
- *Railway Ephemera*
- *Village Fête*
- *Wold Wildlife Cards*
- *Honeybee Treasures*
- *Curios from the Attic*

**Drops:** each visit (after the first few) and each photo walk has a 35% chance of spawning a hidden collectible, rising by
20% after each dry play (pity timer). The item is chosen from the scene's
tagged sets, weighted towards ones you're missing. Duplicates go in the
scrapbook as spares.

**Set completion:** experience and a cosmetic (a postcard frame, film or
postmark design).


### 5.5 Photographer level

Experience from visits (60 + 5 per job), walks (20 + 3 per job, more for
stamps), favours, sets and the daily. `xpToNext(L) = 100 + 90 × (L − 1)`.
Rewards: flashbulbs, loupe-recharge perks for walks, and postcard cosmetics
(films, frames, postmarks). Level-ups wait as a chip on the rail.

## 6. The journal and the album

The **journal** tells the restoration story: one page per place with its stage,
to-do and the postcard of every visit (tap for before/after and the note on the
back), plus the village's letters. The weather postcards, scrapbook and Daily
Diary are separate tabs, clearly optional. Empty slots say "Still to come",
never "missing".

### 6.1 Postcards that never change

A postcard is re-rendered, never stored as an image. Every new postcard (render
version 2) stores its own faults and the permanent state before and after, so
later restoration can't change it. Album cards from save version 2 keep their
old description (a seed and a project list) and are redrawn by the legacy
generator path with the restoration-update layers left out and the frozen
tier table (`tiers-legacy.json`); `tools/test/legacy.test.mjs` proves they are
unchanged. The cache key includes the village and a hash of the whole entry.

## 7. First-time experience: one idea at a time

`content/common/intro.json` holds the schedule, counted in finished visits and
walks:

| After | New | How it arrives |
|---|---|---|
| 0 | tidying, straightening; the loupe; zoom | the coached first visit; the loupe is offered when you stall; zoom when something small is left |
| 1+ | each new job (repaint, clean, plant, water, weed, stand up) | a one-line card the first time a visit uses it |
| 1 | the journal | a card on the map |
| 2 | Marmalade; runs | she simply appears; a word the first time |
| 3 | photographer level; photo walks | cards on the map |
| 4 | keepsakes | the first is guaranteed |
| 6 | the noticeboard | a card on the map |
| 8 | flashbulbs (walks) | the coach points at it once |
| 9 | the Daily Postcard | a card on the map |
| finale | the Travel Office | after the judging |

At most one card per visit to the map. A player coming from save version 2
sees one "Honeycombe has changed" card instead.

## 8. Commerce

- **Honeycombe is free and complete**: a whole restoration story, the judging,
  then photo walks, dailies and favours for as long as you like.
- **Further villages** will be one-off purchases, offered only after the free
  village has finished emotionally, with "Stay in Honeycombe" always the first
  choice. No ads, no energy, nothing sold inside a play.
- **Today** the Travel Office shows the other villages honestly as *In
  preparation*, with no buy buttons. Selling one needs finished content and a
  real purchase/restore/entitlement flow: see `docs/RELEASE_BLOCKERS.md`.

## 9. Systems that check the design

- **Validator** (`npm run validate`): the visit graph (cycles, unreachable
  visits, anything the finale doesn't require), unknown targets and
  operations, incident allowlists, every layer made once, every place with one
  `restores` visit, and every visit generated in route order over 25 seeds.
- **Tests** (`npm test`): the whole route, random orders (no stranding), resume
  after reload, idempotent completion, permanent work surviving later visits,
  the storm and walks, the colour request, save migration from version 2 (fresh,
  part-restored, judged and collector saves; repeatable), legacy postcards.
- **Bot** (`npm run bot`): every visit in route order and every walk tier on
  fresh, half and fully restored villages: tappable, unambiguous, clear of the
  overlays, nothing protected spoilt; simulated times.
- **Route simulator** (`npm run economy`): story moments and optional content,
  reported separately.

Starting hypotheses from the handover, to test with 5–8 first-time players:

| Moment | Target | Simulated (average player) |
|---|---|---|
| First meaningful action | 20–30 s | see `tools/bot/economy.md` |
| First postcard | 1:30–2:30 | 〃 |
| Third place open | ≤ 8–12 min | 〃 |
| A later visit | 1–2.5 min | 〃 |
| Story to the judging | 25–40 min | 〃 |
| Optional content | 60–90 min+ | 〃 |

The simulated players are quicker than real first-timers. If playtests show the
story is short, give later visits more (data only); don't pad the early ones.

## 10. Adding a village

See `docs/ADDING_A_VILLAGE.md`. A village is a folder of JSON (village, scenes,
visits, villagers, collectibles), art made by the pipeline, and per-scene slot
annotations. No engine code changes; the validator, tests and bot sign it off.
