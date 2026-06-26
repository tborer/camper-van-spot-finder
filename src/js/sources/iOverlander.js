const IOverlander = (() => {
  function normalize(place) {
    if (!place.latitude || !place.longitude) return null;
    return {
      id: `ioverlander-${place.id}`,
      name: place.name || 'Unnamed iOverlander Spot',
      type: place.category_name?.toLowerCase().includes('camp') ? 'campsite' : 'overlanding',
      lat: parseFloat(place.latitude),
      lng: parseFloat(place.longitude),
      source: 'ioverlander',
      sources: ['ioverlander'],
      free: true, // iOverlander spots are generally free/community-reported
      facilities: {
        toilets: false,
        water: false,
        dumpStation: false,
        shower: false,
      },
      stayLimitDays: null,
      notes: place.description || null,
      signalStrength: 'none',
      geohash: '',
    };
  }

  async function fetchSpots(bounds) {
    const { south, west, north, east } = bounds;
    const url = `${CONFIG.IOVERLANDER_BASE_URL}?latstart=${south}&latend=${north}&lonstart=${west}&lonend=${east}`;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`iOverlander HTTP ${res.status}`);
      const json = await res.json();
      const places = Array.isArray(json) ? json : json.places || [];
      return places.map(normalize).filter(Boolean);
    } catch (err) {
      console.warn('iOverlander fetch failed (stub/API unavailable):', err.message);
      return [];
    }
  }

  return { fetchSpots };
})();
