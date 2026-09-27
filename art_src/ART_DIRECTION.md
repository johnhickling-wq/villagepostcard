# Honeycombe art direction

The one brief every plate, sprite sheet, overlay, map and poster follows, so
the whole game reads as one illustrated world. Written for the September 2026
visual polish pass (`docs/VISUAL_PLAYTEST_2026-09-27.md`). Prompts in
`plates.json`, `sheets.json` and `extra.json` should say the same thing.

## The look

A 1950s picture book made from cut coloured paper. Every shape is a flat piece
of cut or torn paper with a fine paper grain, slightly irregular hand-cut edges,
simple drawn lines for stone courses, slates and planks, and tiny soft shadows
where layers overlap. No painterly shading, no gloss, no photographic light.

## Colour: a fresh spring day

- **Leaf green** grass and foliage: fresh and clear, several distinct greens
  (lawn, hedge, tree, reed), never olive or khaki.
- **Clear blue** sky and water, with clean cream paper clouds. Not turquoise,
  not grey.
- **Warm honey stone** for buildings and walls, with cream mortar lines.
  Warm, not lemon-yellow, and not the colour of the paths.
- **Cream paper** for highlights and whitewash, without a yellow cast.
- **Selective accents**: Post Office red, teal, cornflower blue, blossom pink,
  daffodil yellow, on doors, flowers and paintwork. Accents are where the eye
  should go; keep them off large surfaces.
- Values separated: grass, stone, path and sky must be told apart at a glance
  in a phone-sized thumbnail.

Avoid: a uniform yellow or orange cast, olive/khaki greens, neon saturation,
flat grey skies, colour noise in the ground.

`tools/art/freshen.py` applies this direction to every source image at build
time (it moves colours, never pixels). New art is generated against references
that have already been freshened (`scratch_art/refs/*_fresh.png`, made from
the plates), and its own `freshen` amount is set so it lands on the same
palette as the rest; check it on a contact sheet
(`node tools/qa/shots.mjs compare`).

## Neglect is local

An unrestored place is still a lovely place to be. The plates are always
clean, fresh and bright; what needs doing is drawn on top, locally: faded
paint, grime, litter, weeds, crooked signs, empty planters with bare soil.
Nothing greys or darkens the whole scene (`src/render/grade.js`).

## Composition for play (phone landscape)

- Work areas are close: doors, windows, benches, planters and signs large in
  the frame, in the middle band of the picture. A job should be readable on a
  667 x 375 phone without zoom.
- One coherent place per plate, seen from eye level, with a foreground of a
  few large calm pieces of paper (lawn, flagstones, floorboards) where small
  things lying on it are easy to see.
- Keep the top 14% (the job bar) and the edges free of anything the player
  must find. Sky is a strip, not half the picture.
- Overview art (the map, the finale) stays wide; play plates stay close.

## Scale

Loose objects and reward props follow the scene's depth scale
(`depth` in the scene file): litter next to a bench is smaller than the bench
seat; a bench in the foreground is as big as a person would be there. Check
the before/after comparisons for giant litter and miniature rewards.

## Interiors

Same paper, same palette, warmer light: cream and sage painted walls, dark
wood counters and shelves, brass, glass jars, a big window onto the familiar
honey-stone street. Merchandise is big simple blocks of colour on a few
shelves, never a clutter of tiny indistinguishable things.
