# Home design site (concept)

A static site for choosing and configuring a concept home.

- `index.html`: the configurator. Pick a home, a look, options, a community and a lot, with a running estimate. "All floor plans" opens every level and option of every home (`#plans`); "Compare homes" puts the six side by side (`#compare`). A build can be shared as a link from the summary. Tapping a picture opens the live 3D model at that view, with arrows to flip through the views.
- `walkthrough/`: the walkable 3D model of every plan (three.js, loaded from a CDN). Each plan's model loads the first time it is chosen. A view can be addressed, for example `walkthrough/#plan-3560-with-suite/st=farm,lv=main` (look, level, camera, options); `e=1` hides the page chrome for embedding.
- `plans/`: schematic plan sets. Architecture, electrical, plumbing and mechanical sheets for each model.
- `img/`: renderings and model views used by the configurator, as WebP in three sizes: `NAME.webp` (full), `NAME_m.webp` (phones) and `NAME_t.webp` (thumbnails and placeholders).

Six plans from 1,420 to 3,928 sq ft, five looks with Modern Farmhouse as the standard, and an in-law suite: the garage turns to a side-entry court, a second two-car garage stands at the back of the court and the suite sits behind it, off one driveway. Every plan has one straight drive and a curved, planted walk from the drive to the front porch.

No build step. Deploy the repo root as a static site (for example on Vercel with the default settings).

Concept plans, renderings, lots and prices only. Nothing here is a construction document, a quote or an offer.
