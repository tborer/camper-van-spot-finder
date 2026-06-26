const CellSignal = (() => {
  let towers = [];
  let rawGeoJSON = null;
  let loadStatus = 'unloaded'; // 'unloaded' | 'loading' | 'ok' | 'error' | 'stub'

  async function init() {
    loadStatus = 'loading';
    // Use absolute path relative to the page root to avoid base-URL issues
    const dataUrl = new URL('data/cell-towers.geojson', document.baseURI).href;
    console.log(`[CellSignal] Loading tower data from: ${dataUrl}`);

    try {
      const res = await fetch(dataUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);

      const contentLength = res.headers.get('content-length');
      if (contentLength) {
        const mb = (parseInt(contentLength) / 1024 / 1024).toFixed(1);
        console.log(`[CellSignal] File size: ${mb} MB`);
      }

      rawGeoJSON = await res.json();
      towers = rawGeoJSON.features.map(f => ({
        lat: f.geometry.coordinates[1],
        lng: f.geometry.coordinates[0],
      }));

      const isStub = towers.length <= 10;
      loadStatus = isStub ? 'stub' : 'ok';

      if (isStub) {
        console.warn(`[CellSignal] Loaded STUB data (${towers.length} towers). ` +
          'Set OPENCELLID_API_KEY in GitHub repo secrets and push to main to get real data. ' +
          'All spots will show signal=none until real data is loaded.');
      } else {
        console.log(`[CellSignal] ✓ Loaded ${towers.length.toLocaleString()} real towers`);
      }
    } catch (err) {
      loadStatus = 'error';
      console.error('[CellSignal] Failed to load cell-towers.geojson:', err.message);
      console.error('[CellSignal] Cell signal will show "none" for all spots until fixed.');
      towers = [];
    }
  }

  function distanceKm(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function getSignalStrength(lat, lng) {
    const count = towers.filter(t => distanceKm(lat, lng, t.lat, t.lng) <= 2).length;
    if (count >= 5) return 'strong';
    if (count >= 2) return 'fair';
    if (count >= 1) return 'weak';
    return 'none';
  }

  function getStatus() { return { status: loadStatus, towerCount: towers.length }; }
  function getCellGeoJSON() { return rawGeoJSON; }

  return { init, getSignalStrength, getCellGeoJSON, getStatus };
})();
