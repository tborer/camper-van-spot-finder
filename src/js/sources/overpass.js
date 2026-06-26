const Overpass = (() => {
  function buildQuery(bounds) {
    const { south, west, north, east } = bounds;
    const bb = `${south},${west},${north},${east}`;
    // Note: ["fee"!="yes"] matches elements where fee tag is absent OR not "yes"
    // This is intentional — most free parking in OSM has no fee tag at all
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
out center tags;`;
  }

  function normalize(el) {
    const tags = el.tags || {};
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (!lat || !lng) return null;

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
