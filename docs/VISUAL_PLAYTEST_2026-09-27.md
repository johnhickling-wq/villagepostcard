# Postcard Perfect: visual playtest and next polish brief

27 September 2026. Live build: https://johnhickling-wq.github.io/villagepostcard/. Source cross-check: main at c843fca.

## Decision and scope

The restoration story is a substantial improvement. Keep the currency-free route, residents, persistent improvements, repeat visits and large postcard reward. The next pass should concentrate on reliable restart, attractive colour throughout play, believable close-up compositions and clearer visual tasks.

This brief supplements docs/RESTORATION_HANDOVER.md. **The owner explicitly no longer requires backwards compatibility during development and is happy for progress to reset. This supersedes the older handover's save-migration and legacy-postcard preservation requirements.** Do not spend the next pass extending those systems. Current-version saving, resuming and deliberate restart must still work reliably.

Implement this as one autonomous polish pass, making routine design decisions without asking the owner to manage stages. Keep the data-driven village architecture. Do not claim new artwork, real-device testing or complete release readiness unless delivered and verified.

### What was actually tested

Visual play through the normal interface, completing the first nine visits:
1. Halt tidy
2. High Street refresh
3. Green tidy
4. Halt planting/refresh
5. Weavers' Row
6. Old Mill
7. High Street committee request
8. Bee & Bramble
9. Green gardening

The result showed **6 of 8 places restored**, with St Aldhelm's next. The reset was then exercised from Settings. Hints were used for the mill's last straightening job and the High Street's remaining hanging basket. Task locations were found visually, not extracted from content files.

The browser viewport was 1363 × 936. This was a visual desktop-browser playtest with a tablet-like aspect ratio, **not a physical iPhone/iPad touch test or a phone-sized viewport test**. Phone risks below are design assessments, not invented device results. Tool interaction time is not a valid human completion-time measurement. The remaining church, final locations, storm and judging were not visually played in this pass.

## Priority 0: make Start again work

### Observed failure
After nine completed visits, choose Map → Settings → Start again → Yes, start again. The page reloads, but the title still offers **Tap to carry on**, instead of a fresh start. Continuing returns to the same map with **6 of 8 places restored** and St Aldhelm's still next. The owner independently reported the same problem.

### Likely cause, supported by source
- src/ui/components/settings.js calls storage.clear(), then location.reload().
- src/engine/storage.js removes the save but does not cancel its pending debounced write.
- src/app.js persists the existing in-memory save on pagehide and when the document becomes hidden.

The old live state can therefore write itself back during the reload. Removing a storage key alone is not a complete reset.

### Required outcome
Implement one coordinated reset operation: stop/cancel stale writes, replace or discard the old in-memory progress and active session, establish a fresh current-format save, and then navigate/reload safely. Lifecycle handlers must not resurrect the discarded run. Preserve user settings only if that is an intentional documented choice. Reset all game progress and introduction flags consistently.

Move Start again into an obvious Progress section. It currently sits beneath extensive postcard cosmetic choices. Keep a clear confirmation and a working Cancel. Do not promise a recoverable backup in the copy unless recovery actually exists for the user; legacy backup machinery is not required by the owner.

### Acceptance
Play several visits, reset, see the fresh opening and first tutorial, with no old postcards/restoration/active visit. Reload again and verify it stays fresh. Test reset with a pending save and on pagehide/visibility changes, plus Cancel preserving progress. Test from every place Settings is reachable. A storage-unit test alone will miss the browser lifecycle problem.

## Priority 1: fresh colour before and after restoration

### What I saw
The first Green is olive-grey and subdued. Grass, foliage, stone and clouds sit close together in muted midtones. A lot of beauty is present, but the initial scene does not immediately convey a fresh, inviting village. The completed Green is noticeably warmer and brighter, so the problem is not identical across all states.

The High Street's restored red phone box and postbox are clear and rewarding. Preserve this local contrast. Do not make the whole village unattractive just to increase the final colour jump.

### Source contribution
src/render/grade.js applies a whole-scene grey saturation blend at 0.42 × tired, plus a cool multiply blend at 0.3 × tired. Weather grading is then applied too. Fully restored scenes instead receive a warm soft-light blend. Plate and sprites both receive grading.

Reduce or remove the blanket tired-scene desaturation/cooling, then evaluate the base artwork separately. Show neglect through specific faded paint, dirt, litter, weeds and empty planters. Keep the overall scene appealing from the first frame.

