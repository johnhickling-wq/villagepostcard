# Postcard Perfect: restoration and commercial polish handover

Prepared 26 September 2026. Product: Postcard Perfect. Repository: [johnhickling-wq/villagepostcard](https://github.com/johnhickling-wq/villagepostcard), reviewed at commit [`d385548`](https://github.com/johnhickling-wq/villagepostcard/tree/d385548a543a5aa73b0e373f0503bb35b3f070bc).

## 1. The change to make

Make the main game about **permanently restoring a village, one satisfying visit at a time**. Each visit should have an understandable purpose, obvious and fair interactions, a visible improvement, a beautiful postcard and one clear reason to continue.

The existing game has useful foundations: attractive scenes, lively residents, deterministic content, touch and zoom support, restoration overlays, postcard rendering and a judging finale. Preserve these. The main problem is that progression and visual feedback do not consistently support the player's understanding of what they are doing.

The owner has agreed to replacing the earn-and-spend Village Fund progression. This brief supersedes the earlier review and existing design instructions **where they prescribe currency-gated areas, the approximately two-hour main progression, or weather tiers as the main restoration structure**. Update `DESIGN.md`, the relevant project instructions and `docs/ADDING_A_VILLAGE.md` alongside implementation so future work does not reintroduce the old rules. Retain unrelated architecture, testing, asset and git instructions.

This is a developer handover, not a report of implemented changes. No gameplay code was changed during this review.

### Owner-agreed direction

- Restore the whole village towards a rewarding communal finale, then offer another village as a one-off purchase.
- Remove spending Village Fund money to open areas or purchase the main restoration steps. Access follows actual work and residents' invitations. Do not replace money with another compulsory token currency.
- Revisit existing locations for different, believable jobs. Permanent improvements survive later visits.
- Use five content themes as appropriate: tidying/cleaning; painting/refreshing; gardening; mending/repairing; preparing for judging. Every location does not need all five.
- Include occasional weather aftermath and committee requests as reasons to return. A storm can scatter litter or topple a pot; it must not strip yesterday's paint or reset completed repairs.
- Give the completion transformation the full scene area before presenting the postcard. The small comparison postcard is not a sufficient main reward.
- Design first for a small phone held in landscape, and separately check landscape tablets.
- Reuse backgrounds and small overlays. Do not make the plan depend on generating a new full scene for each visit.

### Proposed defaults to test

The 14-visit route below, exact timings, task counts, hint delays and allocation of events are implementation starting points, not settled business evidence. Begin with one authored storm return and two committee requests in the free village. Tune from human playtests; do not pad the game to reach a quota.

## 2. What the review established

The earlier live session reached the point where Village Green, the third location, could be played. Four postcards were completed, including revisits. An attempted station revisit was abandoned with one cleaning task remaining. Village Green itself was not played. That session used a desktop browser viewport, not physical phone or iPad touch testing. Its duration is not a reliable human completion-time measurement. Audio, haptics, battery use and device performance remain unverified.

The repository review covered progression, session generation, rendering, onboarding, results, saves, requests, purchasing and the relevant validation tools. The findings below distinguish confirmed implementation from interpretation.

| Finding | Evidence in the reviewed code | Consequence |
|---|---|---|
| The grey phone box and postbox really are misleading | `high-street.json` marks `kiosk` and `postbox` as persistent `faded` neglect until project `hs-paint`. `mess.js` excludes these from ordinary repaint selection. | The player's sensible taps are rejected while a less obvious repaint target is required. Fix the interaction contract, not merely the hint wording. |
| The station window was misdiagnosed in the earlier review | `railway-halt.json` marks `win-left` as persistent `grimy` neglect until `halt-paint`. It is not an ordinary clean-window target. | Retract the claim that this particular window demonstrates a broken hitbox or impossible level. The original remaining target and seed were not recovered. The misleading visual remains a real usability defect. |
| Hints exist, but arrive late | `intro.json` exposes the loupe after four completed plays and the zoom coach after six. Zoom gestures already work earlier. | A struggling beginner may leave before being shown the tools intended to help. |
| Completion has an automatic comparison already | `postcard.js` sweeps after → before → halfway, inside the postcard. `results.js` simultaneously builds the tally. | Enlarge and refocus the existing reward. Do not describe this as a completely missing animation. End on the finished scene, not a half-dirty comparison. |
| Result typography is objectively tiny | `styles/layout.css` uses 6.5px stamp labels, 8.5px mastery labels and 12.5px tally text. Results split the screen into photo and a scrolling side panel. | Removing secondary information is more valuable than squeezing more into this layout. |
| The current main loop is an economy grind | `sceneUnlocked`, `buyProject`, `nextGoal` and `judgingReady` depend on purchased projects. `nextGoal` chooses the first unfinished eligible project in data order. | The suggested objective can send the player back to station upgrades instead of towards a new area. Replace this with explicit story milestones. |
| Existing balance has a different commercial aim | The committed `tools/bot/economy.md` estimates 71 plays and 2.0 hours to judging, using simulated players and assumed menu time. | This is a model, not observed retention data. It should not remain the target for the shorter free introduction. |
| Weather does not currently restrict tasks to plausible aftermath | `conditions.json` changes fault weights. A storm can still generate faded paint, grime, weeds and wilted plants. | A storm request needs an explicit allowed task set and authored context, not just the current storm condition. |
| Requests are currently generic counter goals | `requests.json` and progression generate goals such as counts, weather, speed and hints, with money/XP rewards. | Reuse the residents and noticeboard presentation, but add authored scene objectives and visible consequences. Renaming existing counters is insufficient. |
| Completed progress is saved, active work is not checkpointed | `PlaySession` keeps unfinished work in memory; the persistent save has no current visit. `finishPlay` saves the result after the completion animation sequence. | A phone interruption can lose current work. Introduce resumable visits and save the successful completion before running its ceremony. |
| Purchasing is a preview | `travel.js` explicitly displays a preview modal instead of processing a purchase. Other packs are not loaded as playable villages. | Commercial release requires finished purchasable content and a real entitlement flow, or honest coming-soon presentation. |

Focused read-only Node checks also confirmed:

- Across 100 clear-day tier-three seeds per scene, the station's neglected grime and High Street's neglected paint were never selected as matching ordinary cleaning/repainting faults. Cobwebs could still use station window regions; that does not make the underlying grime cleanable.
- Across 100 fully restored High Street storm seeds at tier five, the generator produced 127 faded-paint faults as well as other non-storm-specific work. This supports using a separate event task policy.
- Hint and zoom-coach availability follows the thresholds above.
- Buying every project makes judging available even with no postcards. There is no direct “collect all 40 weather postcards” finale requirement; that album total is an outcome of the existing simulated economy, not the actual gate.

The full validator, build, fairness bot and device suite were not rerun for this read-only review. Existing reports must not be represented as newly passed tests. The bot tests generated targets and geometry; it does not determine whether a human will reasonably mistake decorative neglect for a target.

## 3. Make every tap understandable

The central rule is: **the scene, the task description and the response to touch must agree**.

On the High Street, “Repaint” combined with two conspicuously faded red street objects practically instructs the player to tap those objects. Withholding them behind a separate project is unfair. Make repainting them actual playable restoration work. Likewise, polishing the visibly dirty station window should directly change that window and remain done afterwards.

Use these rules throughout the content:

1. If a conspicuous defect belongs to the current visit, make it actionable. Rendering, task counts, hints and hit testing must use the same task definitions.
2. Do not prominently display a later job with the same visual treatment as today's targets. Stage it when its visit becomes available, or represent it as a clearly different future improvement, such as an empty space for a flower tub.
3. Where a future object is still plausibly tappable, give one short, friendly contextual response without a penalty. This is a fallback, not permission to fill scenes with false targets.
4. Do not enforce arbitrary tool modes. A mixed restoration visit can include rubbish, a sign and a flower bed if its purpose is clear. The five themes are authoring choices, not five restrictive screens.
5. First-visit tasks must be identifiable at the default phone view. Increase contrast, simplify silhouettes and choose foreground positions. More difficulty should come from variety and observation, not near-invisible distant pixels.
6. Reserve actual on-screen UI exclusion areas, including captions and safe areas. Test after camera movement and in the rotated stage. Enlarged hit areas must not steal nearby targets.

The live play also found a wrapper blending into flowers, a subtle crooked basket, and a ticket sign that initially resembled litter. Review those visual distinctions. Do not assume increasing invisible hitboxes alone fixes recognition.

Keep the existing screen-space tap-tolerance approach in `play.js`; it already converts tolerance using the view scale. Measure the effective target size on devices rather than blindly changing scene-unit constants. As a project target, provide approximately 44×44 CSS-pixel control hit areas, with sensible non-overlapping assistance for scene objects. This is a design target, not a claim that CSS pixels and native device points are interchangeable.

Remove the “Shaky hands!” lockout from introductory story play. Exploration should not feel like failure. If score penalties remain in optional mastery, make them mild and do not punish a zoom gesture, pan, completed object or plausible future job.

Provide a free hint from the first scene. After roughly 10–15 seconds without progress, gently offer it; after a longer stall, make the offer clearer. A hint should direct the eye to a real remaining task and remain available for the final task. Teach zoom when it is useful, with a short gesture cue and a visible “Whole scene” reset. Neither hint use nor speed should gate story completion.

## 4. The restoration journey

The opening message can be one readable sentence: “Help Honeycombe look its best before the village judges arrive.” Let the stationmaster introduce the first action in the scene. Move longer letters into an optional journal.

After a visit, the player should be able to answer: What improved? Who is pleased? Where am I going next?

Completing the station's first jobs earns the stationmaster's introduction to the High Street. Completing the High Street's first visit leads to the Green. When a physical obstruction really needs fixing, the player fixes it in a visit; they do not buy permission to enter a public street.

Show one primary next destination, named concretely: “Visit the Village Green” or “Return to the Halt: plant the tubs”. The map can offer other available work after the opening, but the player must never need to compare currencies or search menus to find the next story step.

Use “3 of 8 places restored” or another clear village milestone measure. A first postcard need not mean that location is fully restored. Show location stages such as “First tidy complete” and “Flowers still to plant”, then mark it restored when its authored restoration work is done. A temporary storm must not reduce the permanent restoration count.

### A provisional 14-visit route

This example uses the existing eight locations, with some visited once and others two or three times. It demonstrates variety; adjust tasks to the actual art and test results. Existing paid project effects should be mapped into this route, combined where necessary, so reducing visits does not leave conspicuous unfinished areas in the final village.

| Visit | Location | Purpose and visible reward |
|---|---|---|
| 1 | Railway Halt | Five obvious tidy/straighten actions. A welcoming platform and first postcard. Introduction to the High Street. |
| 2 | High Street | Clean and refresh the street, including the clearly faded kiosk and postbox. Strong red accents make the improvement obvious. |
| 3 | Village Green | First cleanup, accessible path and a visibly more inviting communal space. Establish the village-wide goal. |
| 4 | Railway Halt | Refresh the shelter, polish its window and establish flower tubs. The original tidy state is preserved. |
| 5 | Weavers' Row | Refresh doors and plant window boxes. One coherent, substantial transformation can complete this location. |
| 6 | Old Mill | Clear the race and mend an existing small feature. Use existing scene objects where possible; do not imply new wheel animation is already available. |
| 7 | High Street | Committee request: prepare the street for the village fête, adding bunting and a display. |
| 8 | Bee and Bramble | Tidy and refresh the pub garden, with repairs and lights where supported by the scene. |
| 9 | Village Green | Garden and finish benches or pond features. Make the social centre visibly flourish. |
| 10 | St Aldhelm's | Clean and refresh the churchyard, clock and planting, selecting tasks that read clearly on a phone. |
| 11 | Old Mill | Brief storm aftermath: blown-in litter/branches, a crooked sign or toppled pot. Earlier paint and repairs remain intact. |
| 12 | Rose Cottage | Garden and complete the cottage's final restoration features. Give this visit a strong visual transformation. |
| 13 | Railway Halt | Committee request: change the established flower tubs into a red, white and blue display for a village celebration. |
| 14 | Village Green | A short final preparation visit, then the judging ceremony and completed village view. |

The station and Green have three visits; High Street and Mill have two; four locations have one. Do not force the same sequence onto every location or make “one visit” mean an exhausting checklist.

Honeycombe is explicitly set in 1957. Check event wording against that setting before using the owner's illustrative “King's birthday” request. A village celebration provides the intended colour challenge without changing the established period. Seasonal references, weather and the existing spring judging dialogue also need to agree.

### Duration and repeat appeal

Use these as initial hypotheses:

| Moment | Starting target |
|---|---|
| First meaningful action | Within 20–30 seconds of starting |
| First postcard | Approximately 90–150 seconds from starting |
| Third location available | Approximately 8–12 minutes or sooner; do not insert filler to delay it |
| Typical later visit | About 1–2.5 minutes, with a shorter storm interlude |
| Free main story and judging | Approximately 25–40 minutes across short sessions |
| Optional exploration and collection | Enough worthwhile content for 60–90 minutes or more for interested players |

The main story should feel complete. Optional weather photography, keepsakes, resident favours and mastery can extend it without postponing the finale. Do not make 48 empty album slots look like compulsory work. Separate the restoration journal from optional collection progress and preserve existing collected cards.

The reason to keep playing should be a visible next improvement, affection for the residents and curiosity about the next place. Vary visit rhythm and transformation scale. Avoid repeating identical tasks with higher counts, relying on daily streak pressure, or making previously completed beauty disappear to manufacture work.

## 5. Weather and committee requests

Weather is an authored incident layered onto the restored village. Trigger it at a chosen story milestone, explain it in a sentence, and keep it brief. It should create a different-looking task set using inexpensive props: a branch across the path, scattered leaves, litter, a skewed hanging sign, toppled portable pots. Restoring a pot to its previous state is different from destroying a permanent repair.

Use explicit allowed tasks per incident. Selecting `condition: storm` is not enough. Never use offline elapsed time to decay the village. A player returning after a fortnight should feel welcomed, not punished. Optional later incidents must be opt-in and must not lower the permanent completion state.

Committee requests should have a resident, a place, a reason, visible requested work and a visible final result. “Make the station tubs red, white and blue for the celebration” is stronger than “plant six flowers anywhere”. Reuse existing planter positions; use tintable flower layers or small flower-cluster variants, not a fresh background.

Keep planting simple: a clearly marked bed or tub, a contextual action, and immediate planting feedback. A colour request does not require an inventory or a complex arrangement editor. Explicit colour labels/patterns should complement colour so the objective is not colour-only.

Do not introduce five new gesture systems at once. Start with the existing tap-to-fix language. Mowing, planting and structural repair are not all currently implemented primitives; add only the small operations needed for authored content. A mowing interaction needs a convincing cut-grass change if used, not a generic sparkle over unchanged lawn.

For story requests, rewards are the new display, a resident reaction and a postcard. Keep extra score/cosmetic rewards secondary. Call them “Committee requests”, not competitive challenges. The two example requests can be included in the main route; additional post-story requests can remain optional.

## 6. Make completion the reward

Replace the crowded two-column results sequence with a scene-first sequence:

1. On the final action, commit completion safely and remove the gameplay HUD.
2. Show the full scene at its natural aspect ratio. Automatically reveal the visit's before and after using a clear wipe or dissolve, without requiring a gesture. Allow enough time to notice the change and finish on the restored scene.
3. Take the photograph, then introduce the postcard border around the image. Do not shrink the image immediately to make room for a tally.
4. Show one short resident reaction and the name of what improved. Offer one prominent named next destination.
5. Put score breakdown, optional comparison and replay in secondary controls. Provide skip/continue so repeat players can move on promptly.

An approximately 3–5 second main reward sequence is a useful prototype, not a fixed timer. Reduced motion should use a calm crossfade/static comparison and suppress flash/confetti. Do not make the next button wait through separate XP, stamp, collection and letter ceremonies.

On a phone, give the scene most of the available width and use a shallow caption/button rail. On a tablet, preserve readable controls and allow breathing room; do not stretch everything to tablet width or make controls tiny because the scene is large. Use the existing local-coordinate and rotated-stage helpers rather than new viewport assumptions.

As starting typography targets, use roughly 16–18 CSS pixels for essential explanatory text and 18–22 for the primary action, then inspect on devices. Decorative postmarks may be smaller because they carry no essential instruction. Maintain contrast and do not place required text over busy artwork.

Every visit needs enough visual change to justify its postcard. Include at least one improvement that is obvious at the default scene view. For the village finale, compare the original village with the fully restored village, celebrate residents' contributions and let the player revisit the finished places. The existing judging tour can be reused, but it currently selects highest-scoring album cards, which may depict earlier restoration states. Render the actual final state for the finale rather than assuming a best-score postcard is the finished place.

## 7. Implementation approach and file map

Keep the DOM-free core, renderer, content packs and current framework. Introduce authored visits and persistent restoration state without hard-coding Honeycombe rules into the engine.

| Area | Existing files to inspect/change | Required outcome |
|---|---|---|
| Progression | `src/core/progression.js`; village content | Visit prerequisites and restoration milestones replace spending gates and five-tier story progression. Finale checks required restoration work, not fund totals or optional collection. |
| Visit content | `content/villages/honeycombe/village.json`; `scenes/*.json`; new pack-local visit definitions if helpful | Stable visit/task/entity IDs, prerequisites, reason, allowed actions, persistent effects, completion copy and next recommendation. |
| Task generation | `src/core/mess.js`; `content/common/faults.json`, `conditions.json` | Explicit story tasks and event allowlists, with seeded variation only where appropriate. A random fallback must not insert repainting into a storm or unrelated work into a colour request. |
| Persistent rendering | `src/render/sceneView.js`; scene `neglect`/`restoration` | Render permanent completed work plus the active visit's changes and temporary incident layer. Preserve existing effects wherever possible. |
| Interaction and onboarding | `src/core/session.js`; `src/ui/screens/play.js`; `content/common/intro.json` | Fair touch response, early hints/zoom guidance, no introductory lockout, clear counts and resumable task state. |
| Completion and navigation | `src/ui/flows.js`; `screens/results.js`, `map.js`, `judging.js`; `components/postcard.js`; `styles/layout.css` | Full-scene reveal, readable reward, named next action, map progress and final-state judging tour. |
| Requests | `progression.js`; `screens/noticeboard.js`; request and villager content | Authored visible scene requests, scoped by village, with clear availability and completion. Existing generic goals remain optional only if useful. |
| Saves and album | `src/engine/storage.js`; `progression.js`; `src/render/stills.js`; album screen | Versioned migration, active visit resume, idempotent completion and stable historical postcards. |
| Settings | `src/ui/components/settings.js`; animation/audio call sites | Working reduced-motion control. The save already contains a `reducedMotion` field, but that alone does not implement the feature. |
| Validation and authoring | `tools/validate.mjs`; `tools/bot/*`; `tools/qa/*`; `docs/ADDING_A_VILLAGE.md` | Validate visit graphs, targets, effects and task policy; model the new route; add relevant device scenarios. |

### Minimum data contract

A visit needs a stable ID, village/scene ID, kind (`restoration`, `incident` or `committee`), prerequisites, short resident brief, tasks, completion effects and reward/next-step copy. Each task needs a stable target, operation, visible before/after state and matching hit geometry. Final field names are an implementation choice.

Keep these concepts separate:

- **Permanent scene state:** repaired, painted, planted and installed entities. It must not regress when a new task set is generated.
- **Current visit state:** seed/content version, completed task IDs, temporary changes, hint state, active play time and collected items. This supports exact resume.
- **Incident state:** disposable mess introduced by a named event. Completing the incident removes its layer without resetting permanent work.
- **Historical postcard state:** an immutable description of the scene at that visit, independent of later restoration or gardening changes.

Do not use freshly generated `f0`, `f1` identifiers as permanent scene entity identities. Seeded task instances can retain generated IDs within a saved visit, but persistent effects must address stable content IDs.

During an unfinished visit, render completed task changes from the checkpoint. Commit the visit's final permanent effects once on completion. An interrupted or resumed session must not lose those completed actions, re-award collectibles or accidentally apply an effect twice. Save a stable completion receipt/visit ID and make repeated finish calls harmless. Save before playing the results animation; the animation is presentation, not the transaction.

The existing `script` field is a list of fault types, not an exact target-by-target restoration script. Extend or complement it for authored tasks rather than assuming it can already specify “paint this postbox” or “plant this tub”.

### Reuse the art economically

Inventory each scene's existing regions, props, restoration additions and final-state effects before commissioning anything. Existing desaturation/grime overlays, rotation, prop addition/removal, flowers, bunting and lighting give a strong starting set.

Budget new work around reusable pieces: a few branches, leaf clusters, damaged/repaired variants where required, and flower colours that can be reused across planters. Separate recolourable flowers from the container so a committee request does not recolour the whole pot or background.

Prove the first three scenes using existing art wherever possible. Record any genuine missing asset with its scene, purpose and reuse opportunities. Do not launch a large art-generation run as a prerequisite to proving the new game loop.

### Save migration and historical cards

The current save is version 2. Add an explicit migration to the next schema; do not reuse the old pre-release reset behaviour.

- Preserve settings, existing area access, purchased restoration effects, judged status, cosmetics, keepsakes, collected postcards and any entitlements.
- Map old project IDs to equivalent new permanent effects and completed visit milestones. A purchased project must not become visibly unfinished. An old access project must not relock an area.
- Preserve earned achievements, but do not mark new story jobs complete solely because someone has unrelated currency. Retire the fund from required progression and retain its legacy value if needed for migration/history; no new spending obligation is necessary.
- Preserve and recover from the previous valid save during migration. Handle unavailable or failed storage visibly and avoid telling the player work was saved when the backend returned failure. Do not silently replace a corrupt save with a fresh game.
- Keep migration repeatable and test representative fresh, partly restored, fully judged and collection-heavy version-2 saves.

Current postcards store seeds and restoration project lists, then call the current generator in `stills.js`. Changing the generator or art state can therefore change old pictures. Preserve the legacy rendering path with an explicit version, or migrate to stable render snapshots. Versioned state must cover the scene entities and visual layers, not just the random seed. New postcards should retain the exact before/after states of their visit.

The postcard cache key also needs village identity, content/render version and the actual state identity, rather than relying on the count of completed projects. Test switching villages and looking at cards taken before and after a restoration.

## 8. Work order and acceptance gates

Implement in small, reviewable stages. Use the existing branch workflow; this handover is not a request to publish, merge or open a PR. Do not add a new framework or general-purpose live-events service.

### Stage 1: prove the first three scenes

Implement the minimum visit model and migration foundation, then the station → High Street → Green opening. Include early hints, corrected false targets, the new completion reveal, resumable work and direct progression. Use existing assets.

Acceptance:

- A fresh player reaches and can begin Village Green without spending money or repeating a scene to afford access.
- The opening contains one obvious next action. Its dialogue is readable and skippable.
- When the task asks for repainting, the faded High Street kiosk and postbox are valid tasks; tapping them changes them and updates the count.
- The station's visible dirty window is either today's cleaning task or is not presented as a false cleaning target. No plausible exploratory tap triggers “Shaky hands!” in the introduction.
- Hints are available in the first scene and can resolve the last outstanding task. Zoom is discoverable before it becomes necessary.
- Completion shows a substantial scene change at scene size, ends on the restored view and offers a visible, named next destination without scrolling.
- Reload after partial work resumes completed actions. Reload just after the final tap preserves completion and grants rewards once.

### Stage 2: deliver a coherent free village

Author the remaining route, convert paid project effects into playable restoration, add one storm and two committee requests, and adapt the map, journal and finale. Tune the proposed 14 visits rather than generating five mandatory tiers per scene.

Acceptance:

- Every revisit has a clear reason and a distinct visible contribution.
- Completed paint/repairs survive every later visit, storm, reload and optional activity.
- A storm contains only plausible incident tasks. A committee colour request produces the specified flower display and preserves unrelated work.
- No stage requires daily play, three stamps, a no-hint run, collection completion or a currency balance.
- All required work can be completed in a valid order; branching choices cannot strand the player. Optional activities cannot block the finale.
- The final tour shows all eight restored places and the village retains its completed state afterwards.
- Newly added village content can define its route through data using documented reusable operations.

### Stage 3: phone, tablet and commercial readiness

Automated checks should include visit graph cycles/unreachable nodes, unknown targets, duplicate IDs, disallowed event operations, effect conflicts, resume, duplicate completion and migration. Extend the existing bot to cover relevant intermediate restoration states and actual introductory job restrictions; its present fresh/fully-restored sampling does not cover every authored combination.

Retain the repository's required `validate`, `bot`, `economy` and build gates after implementation. Update the economy simulator to report story visits and optional activity separately. Do not achieve passing reports by loosening fairness rules or retaining obsolete two-hour targets. Inspect the generated screenshots, including the existing rotated-stage scenario.

Use this physical-device and viewport matrix as a practical starting point:

| Surface | Check |
|---|---|
| Compact phone, around 667×375 CSS pixels | Essential targets, text and primary actions fit with browser chrome and safe areas. |
| Typical phone, around 844×390 | Natural thumb reach, zoom/pan, hit accuracy, results and map navigation. |
| Larger phone | Layout uses space without distancing important controls from the player. |
| Landscape tablet, including a 4:3 screen around 1024×768 | Scene remains undistorted, letterboxing feels intentional, text is readable and control size is appropriate. |
| Portrait-locked phone using the app's rotated stage | Taps, drags, hint pointers, safe areas and modal positioning remain correct. |
| Actual intended release devices | Safari or native-wrapper behaviour, sound after interruption, haptics, memory, frame pacing and save recovery. |

Viewport screenshots do not substitute for physical touch testing. Test one-handed and two-thumb play, fingers obscuring targets, device lock/background/foreground, scene reload and interrupted result animation. Verify reduced motion and that essential feedback works without sound or haptics.

Run a small formative round with roughly 5–8 first-time players who resemble the intended audience, including people who rarely play games. Observe without coaching. Record time to first action/postcard/third area, repeated wrong-target taps, long stalls, hint discovery, confusing transitions, actual full-village time and where players choose to stop. Ask “What changed?” and “What would you do next?” after early visits. This sample finds usability problems; it cannot establish reliable commercial conversion rates.

Aim for players to understand the first three scenes unaided and choose the next visit because they want to see the improvement. Investigate any critical confusion rather than averaging it away in a completion-time metric.

### Commercial release blockers

The travel shop currently has mock buy, pre-order and restore-purchase behaviour. Before selling a village, the intended platform needs a functioning purchase/restore/entitlement path and that village must actually be playable. Verify success, cancellation, failure, interrupted fulfilment and restored ownership. A poster marked ready to travel is not sufficient.

When a pack is unavailable, use an honest preview/coming-soon state. Let the free village finish emotionally before the main sales invitation. Show what the next village offers: a different atmosphere, residents and restoration problems, with a clear one-off purchase. Leave an obvious “Stay in Honeycombe” choice. Do not lead with a bundle of unfinished villages or make the finale feel withheld behind a payment.

## 9. What the developer should return

For each stage, provide a short account of changed behaviour, a reproducible play route, test results, relevant phone/tablet screenshots and any unresolved issue. Identify proposed timings as unvalidated until human testing supports them. Report missing artwork and purchase integration separately from gameplay completion.

The first useful deliverable is the polished three-scene opening, backed by the minimum persistent visit system. It should demonstrate that the player understands the work, enjoys seeing it stay done, and wants to take the next postcard.
