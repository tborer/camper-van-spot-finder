const Overpass = (() => {
  const MIN_ZOOM = 9;
  const RETRY_DELAYS = [2000, 5000, 10000];

  // Tile-based result cache — snaps bounds to 0.25° grid cells, TTL 10 min
  const TILE_SIZE = 0.25;
  const CACHE_TTL = 10 * 60 * 1000;
  const MAX_CACHE_ENTRIES = 60;
  const cache = new Map();

  function tileKey(bounds, zoom) {
    const snapLat = (Math.floor(bounds.south / TILE_SIZE) * TILE_SIZE).toFixed(2);
    const snapLng = (Math.floor(bounds.west / TILE_SIZE) * TILE_SIZE).toFixed(2);
    return `${snapLat},${snapLng},${zoom}`;
  }

  function getCached(bounds, zoom) {
    const entry = cache.get(tileKey(bounds, zoom));
    if (!entry) return null;
    if (Date.now() - entry.ts > CACHE_TTL) { cache.delete(tileKey(bounds, zoom)); return null; }
    return entry.spots;
  }

  function setCache(bounds, zoom, spots) {
    if (cache.size >= MAX_CACHE_ENTRIES) {
      // Evict oldest entry
      const oldest = [...cache.entries()].sort((a, b) => a[1].ts - b[1].ts)[0];
      cache.delete(oldest[0]);
    }
    cache.set(tileKey(bounds, zoom), { spots, ts: Date.now() });
  }

  // AbortController for the in-flight request — cancel on next call
  let currentController = null;

  function buildQuery(bounds) {
    const { south, west, north, east } = bounds;
    const bb = `${south},${west},${north},${east}`;
    // ["fee"!="yes"] matches elements where fee tag is absent OR not "yes"
    // Most free parking in OSM has no fee tag at all — absence means free
    return `[out:json][timeout:40];
(
  node["tourism"="camp_site"]["fee"!="yes"](${bb});
  way["tourism"="camp_site"]["fee"!="yes"](${bb});
  node["amenity"="camping"]["fee"!="yes"](${bb});
  way["amenity"="camping"]["fee"!="yes"](${bb});
  node["amenity"="parking"]["fee"!="yes"](${bb});
  way["amenity"="parking"]["fee"!="yes"](${bb});
  node["highway"="rest_area"](${bb});
  way["highway"="rest_area"](${bb});
  node["highway"="services"]["fee"!="yes"](${bb});
  way["highway"="services"]["fee"!="yes"](${bb});
  node["leisure"="picnic_area"]["access"!="private"](${bb});
  way["leisure"="picnic_area"]["access"!="private"](${bb});
  node["tourism"="picnic_site"]["fee"!="yes"](${bb});
  way["tourism"="picnic_site"]["fee"!="yes"](${bb});
  node["amenity"="overnight_parking"](${bb});
  way["amenity"="overnight_parking"](${bb});
);
out center;`;
  }

  function normalize(el) {
    const tags = el.tags || {};
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (lat == null || lng == null) return null;

    const type = (tags.tourism === 'camp_site' || tags.amenity === 'camping')
      ? 'campsite'
      : (tags.highway === 'rest_area' || tags.highway === 'services') ? 'rest_area'
      : (tags.leisure === 'picnic_area' || tags.tourism === 'picnic_site') ? 'picnic_area'
      : 'parking';

    const defaultName = {
      campsite: 'Unnamed Campsite',
      rest_area: 'Rest Area',
      picnic_area: 'Picnic Area',
      parking: 'Unnamed Parking',
    }[type];

    return {
      id: `osm-${el.type}-${el.id}`,
      name: tags.name || defaultName,
      type,
      lat,
      lng,
      source: 'osm',
      sources: ['osm'],
      free: tags.fee !== 'yes' || type === 'rest_area' || type === 'picnic_area',
      facilities: {
        toilets: tags.toilets === 'yes' || tags['toilets:disposal'] != null,
        water: tags.drinking_water === 'yes',
        dumpStation: tags['sanitary_dump_station'] === 'yes',
        shower: tags.shower === 'yes',
      },
      stayLimitDays: tags['maxstay'] ? parseInt(tags['maxstay']) || null : null,
      notes: tags.description || tags.note || null,
      signalStrength: 'none',
      geohash: '',
    };
  }

  async function fetchSpots(bounds) {
    const zoom = typeof MapView !== 'undefined' ? MapView.getZoom() : 99;
    if (zoom < MIN_ZOOM) {
      console.log(`[Overpass] Skipping — zoom ${zoom} < minimum ${MIN_ZOOM}`);
      return [];
    }

    // Return cached result if viewport snaps to same tile and cache is fresh
    const cached = getCached(bounds, zoom);
    if (cached) {
      console.log(`[Overpass] Cache hit (${cached.length} spots) — key: ${tileKey(bounds, zoom)}`);
      return cached;
    }

    // Cancel any in-flight request before starting a new one
    if (currentController) {
      currentController.abort();
      console.log('[Overpass] Cancelled previous in-flight request');
    }
    currentController = new AbortController();
    const { signal } = currentController;

    const query = buildQuery(bounds);
    console.log(`[Overpass] Fetching (zoom ${zoom}, tile ${tileKey(bounds, zoom)})`);

    for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
      try {
        const res = await fetch(CONFIG.OVERPASS_API_URL, {
          method: 'POST',
          body: `data=${encodeURIComponent(query)}`,
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          signal,
        });

        if (res.status === 429) {
          const delay = RETRY_DELAYS[attempt];
          if (delay) {
            console.warn(`[Overpass] Rate limited. Retrying in ${delay / 1000}s (attempt ${attempt + 1}/${RETRY_DELAYS.length})…`);
            await new Promise(r => setTimeout(r, delay));
            continue;
          }
          console.error('[Overpass] Rate limited — all retries exhausted. Wait before panning.');
          return [];
        }

        if (!res.ok) {
          const body = await res.text().catch(() => '');
          console.error(`[Overpass] HTTP ${res.status} — ${body.slice(0, 300)}`);
          return [];
        }

        const json = await res.json();
        if (json.remark) console.warn('[Overpass] Server remark:', json.remark);

        const raw = json.elements || [];
        const spots = raw.map(normalize).filter(Boolean);
        const dropped = raw.length - spots.length;
        console.log(`[Overpass] ${raw.length} elements → ${spots.length} spots` +
          (dropped ? ` (${dropped} dropped — no coords)` : ''));
        const byType = spots.reduce((a, s) => { a[s.type] = (a[s.type] || 0) + 1; return a; }, {});
        if (spots.length) console.log('[Overpass] By type:', byType);

        setCache(bounds, zoom, spots);
        return spots;

      } catch (err) {
        if (err.name === 'AbortError') {
          console.log('[Overpass] Request aborted — superseded by newer pan');
          return [];
        }
        console.error('[Overpass] Fetch error:', err.message);
        return [];
      }
    }
    return [];
  }

  return { fetchSpots };
})();
