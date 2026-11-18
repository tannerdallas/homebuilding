# Home design site (concept)

A static site for choosing and configuring a concept home.

- `index.html`: the configurator. Pick a home, a look, options, a community and a lot, with a running estimate. "All floor plans" opens every level and option of every home (`#plans`); "Compare homes" puts the six side by side (`#compare`). A build can be shared as a link from the summary. Tapping a picture opens the live 3D model at that view, with arrows to flip through the views.
- `walkthrough/`: the walkable 3D model of every plan (three.js r128, MIT license, served from this folder). Each plan's model loads the first time it is chosen, in two files so the first picture comes quickly: `model-<plan>.js` holds the house as seen from outside and is drawn as soon as it arrives; `model-<plan>-in.js` (furniture, fixtures, basement fit-out) follows right behind it and joins the house already on screen (an address that goes straight indoors waits for both). The bytes are packed for the server's compression (delta planes, one character a byte). Its light is baked: daylight, sun patches, lamps and bounce light live in lightmap pages (`lm-<model>-<page>.webp`: outside, main level, upstairs, basement) that arrive after the model, the outside page first, and replace the plain shading. Surface detail (plank floors, tile, stone, brick, cloth) is drawn in the shader, so there are no texture downloads. A view can be addressed, for example `walkthrough/#plan-3560-with-suite/st=farm,lv=main` (look, level, camera, options); `walk-…/room=Kitchen` stands in a room, at the spot that shows the most of it; `e=1` hides the page chrome for embedding.
- `plans/`: schematic plan sets. Architecture, electrical, plumbing and mechanical sheets for each model.
- `img/`: renderings (path-traced stills of the same 3D scenes, with full materials) and model views used by the configurator, as WebP in three sizes: `NAME.webp` (full), `NAME_m.webp` (phones) and `NAME_t.webp` (thumbnails and placeholders).

Six plans from 1,420 to 3,928 sq ft, five looks with Modern Farmhouse as the standard, and an in-law suite: the garage turns to a side-entry court, a second two-car garage stands at the back of the court and the suite sits behind it, off one driveway. Every plan has one straight drive and a curved, planted walk from the drive to the front porch.

No build step. Deploy the repo root as a static site (for example on Vercel with the default settings).

Concept plans, renderings, lots and prices only. Nothing here is a construction document, a quote or an offer.
