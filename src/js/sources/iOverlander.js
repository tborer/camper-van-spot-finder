// iOverlander spots are pre-fetched during CI (scripts/build-ioverlander-data.js)
// and served as a static JSON file to avoid browser CORS restrictions.

const IOverlander = (() => {
  let spots = null; // cached after first load

  async function loadAll() {
    if (spots !== null) return spots;

    const url = new URL('data/ioverlander-spots.json', document.baseURI).href;
    console.log(`[iOverlander] Loading pre-baked spots from: ${url}`);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      const json = await res.json();
      spots = json.spots || [];
      if (json.error) {
        console.warn(`[iOverlander] Data file has an error flag: ${json.error}`);
      }
      console.log(`[iOverlander] Loaded ${spots.length} pre-baked spots`);
    } catch (err) {
      console.warn('[iOverlander] Could not load ioverlander-spots.json:', err.message,
        '— Run CI to generate it, or push to main to trigger a deploy.');
      spots = [];
    }
    return spots;
  }

  async function fetchSpots(bounds) {
    const all = await loadAll();
    const { south, north, west, east } = bounds;
    const inBounds = all.filter(s =>
      s.lat >= south && s.lat <= north && s.lng >= west && s.lng <= east
    );
    console.log(`[iOverlander] ${inBounds.length} spots in current bounds (${all.length} total)`);
    return inBounds;
  }

  return { fetchSpots };
})();
