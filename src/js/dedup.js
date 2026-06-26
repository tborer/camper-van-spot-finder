// Minimal geohash encoder (~30 lines, no external dependency)
const GEOHASH_CHARS = '0123456789bcdefghjkmnpqrstuvwxyz';

function encodeGeohash(lat, lng, precision = 6) {
  let idx = 0, bit = 0, evenBit = true, geohash = '';
  let latMin = -90, latMax = 90, lngMin = -180, lngMax = 180;
  while (geohash.length < precision) {
    if (evenBit) {
      const mid = (lngMin + lngMax) / 2;
      if (lng >= mid) { idx = idx * 2 + 1; lngMin = mid; }
      else { idx = idx * 2; lngMax = mid; }
    } else {
      const mid = (latMin + latMax) / 2;
      if (lat >= mid) { idx = idx * 2 + 1; latMin = mid; }
      else { idx = idx * 2; latMax = mid; }
    }
    evenBit = !evenBit;
    if (++bit === 5) { geohash += GEOHASH_CHARS[idx]; bit = 0; idx = 0; }
  }
  return geohash;
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[m][n];
}

function similarNames(a, b) {
  const na = a.toLowerCase(), nb = b.toLowerCase();
  return na.includes(nb) || nb.includes(na) || levenshtein(na, nb) < 3;
}

function deduplicateSpots(spots) {
  // Assign geohash to each spot
  spots.forEach(s => { s.geohash = encodeGeohash(s.lat, s.lng, 6); });

  const cells = {};
  spots.forEach(s => { (cells[s.geohash] = cells[s.geohash] || []).push(s); });

  const result = [];
  for (const group of Object.values(cells)) {
    const merged = [];
    for (const spot of group) {
      const existing = merged.find(m => similarNames(m.name, spot.name));
      if (existing) {
        // Keep OSM as primary; merge sources arrays
        const primary = existing.source === 'osm' ? existing : spot;
        const secondary = existing.source === 'osm' ? spot : existing;
        Object.assign(existing, primary);
        existing.sources = [...new Set([...(existing.sources || [existing.source]), secondary.source])];
      } else {
        spot.sources = spot.sources || [spot.source];
        merged.push(spot);
      }
    }
    result.push(...merged);
  }
  return result;
}