### Art direction
Fresh leaf greens, clear blue sky and water, warm honey stone, clean cream clouds, and selective flower/paint accents. Retain paper texture, soft shadows and the period feel. Avoid a uniform yellow cast or indiscriminate saturation that turns everything neon and flattens the materials.

Compare the same scene under identical clear-weather conditions, unfinished and finished. Then check weather variants independently. Inspect the actual play view as well as the reward postcard. Cosmetic postcard films must not dictate ordinary gameplay clarity.

## Priority 1: bring the work closer to the player

The Green is a handsome overview but a weak work surface. A whole cottage row, monument, pond, benches, sky and foreground planting compete for attention. Realistically scaled jobs become small; enlarging individual props instead creates giant litter and inconsistent perspective.

Examples from play:
- Green litter is conspicuously large relative to nearby benches and ducks.
- The mill's loose objects compete with comparatively small doors, while its reward bench looks miniature in the foreground.
- The pub's flat cap and packet look very large beside the garden furniture.
- Some permanent reward props, including the station trolley, need a depth/scale check too.

Generous invisible hit areas help motor accuracy, but do not make a tiny or illogical object understandable. Zoom should support inspection, not be necessary for the basic scene to work.

### Composition changes
| Location | Direction |
| --- | --- |
| Green | Reframe to an intimate pond-side garden: a bench, pond edge, tubs and a readable stretch of path. Reduce distant architecture and empty sky. |
| Green/play area | A small play-area view could be a second reusable work setting with a gate, bench, flower border and play equipment. Author it as a coherent composition, not more scattered tiny objects across the panorama. |
| Pub | The current Bee & Bramble already works better: entrance, gate and seating are relatively close. Use it as a benchmark and refine prop scale before commissioning a replacement. |
| High Street | Keep the familiar street identity, but consider a shopfront-focused work area where needed. Do not distribute crucial tasks deep down the road. |
| Map/finale | Keep wider views to establish the village and show collective progress. Overview art still has value even when gameplay is closer. |

Prototype crops of existing high-resolution art before replacing backgrounds. A crop is only useful if task positions, layer anchors, occlusion, camera bounds and tap geometry are updated together. Simply enlarging the canvas or stretching sprites will not fix perspective. If a crop lacks resolution or a coherent work area, commission that particular close-up plate.

Do not assume every proposed viewpoint must be an extra place or extra route stage. Replace/recompose weak visits where appropriate, preserving a focused free-village story.

### Phone/tablet acceptance
At 667 × 375 and 844 × 390 landscape, assess real play: identify jobs without mandatory zoom, distinguish empty from planted and crooked from straight, and comfortably tap the intended target without neighbour ambiguity. Keep UI controls at sensible touch sizes, preferably at least 44 CSS pixels in their actual rendered orientation. Scene objects need perceptual readability as well as hit assistance.

At 1024 × 768 landscape and on a physical iPad, retain the close work area rather than revealing so much extra landscape that jobs shrink again. All targets must remain clear of HUD, hint and pause controls. Check the rotated portrait fallback too. Do not accept only automated minimum-hit-radius checks as evidence of visual fairness.

## Priority 1: add one shop interior for meaningful variety

The owner suggested a village shop. This is a strong addition: after repeated stone buildings, trees and outdoor paths, a warm interior changes the view, lighting, object shapes and scale. It should feel like entering a place the player already knows.

Use a close counter/window/shelf composition with a few readable work surfaces. Avoid a whole shop packed with tiny indistinguishable merchandise. Keep the cut-paper treatment and 1957 setting.

One reusable interior can support distinct visits:
- First restoration: clean a visibly dirty window or counter, straighten a wonky sign, repair/repaint a clearly faded fitting.
- Return preparation: arrange a seasonal display, replace an empty display basket, refresh flowers.
- Occasional committee request: dress the window for the village fête, with an obvious new decoration and resident response.

Use familiar interactions and overlays. Do not introduce a shopping economy, inventory puzzle or complex stock simulation just to justify the interior. Prefer substituting one repetitive outdoor visit over inflating the route with filler. The scene's final display must be visibly different and remain improved on later visits.

## Priority 1: tasks must look like the requested action

### Confirmed instruction mismatch
On the first Green visit, the Clean introduction describes a dirty window and polishing glass. The actual required target is the **Market Cross**, and the completion text confirms a clean Market Cross.

Make instruction copy contextual to the current target/material, or use a genuinely general instruction. A stone-cleaning task should not teach the player to search windows.

