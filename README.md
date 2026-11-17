# Home design site (concept)

A static site for choosing and configuring a concept home.

- `index.html`: the configurator. Pick a home, a look, options, a community and a lot, with a running estimate. "All floor plans" opens every level and option of every home (`#plans`); "Compare homes" puts the six side by side (`#compare`). A build can be shared as a link from the summary.
- `walkthrough/`: the walkable 3D model of every plan (three.js, loaded from a CDN). Each plan's model loads the first time it is chosen.
- `plans/`: schematic plan sets. Architecture, electrical, plumbing and mechanical sheets for each model.
- `img/`: renderings used by the configurator.

Six plans from 1,420 to 3,928 sq ft, five looks, and an in-law suite: the garage turns to a side-entry court, a second two-car garage stands at the back of the court and the suite sits behind it, off one driveway.

No build step. Deploy the repo root as a static site (for example on Vercel with the default settings).

Concept plans, renderings, lots and prices only. Nothing here is a construction document, a quote or an offer.
