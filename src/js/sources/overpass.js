const Overpass = (() => {
  function buildQuery(bounds) {
    const { south, west, north, east } = bounds;
    const bb = `${south},${west},${north},${east}`;
    return `[out:json][timeout:25];
(
  node["tourism"="camp_site"]["fee"!="yes"](${bb});
  way["tourism"="camp_site"]["fee"!="yes"](${bb});
  node["amenity"="parking"]["fee"="no"](${bb});
  way["amenity"="parking"]["fee"="no"](${bb});
  node["highway"="rest_area"](${bb});
  way["highway"="rest_area"](${bb});
  node["amenity"="camping"](${bb});
  way["amenity"="camping"](${bb});
);
out center;`;
  }

  function normalize(el) {
    const tags = el.tags || {};
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (!lat || !lng) return null;

    const type = tags.tourism === 'camp_site' || tags.amenity === 'camping'
      ? 'campsite'
      : tags.highway === 'rest_area' ? 'rest_area' : 'parking';

    return {
      id: `osm-${el.type}-${el.id}`,
      name: tags.name || (type === 'campsite' ? 'Unnamed Campsite' : 'Unnamed Parking'),
      type,
      lat,
      lng,
      source: 'osm',
      sources: ['osm'],
      free: tags.fee !== 'yes',
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
    const query = buildQuery(bounds);
    try {
      const res = await fetch(CONFIG.OVERPASS_API_URL, {
        method: 'POST',
        body: `data=${encodeURIComponent(query)}`,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
      const json = await res.json();
      return json.elements.map(normalize).filter(Boolean);
    } catch (err) {
      console.warn('Overpass fetch failed:', err.message);
      return [];
    }
  }

  return { fetchSpots };
})();
