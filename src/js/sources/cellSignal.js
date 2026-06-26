const CellSignal = (() => {
  let towers = []; // [{lat, lng}]
  let rawGeoJSON = null;

  async function init() {
    try {
      const res = await fetch('data/cell-towers.geojson');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      rawGeoJSON = await res.json();
      towers = rawGeoJSON.features.map(f => ({
        lat: f.geometry.coordinates[1],
        lng: f.geometry.coordinates[0],
      }));
    } catch (err) {
      console.warn('cellSignal: failed to load cell-towers.geojson:', err.message);
      towers = [];
    }
  }

  function distanceKm(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 +
      Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) * Math.sin(dLng/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function getSignalStrength(lat, lng) {
    const count = towers.filter(t => distanceKm(lat, lng, t.lat, t.lng) <= 2).length;
    if (count >= 5) return 'strong';
    if (count >= 2) return 'fair';
    if (count >= 1) return 'weak';
    return 'none';
  }

  function getCellGeoJSON() { return rawGeoJSON; }

  return { init, getSignalStrength, getCellGeoJSON };
})();
