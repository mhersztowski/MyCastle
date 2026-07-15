import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { MapView } from './components/MapView';
import { Sidebar } from './components/Sidebar';
import { cumulativeDistances } from './utils/routeAnalysis';
import * as turf from '@turf/turf';
export function App() {
    const [routes, setRoutes] = useState([]);
    const [selectedRouteId, setSelectedRouteId] = useState(null);
    const [mapStyle, setMapStyle] = useState('liberty');
    const [colorMode, setColorMode] = useState('elevation');
    const [viewMode, setViewMode] = useState('2d');
    const [hover, setHover] = useState(null);
    const [isAnimating, setIsAnimating] = useState(false);
    const [animProgress, setAnimProgress] = useState(0); // 0..1
    const animFrameRef = useRef(0);
    const animStartRef = useRef(0);
    const ANIM_DURATION_MS = 30_000; // 30 s for full route
    // --- Route CRUD ---
    const handleAddRoute = useCallback((route) => {
        setRoutes((prev) => [...prev, route]);
        setSelectedRouteId(route.id);
    }, []);
    const handleRemoveRoute = useCallback((id) => {
        setRoutes((prev) => prev.filter((r) => r.id !== id));
        setSelectedRouteId((prev) => (prev === id ? null : prev));
    }, []);
    const handleToggleRoute = useCallback((id) => {
        setRoutes((prev) => prev.map((r) => (r.id === id ? { ...r, visible: !r.visible } : r)));
    }, []);
    // --- Animation ---
    const startAnim = useCallback(() => {
        animStartRef.current = performance.now() - animProgress * ANIM_DURATION_MS;
        setIsAnimating(true);
    }, [animProgress]);
    const stopAnim = useCallback(() => {
        setIsAnimating(false);
        cancelAnimationFrame(animFrameRef.current);
    }, []);
    const handleToggleAnim = useCallback(() => {
        if (isAnimating)
            stopAnim();
        else
            startAnim();
    }, [isAnimating, startAnim, stopAnim]);
    useEffect(() => {
        if (!isAnimating)
            return;
        const tick = (now) => {
            const elapsed = (now - animStartRef.current) % ANIM_DURATION_MS;
            setAnimProgress(elapsed / ANIM_DURATION_MS);
            animFrameRef.current = requestAnimationFrame(tick);
        };
        animFrameRef.current = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(animFrameRef.current);
    }, [isAnimating]);
    // Stop animation when route is deselected
    useEffect(() => {
        if (!selectedRouteId)
            stopAnim();
    }, [selectedRouteId, stopAnim]);
    // --- Animated position (computed from animProgress + Turf) ---
    const animPosition = useMemo(() => {
        if (!isAnimating || !selectedRouteId)
            return null;
        const route = routes.find((r) => r.id === selectedRouteId);
        if (!route || route.coordinates.length < 2)
            return null;
        const targetDist = animProgress * route.stats.totalDistance;
        const line = turf.lineString(route.coordinates.map((c) => [c[0], c[1]]));
        const pt = turf.along(line, targetDist, { units: 'kilometers' });
        const [lng, lat] = pt.geometry.coordinates;
        // Interpolate elevation at this position
        const cumDist = cumulativeDistances(route.coordinates);
        let best = 0;
        let bestDiff = Infinity;
        for (let i = 0; i < cumDist.length; i++) {
            const diff = Math.abs(cumDist[i] - targetDist);
            if (diff < bestDiff) {
                bestDiff = diff;
                best = i;
            }
        }
        const ele = route.coordinates[best][2];
        return [lng, lat, ele];
    }, [isAnimating, selectedRouteId, routes, animProgress]);
    // --- Hover from elevation chart ---
    const handleHoverProgress = useCallback((progress, coordIndex) => {
        if (progress == null || coordIndex == null || !selectedRouteId) {
            setHover(null);
            return;
        }
        const route = routes.find((r) => r.id === selectedRouteId);
        if (!route) {
            setHover(null);
            return;
        }
        const cumDist = cumulativeDistances(route.coordinates);
        const coord = route.coordinates[coordIndex];
        setHover({
            coordIndex,
            distanceFromStart: cumDist[coordIndex],
            elevation: coord[2],
            position: [coord[0], coord[1]],
            routeId: selectedRouteId,
        });
    }, [selectedRouteId, routes]);
    return (_jsxs("div", { style: { display: 'flex', width: '100%', height: '100%' }, children: [_jsx(Sidebar, { routes: routes, selectedRouteId: selectedRouteId, mapStyle: mapStyle, colorMode: colorMode, viewMode: viewMode, isAnimating: isAnimating, hover: hover, onAddRoute: handleAddRoute, onRemoveRoute: handleRemoveRoute, onToggleRoute: handleToggleRoute, onSelectRoute: setSelectedRouteId, onMapStyle: setMapStyle, onColorMode: setColorMode, onViewMode: setViewMode, onToggleAnim: handleToggleAnim, onHoverProgress: handleHoverProgress }), _jsxs("div", { style: { flex: 1, position: 'relative' }, children: [_jsx(MapView, { routes: routes, selectedRouteId: selectedRouteId, mapStyle: mapStyle, colorMode: colorMode, viewMode: viewMode, animPosition: animPosition, hover: hover, onHover: setHover, onSelectRoute: setSelectedRouteId }), hover && (_jsxs("div", { style: {
                            position: 'absolute',
                            bottom: 40,
                            left: '50%',
                            transform: 'translateX(-50%)',
                            background: 'rgba(37, 37, 38, 0.92)',
                            border: '1px solid #444',
                            borderRadius: 6,
                            padding: '6px 14px',
                            fontSize: 12,
                            color: '#e0e0e0',
                            pointerEvents: 'none',
                            whiteSpace: 'nowrap',
                        }, children: ["Elevation: ", _jsxs("strong", { children: [hover.elevation.toFixed(0), " m"] }), "\u00A0\u00A0\u00B7\u00A0\u00A0 Distance: ", _jsxs("strong", { children: [hover.distanceFromStart.toFixed(2), " km"] })] }))] })] }));
}
