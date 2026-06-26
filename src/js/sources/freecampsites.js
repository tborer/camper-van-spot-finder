// FreeCampsites.net integration — STUBBED
// To wire up: obtain API access by contacting freecampsites.net directly,
// then set CONFIG.FREECAMPSITES_API_KEY and CONFIG.FREECAMPSITES_BASE_URL,
// and implement the fetch/normalize logic below.

const FreeCampsites = (() => {
  async function fetchSpots(bounds) {
    console.warn('FreeCampsites data source not yet configured — stub in place');
    return [];
  }

  return { fetchSpots };
})();
