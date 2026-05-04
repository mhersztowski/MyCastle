import { useRef } from 'react';
import type { TrailRoute, RouteStats, MapStyleId, ColorMode, ViewMode, HoverState } from '../types';
import { MAP_STYLES } from '../types';
import { ElevationChart } from './ElevationChart';
import { formatDuration, rgbaToHex, solidColor } from '../utils/colors';
import { parseGpx, parseGeoJson } from '../utils/gpx';

interface Props {
  routes: TrailRoute[];
  selectedRouteId: string | null;
  mapStyle: MapStyleId;
  colorMode: ColorMode;
  viewMode: ViewMode;
  isAnimating: boolean;
  hover: HoverState | null;
  onAddRoute: (route: TrailRoute) => void;
  onRemoveRoute: (id: string) => void;
  onToggleRoute: (id: string) => void;
  onSelectRoute: (id: string | null) => void;
  onMapStyle: (s: MapStyleId) => void;
  onColorMode: (m: ColorMode) => void;
  onViewMode: (m: ViewMode) => void;
  onToggleAnim: () => void;
  onHoverProgress: (progress: number | null, coordIndex: number | null) => void;
}

const css = {
  sidebar: {
    width: 320,
    minWidth: 260,
    maxWidth: 400,
    height: '100%',
    background: '#1e1e1e',
    borderRight: '1px solid #2d2d2d',
    display: 'flex',
    flexDirection: 'column' as const,
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
  label: { fontSize: 11, color: '#888', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 6 },
  scroll: { overflowY: 'auto' as const, flex: 1, minHeight: 0 },
  routeItem: (selected: boolean): React.CSSProperties => ({
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
  statItem: { display: 'flex', flexDirection: 'column' as const },
  statValue: { fontSize: 15, fontWeight: 600, color: '#e0e0e0' },
  statLabel: { fontSize: 10, color: '#666' },
  btn: (active?: boolean): React.CSSProperties => ({
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
    textAlign: 'center' as const,
    fontSize: 12,
    color: '#666',
    cursor: 'pointer',
    transition: 'border-color 0.15s',
  },
};

function StatItem({ value, label }: { value: string; label: string }) {
  return (
    <div style={css.statItem}>
      <span style={css.statValue}>{value}</span>
      <span style={css.statLabel}>{label}</span>
    </div>
  );
}

function RouteStats({ stats, name }: { stats: RouteStats; name: string }) {
  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#ccc', marginBottom: 6 }}>{name}</div>
      <div style={css.statGrid}>
        <StatItem value={`${stats.totalDistance.toFixed(2)} km`} label="Distance" />
        <StatItem value={`↑ ${stats.elevationGain} m`} label="Elevation gain" />
        <StatItem value={`↓ ${stats.elevationLoss} m`} label="Elevation loss" />
        <StatItem value={`${stats.maxElevation} m`} label="Max elevation" />
        <StatItem value={`${stats.minElevation} m`} label="Min elevation" />
        {stats.duration != null && (
          <StatItem value={formatDuration(stats.duration)} label="Duration" />
        )}
      </div>
    </div>
  );
}

export function Sidebar({
  routes,
  selectedRouteId,
  mapStyle,
  colorMode,
  viewMode,
  isAnimating,
  hover,
  onAddRoute,
  onRemoveRoute,
  onToggleRoute,
  onSelectRoute,
  onMapStyle,
  onColorMode,
  onViewMode,
  onToggleAnim,
  onHoverProgress,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);

  const selectedRoute = routes.find((r) => r.id === selectedRouteId) ?? null;

  function handleFiles(files: FileList | null) {
    if (!files) return;
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        const lower = file.name.toLowerCase();
        let route: TrailRoute | null = null;
        if (lower.endsWith('.gpx')) {
          route = parseGpx(text, file.name);
        } else if (lower.endsWith('.geojson') || lower.endsWith('.json')) {
          route = parseGeoJson(text, file.name);
        }
        if (route) onAddRoute(route);
      };
      reader.readAsText(file);
    });
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    handleFiles(e.dataTransfer.files);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    (e.currentTarget as HTMLDivElement).style.borderColor = '#4fc3f7';
  }

  function handleDragLeave(e: React.DragEvent) {
    (e.currentTarget as HTMLDivElement).style.borderColor = '#444';
  }

  return (
    <div style={css.sidebar}>
      {/* Header */}
      <div style={css.header}>Trail Map</div>

      {/* View controls */}
      <div style={css.section}>
        <div style={css.label}>View</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button style={css.btn(viewMode === '2d')} onClick={() => onViewMode('2d')}>2D</button>
          <button style={css.btn(viewMode === '3d')} onClick={() => onViewMode('3d')}>3D</button>
          <button style={css.btn(isAnimating)} onClick={onToggleAnim} disabled={!selectedRoute} title="Animate selected route">
            {isAnimating ? '⏹ Stop' : '▶ Animate'}
          </button>
        </div>
      </div>

      {/* Map style */}
      <div style={css.section}>
        <div style={css.label}>Map style</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {MAP_STYLES.map((s) => (
            <button key={s.id} style={css.btn(mapStyle === s.id)} onClick={() => onMapStyle(s.id)}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Color mode */}
      <div style={css.section}>
        <div style={css.label}>Color mode</div>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['solid', 'elevation', 'slope'] as ColorMode[]).map((m) => (
            <button key={m} style={css.btn(colorMode === m)} onClick={() => onColorMode(m)}>
              {m.charAt(0).toUpperCase() + m.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Drop zone */}
      <div style={css.section}>
        <div style={css.label}>Load route</div>
        <div
          style={css.dropZone}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileRef.current?.click()}
        >
          Drop GPX / GeoJSON file here
          <br />
          <span style={{ color: '#4fc3f7', fontSize: 11 }}>or click to browse</span>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".gpx,.geojson,.json"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {/* Route list */}
      <div style={css.scroll}>
        {routes.length === 0 && (
          <div style={{ padding: '20px 14px', fontSize: 12, color: '#555', textAlign: 'center' }}>
            No routes loaded yet.
            <br />Drop a GPX file above to start.
          </div>
        )}

        {routes.map((route) => {
          const isSelected = route.id === selectedRouteId;
          const colorHex = rgbaToHex(solidColor(route.color));
          return (
            <div key={route.id}>
              <div
                style={css.routeItem(isSelected)}
                onClick={() => onSelectRoute(isSelected ? null : route.id)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {/* Color swatch */}
                  <div
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: '50%',
                      background: colorHex,
                      flexShrink: 0,
                      opacity: route.visible ? 1 : 0.3,
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 500,
                        color: route.visible ? '#e0e0e0' : '#555',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {route.name}
                    </div>
                    <div style={{ fontSize: 11, color: '#666' }}>
                      {route.stats.totalDistance.toFixed(2)} km · ↑{route.stats.elevationGain} m
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button
                      style={{ ...css.btn(), padding: '2px 7px', fontSize: 11 }}
                      onClick={(e) => { e.stopPropagation(); onToggleRoute(route.id); }}
                      title={route.visible ? 'Hide' : 'Show'}
                    >
                      {route.visible ? '👁' : '🚫'}
                    </button>
                    <button
                      style={{ ...css.btn(), padding: '2px 7px', fontSize: 11, color: '#f44' }}
                      onClick={(e) => { e.stopPropagation(); onRemoveRoute(route.id); }}
                      title="Remove"
                    >
                      ×
                    </button>
                  </div>
                </div>
              </div>

              {/* Expanded stats + elevation chart for selected route */}
              {isSelected && (
                <div style={{ padding: '8px 14px 12px', background: '#252526', borderBottom: '1px solid #333' }}>
                  <RouteStats stats={route.stats} name="" />
                  <div style={{ marginTop: 12 }}>
                    <div style={css.label}>Elevation profile</div>
                    <ElevationChart
                      route={route}
                      hover={hover}
                      onHoverProgress={onHoverProgress}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