### Mill ambiguity
The last Straighten job was the round wheel beside the outbuilding. I did not recognise it as crooked; the magnifier revealed it and allowed completion. The free hint worked, which is good, but rotation of a circular shape is intrinsically weak evidence of something being wrong.

Use an obvious asymmetric cue, a clearly displaced mounting, or a task verb that fits what is wrong. Alternatively select a more legible object for straightening. Validate the before and after at actual phone size.

### Planting clarity
The High Street hanging basket blended into surrounding decoration; I needed the hint after trying other plausible plant containers. Existing filled pots and empty task baskets need distinct silhouettes and visible soil/emptiness, without relying only on a tiny label. Check that baked-in flowers do not obscure empty overlays.

Audit every authored task for agreement between resident request, tool label, visible problem, action and completion wording. Friendly feedback on tomorrow's work is useful, but should not routinely compensate for a confusing picture.

## Priority 2: keep the short-visit rhythm moving

The opening and story requests are clearer, and there is usually an understandable next destination. The postcard reward is much more substantial than the former small swipe card. At this viewport the reaction and progress text were readable. This is not yet evidence of phone readability.

Several early named Next buttons take the player to the map, where a new-feature card and another Next tap intervene. This is **not universal**: later transitions, including the committee visit to the pub and pub to the Green, went directly to the next visit.

Source confirms the deliberate detour in src/ui/screens/results.js goOn(): new-place events or due introduction cards route through the map.

Retain a brief sense of where the next place is, but avoid turning every unlock into a menu stop. A named Next should carry the player into its promised visit, possibly via a short map highlight with automatic continuation. Map remains a secondary voluntary action.

Move optional journal, daily, cosmetic and noticeboard education towards first use or small dismissible cues. Avoid stacking a resident card, a separate generic job card, reward extras and map introduction around a handful of taps. Preserve essential first-action guidance.

Do not replace these interruptions with extra animation delays. Keep the full-scene transformation, but make it quick to understand, skippable/revisitable and compatible with reduced motion.

## Retention and free-village length

This pass does not establish a human completion time. The developer's 15–16 minute simulation and the previous 25–40 minute target are hypotheses, not evidence that content must be padded.

The stronger reason to return is visible cumulative change plus variety: tidy, garden, repair, decorate, enter an interior, and see residents benefit. Fourteen differently named visits will still feel repetitive if the camera and action are always the same.

Prioritise a satisfying first sitting and an ending that makes players want another village. Test with first-time non-gamers on phones: note where they hesitate, use hints, stop, or voluntarily choose another visit. If too short, add worthwhile work to strong scenes or a distinct interior return. If too long, remove redundant searching and interruptions before cutting the emotional payoff. Never turn restoration into repeated undoing of earlier work to stretch duration.

## Save scope and remaining engineering concern

During this pre-release period, an explicit schema reset is acceptable. Remove or simplify migration/legacy-preservation obligations as appropriate and update DESIGN.md, CLAUDE.md and release documentation so they do not contradict the owner's new instruction.

This does not excuse current-version visual rollback. An earlier source-level review reproduced an optional photo-walk issue: begin a station walk, leave it pending, restore the station further in the story, then resume that walk. Its cached plan can show old neglect and omit later permanent improvements. That was not visually replayed in this pass. Recheck it against the current build and regenerate/reconcile pending optional content with permanent restoration if still present. Do not classify it as merely backwards compatibility.

## Delivery and verification

Deliver one coherent playable update, with an honest short account of what was changed and what was actually tested.

Required evidence:
- Restart reproduction and browser-lifecycle regression check.
- Clear-weather before/after comparisons for the revised Green and representative other scenes.
- Playable close-up Green and an integrated shop interior, or explicit identification of any real art dependency rather than claiming it is complete.
- Correct contextual Clean instruction and visibly meaningful mill task.
- Perspective/scale audit of both loose tasks and permanent reward props.
- Normal progression through every affected visit, with earlier restoration retained.
- Current-format mid-visit reload and once-only completion still work.
- Phone/tablet screenshots and actual interaction checks; distinguish emulation from real devices.
- Existing repository validation/tests/fairness checks as applicable. Update obsolete migration tests deliberately; retain current-version save coverage.
- Route simulation if visit structure changes, clearly labelled simulation rather than human playtest.

No purchase implementation or release certification is implied by this polish pass. The game will still need physical iPhone/iPad checks for touch feel, audio, haptics, safe areas and performance, plus real first-time playtests.
