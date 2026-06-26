const Main = (() => {
  let moveDebounce = null;

  async function loadSpotsForBounds(bounds) {
    UI.showLoading();
    console.group(`[VanSpot] Loading spots for bounds`, bounds);
    try {
      const [osmSpots, iOverlanderSpots, freeCampSpots] = await Promise.all([
        Overpass.fetchSpots(bounds),
        IOverlander.fetchSpots(bounds),
        FreeCampsites.fetchSpots(bounds),
      ]);

      const combined = [...osmSpots, ...iOverlanderSpots, ...freeCampSpots];
      console.log(`[VanSpot] Combined from all sources: ${combined.length} spots`);

      const deduped = deduplicateSpots(combined);
      console.log(`[VanSpot] After deduplication: ${deduped.length} spots`);

      deduped.forEach(s => { s.signalStrength = CellSignal.getSignalStrength(s.lat, s.lng); });

      const signalSummary = deduped.reduce((acc, s) => {
        acc[s.signalStrength] = (acc[s.signalStrength] || 0) + 1; return acc;
      }, {});
      console.log('[VanSpot] Signal distribution:', signalSummary);

      const activeFilters = Filters.getState();
      console.log('[VanSpot] Active filters:', activeFilters);

      const filtered = Filters.applyFilters(deduped);
      const removedByFilter = deduped.length - filtered.length;
      console.log(`[VanSpot] After filters: ${filtered.length} spots` +
        (removedByFilter ? ` (${removedByFilter} hidden by active filters)` : ''));

      if (filtered.length === 0 && deduped.length > 0) {
        console.warn('[VanSpot] All spots were filtered out. Check your active filters — ' +
          '"Free only" may be hiding paid parking in this area. Try toggling it off.');
      }

      MapView.clearSpots();
      filtered.forEach(s => MapView.addSpotMarker(s));
      MapView.renderOverlapZones(filtered);

      const center = MapView.getCenter();
      UI.renderResults(filtered, center);
    } catch (err) {
      console.error('[VanSpot] loadSpotsForBounds error:', err);
    } finally {
      UI.hideLoading();
      console.groupEnd();
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
    console.log('[VanSpot] Starting up…');
    MapView.init();
    UI.init();
    Search.init();

    await CellSignal.init();
    const cellStatus = CellSignal.getStatus();
    console.log(`[VanSpot] Cell signal status: ${cellStatus.status} (${cellStatus.towerCount.toLocaleString()} towers)`);
    MapView.renderCellHeatmap(CellSignal.getCellGeoJSON());

    console.log('[VanSpot] Initial spot load…');
    loadSpotsForBounds(MapView.getBounds());
  }

  // Expose a debug helper callable from the browser console: VanSpot.debug()
  window.VanSpot = {
    debug() {
      console.group('VanSpot debug info');
      console.log('Cell signal:', CellSignal.getStatus());
      console.log('Active filters:', Filters.getState());
      console.log('Map bounds:', MapView.getBounds());
      console.groupEnd();
    },
    reload() { loadSpotsForBounds(MapView.getBounds()); },
  };

  document.addEventListener('DOMContentLoaded', start);

  return { onMapMoved, refresh };
})();
