/** Linearly interpolate between two RGB triples. */
function lerpRGB(a, b, t) {
    return [
        Math.round(a[0] + (b[0] - a[0]) * t),
        Math.round(a[1] + (b[1] - a[1]) * t),
        Math.round(a[2] + (b[2] - a[2]) * t),
    ];
}
/** Multi-stop elevation gradient: blue → cyan → green → yellow → orange → red */
const ELEVATION_STOPS = [
    [0.0, [41, 182, 246]], // light blue
    [0.2, [0, 230, 230]], // cyan
    [0.4, [76, 175, 80]], // green
    [0.6, [255, 235, 59]], // yellow
    [0.8, [255, 152, 0]], // orange
    [1.0, [239, 83, 80]], // red
];
export function elevationToColor(elev, minElev, maxElev, alpha = 220) {
    const range = maxElev - minElev;
    const t = range > 0 ? Math.max(0, Math.min(1, (elev - minElev) / range)) : 0;
    for (let i = 0; i < ELEVATION_STOPS.length - 1; i++) {
        const [t0, c0] = ELEVATION_STOPS[i];
        const [t1, c1] = ELEVATION_STOPS[i + 1];
        if (t >= t0 && t <= t1) {
            const u = (t - t0) / (t1 - t0);
            const [r, g, b] = lerpRGB(c0, c1, u);
            return [r, g, b, alpha];
        }
    }
    return [...ELEVATION_STOPS[ELEVATION_STOPS.length - 1][1], alpha];
}
/**
 * Slope gradient: blue (steep descent) → white (flat) → red (steep ascent).
 * Clamped to ±40%.
 */
export function slopeToColor(slopePct, alpha = 220) {
    const MAX = 40;
    const t = Math.max(-1, Math.min(1, slopePct / MAX)); // -1..1
    if (t < 0) {
        // descent: blue
        const u = -t;
        return [
            Math.round(255 - 255 * u),
            Math.round(255 - 255 * u),
            255,
            alpha,
        ];
    }
    else if (t > 0) {
        // ascent: red
        return [
            255,
            Math.round(255 - 255 * t),
            Math.round(255 - 255 * t),
            alpha,
        ];
    }
    return [200, 200, 200, alpha]; // flat = grey
}
/** Convert a solid route color [R,G,B] to RGBA with given alpha. */
export function solidColor(rgb, alpha = 220) {
    return [rgb[0], rgb[1], rgb[2], alpha];
}
/** CSS hex string from RGBA array. */
export function rgbaToHex(rgba) {
    return ('#' +
        rgba
            .slice(0, 3)
            .map((v) => v.toString(16).padStart(2, '0'))
            .join(''));
}
/** Format duration (seconds) → "H:MM:SS" or "MM:SS" */
export function formatDuration(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0)
        return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
}
