#!/usr/bin/env node
/**
 * Fetches iOverlander community spots for the US/Canada during CI and writes
 * them to src/data/ioverlander-spots.json for static serving.
 * Skipped if the output file is < 3 days old (cache check).
 * Falls back to an empty spots array on any fetch failure so the build
 * doesn't break if iOverlander is unavailable.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const OUTPUT_PATH = path.join(__dirname, '../src/data/ioverlander-spots.json');
const MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

// Bounding boxes to fetch — split into regions to avoid huge single requests
const REGIONS = [
  { name: 'US West',     south: 30, north: 50, west: -125, east:  -95 },
  { name: 'US East',     south: 24, north: 50, west:  -95, east:  -66 },
  { name: 'Canada West', south: 48, north: 60, west: -140, east:  -95 },
  { name: 'Canada East', south: 44, north: 60, west:  -95, east:  -52 },
];

function isFileFresh(filePath) {
  try {
    const stat = fs.statSync(filePath);
    return Date.now() - stat.mtimeMs < MAX_AGE_MS;
  } catch { return false; }
}

function httpsGet(url, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 5) return reject(new Error('Too many redirects'));
    const req = https.get(url, {
      timeout: 30000,
      headers: { 'User-Agent': 'VanSpot/1.0 CI data fetcher' },
    }, res => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        res.resume();
        return httpsGet(res.headers.location, redirectCount + 1).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} from ${url}`));
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error(`Timeout: ${url}`)); });
  });
}

function normalize(place) {
  const lat = parseFloat(place.latitude);
  const lng = parseFloat(place.longitude);
  if (isNaN(lat) || isNaN(lng)) return null;
  return {
    id: `ioverlander-${place.id}`,
    name: place.name || 'Unnamed iOverlander Spot',
    type: place.category_name?.toLowerCase().includes('camp') ? 'campsite' : 'overlanding',
    lat,
    lng,
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

async function fetchRegion(region) {
  const { name, south, north, west, east } = region;
  const url = `https://www.ioverlander.com/places.json?latstart=${south}&latend=${north}&lonstart=${west}&lonend=${east}`;
  process.stdout.write(`  ${name}... `);
  try {
    const text = await httpsGet(url);
    const json = JSON.parse(text);
    const places = Array.isArray(json) ? json : json.places || [];
    const spots = places.map(normalize).filter(Boolean);
    console.log(`${spots.length} spots`);
    return spots;
  } catch (err) {
    console.warn(`SKIP (${err.message})`);
    return [];
  }
}

async function main() {
  if (isFileFresh(OUTPUT_PATH)) {
    console.log('ioverlander-spots.json is fresh (< 3 days old) — skipping fetch.');
    return;
  }

  console.log('Fetching iOverlander spots by region…');
  const allSpots = [];
  for (const region of REGIONS) {
    const spots = await fetchRegion(region);
    allSpots.push(...spots);
  }

  // Deduplicate by id
  const seen = new Set();
  const unique = allSpots.filter(s => { if (seen.has(s.id)) return false; seen.add(s.id); return true; });

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify({ spots: unique }, null, 2));
  console.log(`\nDone. ${unique.length} unique iOverlander spots written to ${OUTPUT_PATH}`);
}

main().catch(err => {
  console.error('build-ioverlander-data failed:', err.message);
  // Write empty file so the app loads gracefully
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify({ spots: [], error: err.message }));
  // Don't exit(1) — a missing iOverlander source shouldn't break the deploy
});
