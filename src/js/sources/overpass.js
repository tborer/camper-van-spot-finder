const Overpass = (() => {
  function buildQuery(bounds) {
    const { south, west, north, east } = bounds;
    const bb = `${south},${west},${north},${east}`;
    // ["fee"!="yes"] matches elements where the fee tag is absent OR not "yes"
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

  // Minimum zoom before querying — below this the bounding box is too large
  const MIN_ZOOM = 9;
  // Retry delays (ms) on 429 Too Many Requests
  const RETRY_DELAYS = [2000, 5000, 10000];

  async function fetchSpots(bounds) {
    const zoom = typeof MapView !== 'undefined' ? MapView.getZoom() : 99;
    if (zoom < MIN_ZOOM) {
      console.log(`[Overpass] Skipping query — zoom ${zoom} is below minimum ${MIN_ZOOM}. Zoom in to load spots.`);
      return [];
    }

    const query = buildQuery(bounds);
    const url = CONFIG.OVERPASS_API_URL;
    console.log(`[Overpass] Querying (zoom ${zoom}) for bounds:`, bounds);

    for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          body: `data=${encodeURIComponent(query)}`,
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });

        if (res.status === 429) {
          const retryDelay = RETRY_DELAYS[attempt];
          if (retryDelay) {
            console.warn(`[Overpass] Rate limited (429). Retrying in ${retryDelay / 1000}s… (attempt ${attempt + 1}/${RETRY_DELAYS.length})`);
            await new Promise(r => setTimeout(r, retryDelay));
            continue;
          } else {
            console.error('[Overpass] Rate limited (429) — all retries exhausted. Wait a minute before panning.');
            return [];
          }
        }

        if (!res.ok) {
          const body = await res.text().catch(() => '');
          console.error(`[Overpass] HTTP ${res.status} — ${body.slice(0, 300)}`);
          return [];
        }

        const json = await res.json();
        if (json.remark) console.warn('[Overpass] Server remark (may indicate timeout):', json.remark);

        const raw = json.elements || [];
        const spots = raw.map(normalize).filter(Boolean);
        const dropped = raw.length - spots.length;

        console.log(`[Overpass] ${raw.length} elements → ${spots.length} spots` +
          (dropped ? ` (${dropped} dropped — missing coords)` : ''));

        const byType = spots.reduce((acc, s) => { acc[s.type] = (acc[s.type] || 0) + 1; return acc; }, {});
        if (spots.length) console.log('[Overpass] By type:', byType);

        return spots;
      } catch (err) {
        console.error('[Overpass] Fetch error:', err.message);
        return [];
      }
    }
    return [];
  }

  return { fetchSpots };
})();
