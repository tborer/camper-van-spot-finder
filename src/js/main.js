const Main = (() => {
  let moveDebounce = null;
  let activated = false; // true once user has intentionally navigated somewhere

  const MIN_ZOOM_TO_LOAD = 9;

  function activate() {
    if (!activated) {
      activated = true;
      document.getElementById('map-prompt')?.classList.add('hidden');
      console.log('[VanSpot] Activated — loading spots after navigation completes');
      // Wait for flyTo animation to finish before the first fetch
      // flyTo duration is 1.2s; poll until zoom is stable rather than hardcoding
      waitForMapThenLoad();
    }
  }

  function waitForMapThenLoad() {
    // Poll every 200ms until the map stops moving (flyTo animation done)
    // then kick off the first load. Cap at 10 attempts (~2s).
    let attempts = 0;
    let lastZoom = MapView.getZoom();
    const poll = setInterval(() => {
      const zoom = MapView.getZoom();
      const stable = zoom === lastZoom && ++attempts > 2; // stable for at least 2 checks
      lastZoom = zoom;
      if (stable || attempts >= 10) {
        clearInterval(poll);
        if (zoom >= MIN_ZOOM_TO_LOAD) {
          console.log(`[VanSpot] Map settled at zoom ${zoom} — loading spots`);
          loadSpotsForBounds(MapView.getBounds());
        } else {
          console.log(`[VanSpot] Map settled at zoom ${zoom} — below minimum ${MIN_ZOOM_TO_LOAD}, not loading`);
        }
      }
    }, 200);
  }

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
        console.warn('[VanSpot] All spots were filtered out — check active filters.');
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
    if (!activated) {
      console.log('[VanSpot] Map moved but not yet activated — search or use locate to begin');
      return;
    }
    clearTimeout(moveDebounce);
    moveDebounce = setTimeout(() => {
      const zoom = MapView.getZoom();
      if (zoom < MIN_ZOOM_TO_LOAD) {
        console.log(`[VanSpot] Zoom ${zoom} — zoom in to at least ${MIN_ZOOM_TO_LOAD} to load spots`);
        MapView.clearSpots();
        UI.renderResults([], null);
        return;
      }
      loadSpotsForBounds(MapView.getBounds());
    }, 1000);
  }

  function refresh() {
    if (activated) loadSpotsForBounds(MapView.getBounds());
  }

  async function start() {
    console.log('[VanSpot] Starting up…');
    MapView.init();
    UI.init();
    Search.init();

    await CellSignal.init();
    const cellStatus = CellSignal.getStatus();
    console.log(`[VanSpot] Cell signal: ${cellStatus.status} (${cellStatus.towerCount.toLocaleString()} towers)`);
    MapView.renderCellHeatmap(CellSignal.getCellGeoJSON());

    // Restore from URL hash if present — counts as intentional navigation
    const restored = Search.restoreFromHash();
    if (restored) {
      // restoreFromHash calls flyTo via setTimeout(200ms); activate() polls
      // until the animation settles before fetching
      setTimeout(() => activate(), 250);
    } else {
      UI.showWelcome();
      console.log('[VanSpot] Waiting for user to search or use locate before loading spots.');
    }
  }

  window.VanSpot = {
    debug() {
      console.group('VanSpot debug info');
      console.log('Activated:', activated);
      console.log('Cell signal:', CellSignal.getStatus());
      console.log('Active filters:', Filters.getState());
      console.log('Map bounds:', MapView.getBounds());
      console.log('Zoom:', MapView.getZoom());
      console.groupEnd();
    },
    reload() { if (activated) loadSpotsForBounds(MapView.getBounds()); },
  };

  document.addEventListener('DOMContentLoaded', start);

  return { onMapMoved, refresh, activate, loadSpotsForBounds };
})();
