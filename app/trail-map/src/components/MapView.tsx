import { useEffect, useRef, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MapboxOverlay as DeckOverlay } from '@deck.gl/mapbox';
import { PathLayer, ScatterplotLayer } from '@deck.gl/layers';
import type { TrailRoute, HoverState, MapStyleId, ColorMode, ViewMode } from '../types';
import { MAP_STYLES } from '../types';
import { buildRouteSegments } from '../utils/routeAnalysis';
import { elevationToColor, slopeToColor, solidColor, type RGBA } from '../utils/colors';
import { routeBounds } from '../utils/routeAnalysis';

interface Props {
  routes: TrailRoute[];
  selectedRouteId: string | null;
  mapStyle: MapStyleId;
  colorMode: ColorMode;
  viewMode: ViewMode;
  animPosition: [number, number, number] | null;
  hover: HoverState | null;
  onHover: (state: HoverState | null) => void;
  onSelectRoute: (id: string | null) => void;
}

export function MapView({
  routes,
  selectedRouteId,
  mapStyle,
  colorMode,
  viewMode,
  animPosition,
  hover,
  onHover,
  onSelectRoute,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const deckRef = useRef<DeckOverlay | null>(null);
  const fittedRef = useRef<string>('');

  // Build deck.gl layers for all visible routes
  const buildLayers = useCallback(() => {
    const layers: (PathLayer | ScatterplotLayer)[] = [];

    for (const route of routes) {
      if (!route.visible) continue;

      const isSelected = route.id === selectedRouteId;
      const segments = buildRouteSegments(route);

      const minElev = route.stats.minElevation;
      const maxElev = route.stats.maxElevation;

      const getColor = (seg: (typeof segments)[0]): RGBA => {
        if (colorMode === 'elevation') return elevationToColor(seg.elevation, minElev, maxElev);
        if (colorMode === 'slope') return slopeToColor(seg.slope);
        return solidColor(route.color, isSelected ? 255 : 200);
      };

      layers.push(
        new PathLayer({
          id: `route-${route.id}`,
          data: segments,
          getPath: (seg) => seg.path,
          getColor,
          getWidth: isSelected ? 5 : 3,
          widthMinPixels: isSelected ? 4 : 2,
          widthMaxPixels: 16,
          jointRounded: true,
          capRounded: true,
          pickable: true,
          onClick: () => onSelectRoute(route.id),
          onHover: (info) => {
            if (info.object) {
              const seg = info.object as (typeof segments)[0];
              onHover({
                coordIndex: seg.index,
                distanceFromStart: seg.distKm,
                elevation: seg.elevation,
                position: [seg.path[0][0], seg.path[0][1]],
                routeId: route.id,
              });
            } else {
              onHover(null);
            }
          },
        }),
      );

      // Waypoint dots (start = green, finish = red, wpt = white)
      const waypointColors: Record<string, RGBA> = {
        start: [76, 175, 80, 255],
        end: [239, 83, 80, 255],
        wpt: [255, 255, 255, 200],
      };

      layers.push(
        new ScatterplotLayer({
          id: `waypoints-${route.id}`,
          data: route.waypoints,
          getPosition: (w) => w.position,
          getFillColor: (w) => waypointColors[w.type] ?? waypointColors.wpt,
          getRadius: (w) => (w.type === 'start' || w.type === 'end' ? 10 : 6),
          radiusMinPixels: 4,
          radiusMaxPixels: 20,
          pickable: true,
          stroked: true,
          lineWidthMinPixels: 2,
          getLineColor: [0, 0, 0, 180],
        }),
      );
    }

    // Animated position marker
    if (animPosition) {
      layers.push(
        new ScatterplotLayer({
          id: 'anim-marker',
          data: [{ position: animPosition }],
          getPosition: (d) => d.position,
          getFillColor: [255, 255, 255, 255],
          getRadius: 8,
          radiusMinPixels: 8,
          stroked: true,
          lineWidthMinPixels: 3,
          getLineColor: [41, 182, 246, 255],
        }),
      );
    }

    return layers;
  }, [routes, selectedRouteId, colorMode, animPosition, onHover, onSelectRoute]);

  // Init map once
  useEffect(() => {
    if (!containerRef.current) return;
    const styleDef = MAP_STYLES.find((s) => s.id === mapStyle) ?? MAP_STYLES[0];

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: styleDef.url,
      center: [20, 50],
      zoom: 6,
      pitch: 0,
      bearing: 0,
      attributionControl: false,
    });

    map.addControl(new maplibregl.NavigationControl(), 'top-right');
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-right');
    map.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      'bottom-right',
    );

    const deck = new DeckOverlay({
      interleaved: false,
      layers: [],
      getTooltip: () => null,
    });

    // MapboxOverlay implements IControl interface
    map.addControl(deck as unknown as maplibregl.IControl);

    mapRef.current = map;
    deckRef.current = deck;

    return () => {
      deck.finalize();
      map.remove();
      mapRef.current = null;
      deckRef.current = null;
    };
    // Run only once — style changes handled separately
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update deck.gl layers whenever inputs change
  useEffect(() => {
    if (!deckRef.current) return;
    deckRef.current.setProps({ layers: buildLayers() });
  }, [buildLayers]);

  // Change map style
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const styleDef = MAP_STYLES.find((s) => s.id === mapStyle) ?? MAP_STYLES[0];
    map.setStyle(styleDef.url);
  }, [mapStyle]);

  // 2D / 3D toggle
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.easeTo({
      pitch: viewMode === '3d' ? 60 : 0,
      bearing: viewMode === '3d' ? -20 : 0,
      duration: 800,
    });
  }, [viewMode]);

  // Fly to newly added routes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || routes.length === 0) return;

    const key = routes.map((r) => r.id).join(',');
    if (fittedRef.current === key) return;
    fittedRef.current = key;

    const allCoords = routes.flatMap((r) => r.coordinates);
    if (allCoords.length === 0) return;

    const { bbox } = routeBounds(allCoords);
    map.fitBounds(
      [
        [bbox[0], bbox[1]],
        [bbox[2], bbox[3]],
      ],
      { padding: 60, duration: 1200 },
    );
  }, [routes]);

  // Tooltip overlay (rendered via HTML, not deck.gl tooltip)
  const tooltip =
    hover
      ? {
          x: 0, // Tooltip is shown in the sidebar; MapView just passes hover state up
        }
      : null;
  void tooltip;

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', position: 'relative' }}
    />
  );
}
