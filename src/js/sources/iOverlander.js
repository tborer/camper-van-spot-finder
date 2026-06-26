// iOverlander — CORS-blocked from static hosting (no Access-Control-Allow-Origin header)
// Their API would need a server-side proxy to work from GitHub Pages.
// Stubbed out to prevent console errors on every map move.
// To re-enable: set up a proxy endpoint and update fetchSpots below.

const IOverlander = (() => {
  let warned = false;

  async function fetchSpots(bounds) {
    if (!warned) {
      console.warn('[iOverlander] Disabled — API is CORS-blocked from static hosting. ' +
        'A server-side proxy would be required to use this data source.');
      warned = true;
    }
    return [];
  }

  return { fetchSpots };
})();
