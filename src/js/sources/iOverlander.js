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
      free: true,
      facilities: { toilets: false, water: false, dumpStation: false, shower: false },
      stayLimitDays: null,
      notes: place.description || null,
      signalStrength: 'none',
      geohash: '',
    };
  }

  async function fetchSpots(bounds) {
    const { south, west, north, east } = bounds;
    const url = `${CONFIG.IOVERLANDER_BASE_URL}?latstart=${south}&latend=${north}&lonstart=${west}&lonend=${east}`;
    console.log('[iOverlander] Fetching:', url);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      const json = await res.json();
      const places = Array.isArray(json) ? json : json.places || [];
      const spots = places.map(normalize).filter(Boolean);
      console.log(`[iOverlander] ${spots.length} spots returned`);
      return spots;
    } catch (err) {
      console.warn('[iOverlander] Fetch failed (API may be unavailable or CORS-blocked):', err.message);
      return [];
    }
  }

  return { fetchSpots };
})();
