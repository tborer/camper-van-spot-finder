#!/usr/bin/env node
/**
 * Downloads OpenCelliD CSV tiles for the US and converts to GeoJSON.
 * Skipped if src/data/cell-towers.geojson is < 7 days old.
 * Falls back to stub data if OPENCELLID_API_KEY is absent or set to the placeholder.
 *
 * OpenCelliD CSV columns (no header row in per-MCC files):
 *   radio, mcc, net, area, cell, unit, lon, lat, range, samples, changeable, created, updated, averageSignal
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const zlib = require('zlib');
const { pipeline } = require('stream/promises');
const { Writable } = require('stream');

const OUTPUT_PATH = path.join(__dirname, '../src/data/cell-towers.geojson');
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const API_KEY = process.env.OPENCELLID_API_KEY || '';

// US Mobile Country Codes (310–316 cover all US carriers)
const US_MCCS = ['310', '311', '312', '313', '314', '315', '316'];

// Continental US bounding box (excludes AK/HI for data size; extend if needed)
const US_BOUNDS = { minLat: 24, maxLat: 50, minLng: -125, maxLng: -66 };

// Only keep towers with enough real-world observations
const MIN_SAMPLES = 5;

// Prefer LTE; also keep UMTS/GSM as fallback signal indicators
const PREFERRED_RADIO = new Set(['LTE', 'NR', 'UMTS', 'GSM']);

function isFileFresh(filePath) {
  try {
    const stat = fs.statSync(filePath);
    return Date.now() - stat.mtimeMs < MAX_AGE_MS;
  } catch {
    return false;
  }
}

function stubGeoJSON() {
  const samples = [
    [47.6, -122.3],   // Seattle
    [37.7, -122.4],   // San Francisco
    [34.05, -118.24], // Los Angeles
    [39.74, -104.98], // Denver
    [41.88, -87.63],  // Chicago
    [29.76, -95.37],  // Houston
    [33.45, -112.07], // Phoenix
    [25.77, -80.19],  // Miami
    [40.71, -74.01],  // New York
    [47.61, -122.33], // Bellevue
  ];
  return {
    type: 'FeatureCollection',
    features: samples.map(([lat, lon], i) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lon, lat] },
      properties: { radio: 'LTE', samples: 100 + i },
    })),
  };
}

function downloadGz(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { timeout: 120000 }, res => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        return downloadGz(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      const chunks = [];
      const gunzip = zlib.createGunzip();
      res.pipe(gunzip);
      gunzip.on('data', chunk => chunks.push(chunk));
      gunzip.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      gunzip.on('error', reject);
      res.on('error', reject);
    }).on('error', reject).on('timeout', () => reject(new Error(`Timeout: ${url}`)));
  });
}

function parseCSV(text, features) {
  // Per-MCC files have no header row
  // Columns: radio,mcc,net,area,cell,unit,lon,lat,range,samples,changeable,created,updated,averageSignal
  const lines = text.split('\n');
  let added = 0;
  for (const line of lines) {
    if (!line.trim()) continue;
    const cols = line.split(',');
    if (cols.length < 8) continue;

    const radio = cols[0];
    const lon = parseFloat(cols[6]);
    const lat = parseFloat(cols[7]);
    const samples = parseInt(cols[9], 10) || 0;

    if (!PREFERRED_RADIO.has(radio)) continue;
    if (samples < MIN_SAMPLES) continue;
    if (isNaN(lat) || isNaN(lon)) continue;
    if (lat < US_BOUNDS.minLat || lat > US_BOUNDS.maxLat) continue;
    if (lon < US_BOUNDS.minLng || lon > US_BOUNDS.maxLng) continue;

    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lon, lat] },
      properties: { radio, samples },
    });
    added++;
  }
  return added;
}

async function main() {
  if (isFileFresh(OUTPUT_PATH)) {
    console.log('cell-towers.geojson is fresh (< 7 days old) — skipping download.');
    return;
  }

  const isStub = !API_KEY || API_KEY === 'STUB_OPENCELLID_KEY';
  if (isStub) {
    console.warn('OPENCELLID_API_KEY not set — writing stub GeoJSON (10 sample towers).');
    fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(stubGeoJSON(), null, 2));
    return;
  }

  console.log(`Downloading OpenCelliD data for US MCCs: ${US_MCCS.join(', ')}`);
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });

  const features = [];
  for (const mcc of US_MCCS) {
    const url = `https://opencellid.org/ocid/downloads?token=${API_KEY}&type=mcc&file=${mcc}.csv.gz`;
    process.stdout.write(`  MCC ${mcc}... `);
    try {
      const text = await downloadGz(url);
      const added = parseCSV(text, features);
      console.log(`${added.toLocaleString()} towers`);
    } catch (err) {
      console.warn(`SKIP (${err.message})`);
    }
  }

  const geojson = { type: 'FeatureCollection', features };
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(geojson));
  console.log(`\nDone. Total towers written: ${features.length.toLocaleString()}`);
  console.log(`Output: ${OUTPUT_PATH}`);
}

main().catch(err => {
  console.error('build-cell-data failed:', err);
  process.exit(1);
});
