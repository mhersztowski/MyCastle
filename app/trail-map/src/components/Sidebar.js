import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useRef } from 'react';
import { MAP_STYLES } from '../types';
import { ElevationChart } from './ElevationChart';
import { formatDuration, rgbaToHex, solidColor } from '../utils/colors';
import { parseGpx, parseGeoJson } from '../utils/gpx';
const css = {
    sidebar: {
        width: 320,
        minWidth: 260,
        maxWidth: 400,
        height: '100%',
        background: '#1e1e1e',
        borderRight: '1px solid #2d2d2d',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
    },
    header: {
        padding: '12px 16px',
        borderBottom: '1px solid #2d2d2d',
        fontSize: 16,
        fontWeight: 700,
        color: '#4fc3f7',
        letterSpacing: '0.04em',
        flexShrink: 0,
    },
    section: {
        borderBottom: '1px solid #2d2d2d',
        padding: '10px 14px',
        flexShrink: 0,
    },
    label: { fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 },
    scroll: { overflowY: 'auto', flex: 1, minHeight: 0 },
    routeItem: (selected) => ({
        padding: '8px 14px',
        cursor: 'pointer',
        background: selected ? '#2a2d2e' : 'transparent',
        borderLeft: selected ? '3px solid #4fc3f7' : '3px solid transparent',
        transition: 'background 0.15s',
    }),
    statGrid: {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '6px 12px',
        marginTop: 8,
    },
    statItem: { display: 'flex', flexDirection: 'column' },
    statValue: { fontSize: 15, fontWeight: 600, color: '#e0e0e0' },
    statLabel: { fontSize: 10, color: '#666' },
    btn: (active) => ({
        padding: '5px 10px',
        fontSize: 12,
        borderRadius: 4,
        border: '1px solid #444',
        background: active ? '#4fc3f7' : '#2d2d2d',
        color: active ? '#000' : '#ccc',
        cursor: 'pointer',
        transition: 'background 0.15s, color 0.15s',
    }),
    dropZone: {
        border: '2px dashed #444',
        borderRadius: 8,
        padding: '14px',
        textAlign: 'center',
        fontSize: 12,
        color: '#666',
        cursor: 'pointer',
        transition: 'border-color 0.15s',
    },
};
function StatItem({ value, label }) {
    return (_jsxs("div", { style: css.statItem, children: [_jsx("span", { style: css.statValue, children: value }), _jsx("span", { style: css.statLabel, children: label })] }));
}
function RouteStats({ stats, name }) {
    return (_jsxs("div", { children: [_jsx("div", { style: { fontSize: 13, fontWeight: 600, color: '#ccc', marginBottom: 6 }, children: name }), _jsxs("div", { style: css.statGrid, children: [_jsx(StatItem, { value: `${stats.totalDistance.toFixed(2)} km`, label: "Distance" }), _jsx(StatItem, { value: `↑ ${stats.elevationGain} m`, label: "Elevation gain" }), _jsx(StatItem, { value: `↓ ${stats.elevationLoss} m`, label: "Elevation loss" }), _jsx(StatItem, { value: `${stats.maxElevation} m`, label: "Max elevation" }), _jsx(StatItem, { value: `${stats.minElevation} m`, label: "Min elevation" }), stats.duration != null && (_jsx(StatItem, { value: formatDuration(stats.duration), label: "Duration" }))] })] }));
}
export function Sidebar({ routes, selectedRouteId, mapStyle, colorMode, viewMode, isAnimating, hover, onAddRoute, onRemoveRoute, onToggleRoute, onSelectRoute, onMapStyle, onColorMode, onViewMode, onToggleAnim, onHoverProgress, }) {
    const fileRef = useRef(null);
    const selectedRoute = routes.find((r) => r.id === selectedRouteId) ?? null;
    function handleFiles(files) {
        if (!files)
            return;
        Array.from(files).forEach((file) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const text = e.target?.result;
                const lower = file.name.toLowerCase();
                let route = null;
                if (lower.endsWith('.gpx')) {
                    route = parseGpx(text, file.name);
                }
                else if (lower.endsWith('.geojson') || lower.endsWith('.json')) {
                    route = parseGeoJson(text, file.name);
                }
                if (route)
                    onAddRoute(route);
            };
            reader.readAsText(file);
        });
    }
    function handleDrop(e) {
        e.preventDefault();
        handleFiles(e.dataTransfer.files);
    }
    function handleDragOver(e) {
        e.preventDefault();
        e.currentTarget.style.borderColor = '#4fc3f7';
    }
    function handleDragLeave(e) {
        e.currentTarget.style.borderColor = '#444';
    }
    return (_jsxs("div", { style: css.sidebar, children: [_jsx("div", { style: css.header, children: "Trail Map" }), _jsxs("div", { style: css.section, children: [_jsx("div", { style: css.label, children: "View" }), _jsxs("div", { style: { display: 'flex', gap: 6, flexWrap: 'wrap' }, children: [_jsx("button", { style: css.btn(viewMode === '2d'), onClick: () => onViewMode('2d'), children: "2D" }), _jsx("button", { style: css.btn(viewMode === '3d'), onClick: () => onViewMode('3d'), children: "3D" }), _jsx("button", { style: css.btn(isAnimating), onClick: onToggleAnim, disabled: !selectedRoute, title: "Animate selected route", children: isAnimating ? '⏹ Stop' : '▶ Animate' })] })] }), _jsxs("div", { style: css.section, children: [_jsx("div", { style: css.label, children: "Map style" }), _jsx("div", { style: { display: 'flex', gap: 6, flexWrap: 'wrap' }, children: MAP_STYLES.map((s) => (_jsx("button", { style: css.btn(mapStyle === s.id), onClick: () => onMapStyle(s.id), children: s.label }, s.id))) })] }), _jsxs("div", { style: css.section, children: [_jsx("div", { style: css.label, children: "Color mode" }), _jsx("div", { style: { display: 'flex', gap: 6 }, children: ['solid', 'elevation', 'slope'].map((m) => (_jsx("button", { style: css.btn(colorMode === m), onClick: () => onColorMode(m), children: m.charAt(0).toUpperCase() + m.slice(1) }, m))) })] }), _jsxs("div", { style: css.section, children: [_jsx("div", { style: css.label, children: "Load route" }), _jsxs("div", { style: css.dropZone, onDrop: handleDrop, onDragOver: handleDragOver, onDragLeave: handleDragLeave, onClick: () => fileRef.current?.click(), children: ["Drop GPX / GeoJSON file here", _jsx("br", {}), _jsx("span", { style: { color: '#4fc3f7', fontSize: 11 }, children: "or click to browse" })] }), _jsx("input", { ref: fileRef, type: "file", accept: ".gpx,.geojson,.json", multiple: true, style: { display: 'none' }, onChange: (e) => handleFiles(e.target.files) })] }), _jsxs("div", { style: css.scroll, children: [routes.length === 0 && (_jsxs("div", { style: { padding: '20px 14px', fontSize: 12, color: '#555', textAlign: 'center' }, children: ["No routes loaded yet.", _jsx("br", {}), "Drop a GPX file above to start."] })), routes.map((route) => {
                        const isSelected = route.id === selectedRouteId;
                        const colorHex = rgbaToHex(solidColor(route.color));
                        return (_jsxs("div", { children: [_jsx("div", { style: css.routeItem(isSelected), onClick: () => onSelectRoute(isSelected ? null : route.id), children: _jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 8 }, children: [_jsx("div", { style: {
                                                    width: 12,
                                                    height: 12,
                                                    borderRadius: '50%',
                                                    background: colorHex,
                                                    flexShrink: 0,
                                                    opacity: route.visible ? 1 : 0.3,
                                                } }), _jsxs("div", { style: { flex: 1, minWidth: 0 }, children: [_jsx("div", { style: {
                                                            fontSize: 13,
                                                            fontWeight: 500,
                                                            color: route.visible ? '#e0e0e0' : '#555',
                                                            overflow: 'hidden',
                                                            textOverflow: 'ellipsis',
                                                            whiteSpace: 'nowrap',
                                                        }, children: route.name }), _jsxs("div", { style: { fontSize: 11, color: '#666' }, children: [route.stats.totalDistance.toFixed(2), " km \u00B7 \u2191", route.stats.elevationGain, " m"] })] }), _jsxs("div", { style: { display: 'flex', gap: 4 }, children: [_jsx("button", { style: { ...css.btn(), padding: '2px 7px', fontSize: 11 }, onClick: (e) => { e.stopPropagation(); onToggleRoute(route.id); }, title: route.visible ? 'Hide' : 'Show', children: route.visible ? '👁' : '🚫' }), _jsx("button", { style: { ...css.btn(), padding: '2px 7px', fontSize: 11, color: '#f44' }, onClick: (e) => { e.stopPropagation(); onRemoveRoute(route.id); }, title: "Remove", children: "\u00D7" })] })] }) }), isSelected && (_jsxs("div", { style: { padding: '8px 14px 12px', background: '#252526', borderBottom: '1px solid #333' }, children: [_jsx(RouteStats, { stats: route.stats, name: "" }), _jsxs("div", { style: { marginTop: 12 }, children: [_jsx("div", { style: css.label, children: "Elevation profile" }), _jsx(ElevationChart, { route: route, hover: hover, onHoverProgress: onHoverProgress })] })] }))] }, route.id));
                    })] })] }));
}
