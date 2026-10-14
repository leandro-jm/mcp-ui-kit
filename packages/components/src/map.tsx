import { resolvePath, resolveRows, type FieldFormat, type MapView, type ViewPayload } from '@mcp-ui-kit/view-spec';
import L from 'leaflet';
import { useEffect, useMemo, useRef } from 'react';
import { useUi } from './context';
import { formatValue } from './format';
import { ActionBar, Block, Empty } from './primitives';

const MAX_MARKERS = 2000;

interface Point {
  lat: number;
  lng: number;
  label?: string;
  popup: Array<[string, string]>;
}

function pointsOf(view: MapView, data: unknown, fmt: (v: unknown, f?: FieldFormat) => string): Point[] {
  const out: Point[] = [];
  const popupOf = (scope: unknown) => (view.popup ?? []).map((f): [string, string] => [f.title ?? f.field, fmt(resolvePath(scope, f.field), f.format)]);
  if ('geojson' in view) {
    const fc = resolvePath(data, view.geojson) as { features?: Array<{ geometry?: { type?: string; coordinates?: number[] }; properties?: Record<string, unknown> }> } | undefined;
    for (const f of fc?.features ?? []) {
      if (f.geometry?.type !== 'Point' || !Array.isArray(f.geometry.coordinates)) continue;
      const [lng, lat] = f.geometry.coordinates;
      if (typeof lat === 'number' && typeof lng === 'number') {
        out.push({ lat, lng, ...(view.label ? { label: String(f.properties?.[view.label] ?? '') } : {}), popup: popupOf(f.properties) });
      }
    }
  } else {
    for (const r of resolveRows(data, view.data)) {
      const lat = Number(resolvePath(r, view.lat));
      const lng = Number(resolvePath(r, view.lng));
      if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
        out.push({ lat, lng, ...(view.label ? { label: String(resolvePath(r, view.label) ?? '') } : {}), popup: popupOf(r) });
      }
    }
  }
  return out.slice(0, MAX_MARKERS);
}

/**
 * Map of points (Leaflet). Without a configured basemap it still plots the points. Markers are
 * circle markers (no image assets), labels and popups are text nodes (never HTML).
 */
export function MapResult({ view, data, tiles }: { view: MapView; data: unknown; tiles?: ViewPayload['mapTiles'] }) {
  const ui = useUi();
  const el = useRef<HTMLDivElement>(null);
  const points = useMemo(() => pointsOf(view, data, (v, f) => formatValue(v, f, ui.formatLocale, [ui.t('yes'), ui.t('no')])), [view, data, ui]);
  useEffect(() => {
    if (!el.current || !points.length) return;
    const map = L.map(el.current, { attributionControl: Boolean(tiles?.attribution), scrollWheelZoom: false });
    if (tiles) L.tileLayer(tiles.url, { maxZoom: 19, ...(tiles.attribution ? { attribution: tiles.attribution } : {}) }).addTo(map);
    const accent = getComputedStyle(el.current).getPropertyValue('--mcp-ui-accent').trim() || '#0b7a64';
    const markers = points.map((p) => {
      const m = L.circleMarker([p.lat, p.lng], { radius: 6, color: '#ffffff', weight: 2, fillColor: accent, fillOpacity: 1 });
      if (p.label || p.popup.length) {
        const box = document.createElement('div');
        if (p.label) {
          const b = document.createElement('strong');
          b.textContent = p.label;
          box.append(b);
        }
        for (const [k, v] of p.popup) {
          const line = document.createElement('div');
          line.textContent = `${k}: ${v}`;
          box.append(line);
        }
        m.bindPopup(box);
        if (p.label) m.bindTooltip(p.label);
      }
      return m.addTo(map);
    });
    map.fitBounds(L.featureGroup(markers).getBounds().pad(0.2), { maxZoom: 14 });
    return () => void map.remove();
  }, [points, tiles]);
  return (
    <Block title={view.title} subtitle={view.subtitle}>
      {points.length ? <div ref={el} className="mui-map" role="region" aria-label={view.title ?? 'Map'} /> : <Empty />}
      <ActionBar actions={view.actions} scope={data} />
      <span className="mui-sr-only">{ui.t('rows', { n: points.length })}</span>
    </Block>
  );
}
