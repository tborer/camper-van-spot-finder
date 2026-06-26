const Main = (() => {
  let moveDebounce = null;

  async function loadSpotsForBounds(bounds) {
    UI.showLoading();
    try {
      const [osmSpots, iOverlanderSpots, freeCampsites] = await Promise.all([
        Overpass.fetchSpots(bounds),
        IOverlander.fetchSpots(bounds),
        FreeCampsites.fetchSpots(bounds),
      ]);

      const combined = [...osmSpots, ...iOverlanderSpots, ...freeCampsites];
      const deduped = deduplicateSpots(combined);

      deduped.forEach(s => { s.signalStrength = CellSignal.getSignalStrength(s.lat, s.lng); });

      const filtered = Filters.applyFilters(deduped);

      MapView.clearSpots();
      filtered.forEach(s => MapView.addSpotMarker(s));
      MapView.renderOverlapZones(filtered);

      const center = MapView.getCenter();
      UI.renderResults(filtered, center);
    } catch (err) {
      console.error('loadSpotsForBounds error:', err);
    } finally {
      UI.hideLoading();
    }
  }

  function onMapMoved() {
    clearTimeout(moveDebounce);
    moveDebounce = setTimeout(() => loadSpotsForBounds(MapView.getBounds()), 500);
  }

  function refresh() {
    loadSpotsForBounds(MapView.getBounds());
  }

  async function start() {
    MapView.init();
    UI.init();
    Search.init();
    await CellSignal.init();
    MapView.renderCellHeatmap(CellSignal.getCellGeoJSON());
    loadSpotsForBounds(MapView.getBounds());
  }

  document.addEventListener('DOMContentLoaded', start);

  return { onMapMoved, refresh };
})();
