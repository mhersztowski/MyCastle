import { computeRouteStats } from './routeAnalysis';
import { ROUTE_PALETTE } from '../types';
let colorIndex = 0;
function nextColor() {
    return ROUTE_PALETTE[colorIndex++ % ROUTE_PALETTE.length];
}
/** Parse a GPX XML string into a TrailRoute. */
export function parseGpx(gpxText, fileName) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(gpxText, 'application/xml');
    if (doc.querySelector('parsererror')) {
        console.error('GPX parse error');
        return null;
    }
    const name = doc.querySelector('trk > name')?.textContent?.trim() ||
        doc.querySelector('metadata > name')?.textContent?.trim() ||
        fileName.replace(/\.gpx$/i, '');
    // Track points (trkpt)
    const trkpts = Array.from(doc.querySelectorAll('trkpt'));
    const coordinates = [];
    const timestamps = [];
    let hasTimestamps = true;
    for (const pt of trkpts) {
        const lat = parseFloat(pt.getAttribute('lat') ?? 'NaN');
        const lon = parseFloat(pt.getAttribute('lon') ?? 'NaN');
        const ele = parseFloat(pt.querySelector('ele')?.textContent ?? '0');
        if (isNaN(lat) || isNaN(lon))
            continue;
        coordinates.push([lon, lat, isNaN(ele) ? 0 : ele]);
        const timeEl = pt.querySelector('time')?.textContent;
        if (timeEl) {
            timestamps.push(new Date(timeEl).getTime() / 1000);
        }
        else {
            hasTimestamps = false;
        }
    }
    if (coordinates.length < 2)
        return null;
    // Named waypoints (wpt elements)
    const waypoints = [];
    for (const wpt of doc.querySelectorAll('wpt')) {
        const lat = parseFloat(wpt.getAttribute('lat') ?? 'NaN');
        const lon = parseFloat(wpt.getAttribute('lon') ?? 'NaN');
        const ele = parseFloat(wpt.querySelector('ele')?.textContent ?? '0');
        const wptName = wpt.querySelector('name')?.textContent?.trim() ?? 'Waypoint';
        const sym = wpt.querySelector('sym')?.textContent?.trim();
        if (!isNaN(lat) && !isNaN(lon)) {
            waypoints.push({
                position: [lon, lat, isNaN(ele) ? 0 : ele],
                name: wptName,
                type: 'wpt',
                sym,
            });
        }
    }
    // Add start / end waypoints from the track itself
    waypoints.unshift({
        position: coordinates[0],
        name: 'Start',
        type: 'start',
    });
    waypoints.push({
        position: coordinates[coordinates.length - 1],
        name: 'Finish',
        type: 'end',
    });
    const stats = computeRouteStats(coordinates, hasTimestamps && timestamps.length === coordinates.length ? timestamps : undefined);
    return {
        id: crypto.randomUUID(),
        name,
        coordinates,
        timestamps: hasTimestamps && timestamps.length === coordinates.length ? timestamps : undefined,
        waypoints,
        color: nextColor(),
        visible: true,
        stats,
    };
}
/** Parse a GeoJSON string — accepts FeatureCollection, Feature<LineString> or LineString. */
export function parseGeoJson(jsonText, fileName) {
    let parsed;
    try {
        parsed = JSON.parse(jsonText);
    }
    catch {
        return null;
    }
    const name = fileName.replace(/\.geojson$/i, '').replace(/\.json$/i, '');
    let coords = null;
    // Normalise to coordinates array
    if (isGeoJsonObj(parsed, 'FeatureCollection')) {
        const fc = parsed;
        const lineFeature = fc.features.find((f) => f.geometry?.type === 'LineString' || f.geometry?.type === 'MultiLineString');
        if (!lineFeature)
            return null;
        if (lineFeature.geometry.type === 'LineString') {
            coords = lineFeature.geometry.coordinates;
        }
        else {
            coords = lineFeature.geometry.coordinates.flat();
        }
    }
    else if (isGeoJsonObj(parsed, 'Feature')) {
        const feat = parsed;
        if (feat.geometry?.type === 'LineString') {
            coords = feat.geometry.coordinates;
        }
        else if (feat.geometry?.type === 'MultiLineString') {
            coords = feat.geometry.coordinates.flat();
        }
    }
    else if (isGeoJsonObj(parsed, 'LineString')) {
        coords = parsed.coordinates;
    }
    if (!coords || coords.length < 2)
        return null;
    const normalized = coords.map((c) => [
        c[0],
        c[1],
        c[2] ?? 0,
    ]);
    const stats = computeRouteStats(normalized, undefined);
    const waypoints = [
        { position: normalized[0], name: 'Start', type: 'start' },
        { position: normalized[normalized.length - 1], name: 'Finish', type: 'end' },
    ];
    return {
        id: crypto.randomUUID(),
        name,
        coordinates: normalized,
        waypoints,
        color: nextColor(),
        visible: true,
        stats,
    };
}
function isGeoJsonObj(obj, type) {
    return typeof obj === 'object' && obj !== null && obj.type === type;
}
