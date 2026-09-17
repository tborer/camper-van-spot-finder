# 🚐 VanSpot

**Free camping and parking spots, overlaid with cell tower coverage.**

VanSpot is a browser-based map for van lifers, campervan travellers and remote
workers who need two things at once: somewhere free to park overnight, and
enough cell signal to actually get work done. It pulls overnight-friendly spots
from several open data sources, cross-references each one against an OpenCelliD
cell tower dataset, and highlights the places where "free to stay" and "usable
signal" overlap.

It is a static site — plain HTML, CSS and vanilla JavaScript with
[Leaflet](https://leafletjs.com/) for mapping. There is no backend and no build
step for the app itself; the only server-side work happens in CI, where two Node
scripts pre-bake the cell tower and iOverlander datasets into static files
before the site is deployed to GitHub Pages.

---

## Features

### Finding spots

- **Multi-source spot search.** Overnight parking, campsites, rest areas and
  picnic areas are pulled live from the OpenStreetMap
  [Overpass API](https://overpass-api.de/), and combined with community spots
  from iOverlander that are pre-fetched during CI.
- **Location search with autocomplete.** Type a city, state or address and pick
  from Nominatim (OpenStreetMap geocoder) suggestions.
- **Use my location.** One tap to jump the map to your current GPS position.
- **Viewport-driven loading.** Pan or zoom the map and the spot list refreshes
  for the new area, debounced by one second so dragging doesn't spam the API.
- **Deliberate-activation gate.** Nothing is fetched until you search, use
  locate, or open a shared link — the app doesn't hammer Overpass on page load.
- **Zoom floor.** Spots only load at zoom level 9 or closer, keeping queries
  small enough for the public Overpass instance to answer.
- **Cross-source deduplication.** Spots are bucketed by 6-character geohash and
  merged when their names are similar (substring match or Levenshtein distance
  under 3), so the same pullout doesn't appear three times. OSM is kept as the
  primary record and the contributing sources are merged into a `sources` list.

### Cell coverage

- **Signal estimate per spot.** Every spot is rated `strong` / `fair` / `weak` /
  `none` by counting OpenCelliD towers within a 2 km radius (5+ towers = strong,
  2–4 = fair, 1 = weak).
- **Cell tower layer.** The raw tower positions render as a translucent point
  layer you can toggle on and off.
- **Good-signal zones.** Free spots with fair or strong signal get a green 800 m
  halo, making the "park here and work" areas obvious at a glance.
- **Minimum-signal filter.** A slider hides anything below the signal level you
  need.

### Map and browsing

- **Clustered, colour-coded pins** — green for free spots with usable signal,
  yellow for free spots without signal data, blue for campsites, grey for paid
  parking. Pins cluster automatically at low zoom.
- **Hover tooltips** with name, type, free/paid status and signal strength.
- **Collapsible legend** explaining pin colours and the signal thresholds.
- **Results sidebar** listing every visible spot as a card, sorted by distance
  from the centre of the map, with source badges and a distance readout.
- **Detail panel** with type, free/paid, stay limit, facilities (toilets, water,
  dump station, shower), free-text notes, and one-tap directions links for both
  Google Maps and Apple Maps.
- **Layer toggles** for the cell tower and good-signal overlays.
- **Mobile layout** with a dedicated stylesheet and a slide-out spots sidebar.

### Filters and state

- **Filter chips** for free-only, parking, camping, rest areas, spots with
  facilities, and spots with a documented stay limit.
- **Persistent filters.** Your filter selection is saved to `localStorage` and
  restored on the next visit. A schema version resets stored state cleanly when
  the filter set changes.
- **Shareable URLs.** The map centre and active filters are written to the URL
  hash, and opening such a link restores that view and starts loading spots.

### Reliability and performance

- **Overpass tile cache.** Results are cached against a 0.25° grid key with a
  10-minute TTL and a 60-entry cap, so panning back over an area is free.
- **Request cancellation.** An in-flight Overpass request is aborted as soon as
  a newer pan supersedes it.
- **Rate-limit backoff.** HTTP 429 responses retry after 2 s, 5 s and 10 s
  before giving up.
- **Graceful degradation.** Every data source fails soft: a missing or
  unreachable dataset logs a warning and returns nothing rather than breaking
  the map.
- **Verbose diagnostics.** Grouped console logging traces each load (spots per
  source, dedup results, signal distribution, active filters, what each filter
  removed), plus a `VanSpot.debug()` and `VanSpot.reload()` helper on `window`.

---

## Project structure

```
src/
  index.html               # Single page — layout, filter chips, legend, script tags
  css/main.css             # Desktop styles
  css/mobile.css           # Mobile overrides
  js/config.js             # API keys, endpoints and ad slot IDs
  js/main.js               # Startup, activation gate, per-viewport load pipeline
  js/map.js                # Leaflet map, markers, clustering, overlays
  js/ui.js                 # Sidebar, filter chips, detail panel, legend
  js/search.js             # Nominatim autocomplete, geolocation, URL hash state
  js/filters.js            # Filter state, persistence, predicate logic
  js/dedup.js              # Geohash encoder, Levenshtein, cross-source merge
  js/sources/overpass.js   # OpenStreetMap live query, cache, retries
  js/sources/iOverlander.js# Pre-baked community spots, filtered to bounds
  js/sources/cellSignal.js # Tower data load and signal-strength scoring
  js/sources/freecampsites.js # Stub — not yet wired up
  data/                    # Generated datasets (see below)
scripts/
  build-cell-data.js       # OpenCelliD CSV → GeoJSON, US MCCs 310–316
  build-ioverlander-data.js# iOverlander US/Canada fetch → static JSON
.github/workflows/deploy.yml # Build data, deploy src/ to GitHub Pages
```

---

## Running locally

```bash
npm install
npm run serve      # serves src/ via npx serve
```

Then open the URL it prints. The app works immediately against the live
Overpass and Nominatim APIs; the cell tower and iOverlander layers will be empty
until you generate their data files.

To generate the cell tower dataset locally:

```bash
export OPENCELLID_API_KEY=your_key_here   # free key: https://opencellid.org/register
npm run build-cell-data
```

Without a key the script writes a small stub file (a handful of city
coordinates) and the build continues — every spot will just show
`signal: none`. Both build scripts skip work when their output is still fresh
(7 days for cell towers, 3 days for iOverlander).

To generate the iOverlander dataset:

```bash
node scripts/build-ioverlander-data.js
```

---

## Configuration

`src/js/config.js` holds all external endpoints and keys. The values shipped in
the repository are placeholders:

| Key | Purpose | Needed? |
| --- | --- | --- |
| `OPENCELLID_API_KEY` | Cell tower downloads (read by the CI script from the environment, not the browser) | Yes, for real signal data |
| `OVERPASS_API_URL` | OpenStreetMap spot queries | No key required |
| `NOMINATIM_USER_AGENT` | Identifies the app to the OSM geocoder — set a real contact address | Should be changed |
| `IOVERLANDER_BASE_URL` | Community spot source used by the CI script | No key required |
| `FREECAMPSITES_API_KEY` / `_BASE_URL` | FreeCampsites.net integration | Stubbed, see below |
| `ADSENSE_PUBLISHER_ID`, `ADSENSE_SLOT_*` | Ad units in the sidebar and footer | Optional |

---

## Data sources

| Source | How it's fetched | Licence / notes |
| --- | --- | --- |
| [OpenStreetMap](https://www.openstreetmap.org/) via Overpass | Live, per viewport | © OpenStreetMap contributors (ODbL) |
| [iOverlander](https://www.ioverlander.com/) | Pre-fetched in CI, served as static JSON | Community-contributed |
| [OpenCelliD](https://opencellid.org/) | Downloaded in CI, converted to GeoJSON | Free API key required |
| [Nominatim](https://nominatim.openstreetmap.org/) | Live, for search autocomplete | Usage policy applies — set a real user agent |
| FreeCampsites.net | Not yet implemented | See below |

---

## Deployment

Pushing to `main` triggers `.github/workflows/deploy.yml`, which installs
dependencies, runs both data build scripts, and publishes `src/` to GitHub
Pages. Set `OPENCELLID_API_KEY` under **Settings → Secrets and variables →
Actions** for real tower data; the workflow still succeeds without it, falling
back to stub data. The workflow can also be run manually via
**workflow_dispatch**.

Generated data is deliberately kept out of git: `src/data/cell-towers.geojson`
is gitignored entirely (too large, always regenerated), while
`src/data/ioverlander-spots.json` is committed as an empty placeholder so the
app doesn't 404 before CI overwrites it.

---

## Known gaps

- **FreeCampsites.net is a stub.** `src/js/sources/freecampsites.js` returns an
  empty array; it needs an access method confirmed with the site before it can
  be wired up.
- **The 🔗 Share button has no click handler yet.** The underlying URL hash
  state does work — copying the address bar shares the current view.
- **Signal strength is an estimate**, derived from tower density rather than
  measured signal. It says nothing about which carrier you're on, terrain, or
  actual throughput. Treat it as a hint, not a guarantee.
- **Coverage is US-centric.** The cell tower build covers the continental US
  (MCCs 310–316, excluding Alaska and Hawaii for size), and search autocomplete
  is restricted to US results. iOverlander data covers the US and Canada.
- **AdSense slots are placeholders** and render nothing until a real publisher
  ID is configured.

---

## Licence

No licence has been specified for this project yet. Map and spot data remain
under the terms of their respective sources — see the attribution in the map
footer.
