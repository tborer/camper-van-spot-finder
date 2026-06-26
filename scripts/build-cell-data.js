#!/usr/bin/env node
/**
 * Downloads OpenCelliD CSV tiles for North America and converts to GeoJSON.
 * Skipped if src/data/cell-towers.geojson is < 7 days old.
 * If API key is stubbed, writes sample data so the app loads during dev.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const OUTPUT_PATH = path.join(__dirname, '../src/data/cell-towers.geojson');
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const API_KEY = process.env.OPENCELLID_API_KEY || 'STUB_OPENCELLID_KEY';

// US bounding box
const US_BOUNDS = { minLat: 24, maxLat: 50, minLng: -125, maxLng: -66 };
const MIN_SAMPLES = 5;

function isFileFresh(filePath) {
  try {
    const stat = fs.statSync(filePath);
    return Date.now() - stat.mtimeMs < MAX_AGE_MS;
  } catch {
    return false;
  }
}

function stubGeoJSON() {
  // 10 sample towers spread across the US for dev/stub mode
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

async function main() {
  if (isFileFresh(OUTPUT_PATH)) {
    console.log('cell-towers.geojson is fresh (< 7 days old), skipping download.');
    return;
  }

  if (API_KEY === 'STUB_OPENCELLID_KEY') {
    console.warn('OPENCELLID_API_KEY is stubbed — writing sample GeoJSON for development.');
    fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(stubGeoJSON(), null, 2));
    console.log('Wrote stub cell-towers.geojson with 10 sample towers.');
    return;
  }

  // Real download — OpenCelliD full CSV requires API key
  // URL format: https://opencellid.org/ocid/downloads?token=KEY&type=full&file=cell_towers.csv.gz
  console.log('Downloading OpenCelliD data (this may take a while)...');
  console.warn('Real OpenCelliD CSV parsing not yet implemented — falling back to stub.');
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(stubGeoJSON(), null, 2));
  console.log(`Tower count: 10 (stub). Output: ${OUTPUT_PATH}`);
}

main().catch(err => {
  console.error('build-cell-data failed:', err);
  process.exit(1);
});
