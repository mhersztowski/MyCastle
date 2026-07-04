import { test, expect } from '@playwright/test';
import { gotoCad, openMode } from './helpers';

// Exercises core-cad-viewer (Leaflet map + MapNode model) and the GPX/GeoJSON
// import path (geoImporter → importAsGroup → Leaflet render).
test.describe('CAD Map — GPX / GeoJSON import', () => {
  test.beforeEach(async ({ page }) => {
    await gotoCad(page);
    await openMode(page, 'Map');
    await expect(page.locator('.leaflet-container').first()).toBeAttached();
  });

  test('imports a GeoJSON file and adds vector features', async ({ page }) => {
    const geojson = JSON.stringify({
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: { name: 'Punkt' }, geometry: { type: 'Point', coordinates: [21.0, 52.2] } },
        { type: 'Feature', properties: { name: 'Linia' }, geometry: { type: 'LineString', coordinates: [[21.0, 52.2], [21.1, 52.3]] } },
        { type: 'Feature', properties: { name: 'Obszar' }, geometry: { type: 'Polygon', coordinates: [[[21, 52], [21.1, 52], [21.1, 52.1], [21, 52]]] } },
      ],
    });
    await page.locator('input[type="file"][accept*="gpx"]').first().setInputFiles({
      name: 'trasa.geojson', mimeType: 'application/geo+json', buffer: Buffer.from(geojson),
    });
    // Vector paths get added to the Leaflet overlay pane (LineString + Polygon).
    await expect(page.locator('.leaflet-overlay-pane path').first()).toBeAttached();
    // The import group (named after the file) appears in the hierarchy.
    await expect(page.getByText('trasa', { exact: false }).first()).toBeAttached();
  });

  test('imports a GPX file (waypoint + track)', async ({ page }) => {
    const gpx = `<?xml version="1.0"?><gpx version="1.1"><wpt lat="52.2" lon="21.0"><name>WP</name></wpt><trk><name>Szlak</name><trkseg><trkpt lat="52.2" lon="21.0"/><trkpt lat="52.3" lon="21.1"/></trkseg></trk></gpx>`;
    await page.locator('input[type="file"][accept*="gpx"]').first().setInputFiles({
      name: 'wycieczka.gpx', mimeType: 'application/gpx+xml', buffer: Buffer.from(gpx),
    });
    await expect(page.locator('.leaflet-overlay-pane path').first()).toBeAttached();
    await expect(page.getByText('wycieczka', { exact: false }).first()).toBeAttached();
  });
});
