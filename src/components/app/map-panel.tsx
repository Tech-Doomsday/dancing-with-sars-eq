'use client';

/**
 * The map panel — Leaflet with the Mercator-exact raster overlay,
 * footprints, earthquake events, hover readout and legend.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Polygon, CircleMarker, ImageOverlay, Tooltip, ScaleControl, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { DatasetDetail, PanamaGranule } from './types';
import type { UsgsEventLite } from '@/lib/science/types';
import type { DecodedGrids } from './decode';
import type { LayerKind, RenderedOverlay } from './raster-render';
import { renderOverlay, sampleAt, gridBounds } from './raster-render';
import { displacementColor } from './colormap';

export interface MapPanelProps {
  dataset: DatasetDetail;
  /** Decoded transport grids (quantitative result) */
  grids?: DecodedGrids | null;
  gridsMeta?: RenderedOverlay extends never ? never : {
    xStart: number; xSpacing: number; yStart: number; ySpacing: number;
    width: number; height: number; epsg: number;
  };
  layer: LayerKind;
  opacity: number;
  events: UsgsEventLite[];
  primaryEvent?: UsgsEventLite | null;
  /** Granule footprints (evidence mode) */
  granulePolys?: Array<{ granule: PanamaGranule; poly: [number, number][] }>;
}

function ZoomControls() {
  const map = useMap();
  return (
    <div className="absolute right-3 top-3 z-[500] flex flex-col overflow-hidden rounded-md border border-[#E7E2DA] bg-white">
      <button
        type="button"
        aria-label="Zoom in"
        onClick={() => map.zoomIn()}
        className="flex h-7 w-7 items-center justify-center text-[16px] leading-none text-[#4A443C] transition-colors hover:bg-[#F7F4EE]"
      >
        +
      </button>
      <div className="h-px bg-[#E7E2DA]" />
      <button
        type="button"
        aria-label="Zoom out"
        onClick={() => map.zoomOut()}
        className="flex h-7 w-7 items-center justify-center text-[16px] leading-none text-[#4A443C] transition-colors hover:bg-[#F7F4EE]"
      >
        −
      </button>
    </div>
  );
}

function FitBounds({ polygon }: { polygon: [number, number][] }) {
  // `polygon` arrives as [lat, lon] pairs (already normalised by the caller).
  const map = useMap();
  useEffect(() => {
    if (polygon.length > 2) {
      const bounds = L.latLngBounds(polygon as L.LatLngExpression[]);
      map.fitBounds(bounds.pad(0.25));
    }
  }, [map, polygon]);
  return null;
}

function HoverReadout({
  grids,
  gridsMeta,
  layer,
}: {
  grids: DecodedGrids | null;
  gridsMeta?: MapPanelProps['gridsMeta'];
  layer: LayerKind;
}) {
  const [pos, setPos] = useState<{ lat: number; lon: number } | null>(null);
  const [sample, setSample] = useState<{ displacement: number; coherence: number; sigma: number } | undefined>();
  const lastRef = useRef(0);
  useMapEvents({
    mousemove(e) {
      const now = performance.now();
      if (now - lastRef.current < 33) return;
      lastRef.current = now;
      setPos({ lat: e.latlng.lat, lon: e.latlng.lng });
      if (grids && gridsMeta) {
        setSample(sampleAt(grids, gridsMeta, e.latlng.lat, e.latlng.lng));
      } else {
        setSample(undefined);
      }
    },
    mouseout() {
      setPos(null);
      setSample(undefined);
    },
  });
  if (!pos) return null;
  const fmt = (v: number | undefined, unit: string, scale = 1000, digits = 1) =>
    v === undefined || Number.isNaN(v) ? '—' : `${(v * scale).toFixed(digits)} ${unit}`;
  let value = '—';
  let label = '';
  if (sample) {
    if (layer === 'velocity') {
      const mmYr = sample.displacement * 1000;
      value = `${mmYr >= 0 ? '+' : ''}${mmYr.toFixed(1)} mm/yr`;
      label = mmYr >= 0 ? 'moving away from satellite' : 'moving toward satellite';
    } else if (layer === 'displacement' || layer === 'coverage') {
      const mm = sample.displacement * 1000;
      value = `${Math.abs(mm).toFixed(1)} mm`;
      label = mm >= 0 ? 'away from satellite' : 'toward satellite';
    } else if (layer === 'coherence') {
      value = Number.isFinite(sample.coherence) ? sample.coherence.toFixed(2) : '—';
      label = 'signal quality (0–1)';
    } else {
      value = fmt(sample.sigma, 'mm');
      label = 'uncertainty';
    }
  }
  return (
    <div
      className="absolute left-3 top-3 z-[500] rounded-lg border bg-white/95 px-3 py-2 font-mono text-[11px] leading-4 text-[#4A443C] shadow-sm"
      aria-live="polite"
    >
      <div>{pos.lat.toFixed(4)}°, {pos.lon.toFixed(4)}°</div>
      <div className="text-[#1C1A17]">
        {value}
        {label && <span className="ml-1.5 font-sans text-[10px] text-[#8A837B]">{label}</span>}
      </div>
    </div>
  );
}

function Legend({ layer, scaleMaxM }: { layer: LayerKind; scaleMaxM?: number }) {
  if (layer === 'coverage') {
    return (
      <div className="absolute bottom-3 left-3 z-[500] rounded-lg border bg-white/95 px-3 py-2 shadow-sm">
        <div className="mb-1 text-[10px] uppercase tracking-[0.08em] text-[#8A837B]">Where measurements exist</div>
        <div className="flex items-center gap-2">
          <span className="h-2 w-8 rounded-sm border border-[#E7E2DA]" style={{ background: 'rgb(148,140,129)' }} />
          <span className="font-mono text-[10px] text-[#6F6862]">measured</span>
        </div>
        <div className="mt-1 text-[10px] text-[#8A837B]">transparent = signal too weak to measure</div>
      </div>
    );
  }
  const isVel = layer === 'velocity';
  const gradient =
    layer === 'displacement' || isVel
      ? `linear-gradient(to right, ${displacementColor(-1)}, ${displacementColor(-0.34)}, ${displacementColor(0)}, ${displacementColor(0.34)}, ${displacementColor(1)})`
      : layer === 'coherence'
        ? `linear-gradient(to right, #F5F1E8, #CBC3B5, #8A837A, #4A443C)`
        : `linear-gradient(to right, #F5F1E8, #E2C7AC, #B0714E, #7A4A2B)`;
  const left =
    layer === 'displacement' || isVel
      ? isVel
        ? `${((scaleMaxM ?? 0.05) * 1000).toFixed(0)} mm/yr toward`
        : `${((scaleMaxM ?? 0.05) * 100).toFixed(0)} cm toward`
      : layer === 'coherence'
        ? 'weak signal'
        : 'low';
  const right =
    layer === 'displacement' || isVel
      ? isVel
        ? `${((scaleMaxM ?? 0.05) * 1000).toFixed(0)} mm/yr away`
        : `${((scaleMaxM ?? 0.05) * 100).toFixed(0)} cm away`
      : layer === 'coherence'
        ? 'strong signal'
        : 'high';
  const title =
    layer === 'displacement' || isVel
      ? isVel
        ? 'LOS velocity (sustained motion)'
        : 'Movement toward / away from the satellite'
      : layer === 'coherence'
        ? 'Signal quality (coherence)'
        : 'Measurement uncertainty';
  return (
    <div className="absolute bottom-3 left-3 z-[500] rounded-lg border bg-white/95 px-3 py-2 shadow-sm">
      <div className="mb-1 text-[10px] uppercase tracking-[0.08em] text-[#8A837B]">{title}</div>
      <div className="flex items-center gap-2">
        <span className="font-mono text-[10px] text-[#6F6862]">{left}</span>
        <div className="h-2 w-32 rounded-sm border border-[#E7E2DA]" style={{ background: gradient }} />
        <span className="font-mono text-[10px] text-[#6F6862]">{right}</span>
      </div>
      <div className="mt-1 text-[10px] text-[#8A837B]">
        {layer === 'displacement' || isVel
          ? isVel
            ? 'brown = moving toward the satellite · green = away from it (subsidence convention) · pale = stable'
            : 'brown = toward the satellite · green = away from it · pale = little or no change'
          : layer === 'coherence'
            ? 'darker = more reliable measurement'
            : 'darker = more uncertain measurement'}
      </div>
    </div>
  );
}

export default function MapPanel(props: MapPanelProps) {
  const { dataset, grids, gridsMeta, layer, opacity, events, primaryEvent, granulePolys } = props;
  const [overlay, setOverlay] = useState<RenderedOverlay | null>(null);
  const [rendering, setRendering] = useState(false);

  useEffect(() => {
    if (!grids || !gridsMeta) {
      setOverlay(null);
      return;
    }
    setRendering(true);
    const t = setTimeout(() => {
      try {
        const ov = renderOverlay(grids, gridsMeta, layer);
        setOverlay(ov ?? null);
      } catch (e) {
        console.error('[motus-overlay] render failed', e);
        setOverlay(null);
      } finally {
        setRendering(false);
      }
    }, 10);
    return () => clearTimeout(t);
  }, [grids, gridsMeta, layer]);

  const footprint: [number, number][] = useMemo(
    () => (dataset.footprintPolygon ?? []).map(([lon, lat]) => [lat, lon] as [number, number]),
    [dataset.footprintPolygon],
  );

  return (
    <div
      className="relative overflow-hidden rounded-xl border border-[#E7E2DA] bg-white"
      style={{ minHeight: 420 }}
      role="region"
      aria-label="Study area map"
    >
      <MapContainer
        center={[dataset.center?.lat ?? 0, dataset.center?.lon ?? 0]}
        zoom={dataset.center ? 8 : 2}
        style={{ height: '100%', minHeight: 420, position: 'absolute', inset: 0 }}
        zoomControl={false}
        attributionControl={true}
      >
        <ZoomControls />
        <TileLayer
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}"
          attribution="Tiles &copy; Esri &mdash; Source: Esri, USGS, NOAA | &copy; <a href=&quot;https://www.openstreetmap.org/copyright&quot;>OpenStreetMap</a> contributors"
        />
        <ScaleControl position="bottomright" metric={true} imperial={false} />
        <FitBounds polygon={footprint} />
        {overlay && (
          <ImageOverlay
            url={overlay.dataUrl}
            bounds={[[overlay.geo.latMin, overlay.geo.lonMin], [overlay.geo.latMax, overlay.geo.lonMax]]}
            opacity={opacity}
          />
        )}
          <Polygon
            positions={footprint.length > 2 ? footprint : []}
            pathOptions={{ color: '#1C1A17', weight: 1.5, fillColor: '#1C1A17', fillOpacity: 0.05 }}
          />
        {granulePolys?.map(({ granule, poly }) => (
          <Polygon
            key={granule.granuleId}
            positions={poly.map(([lon, lat]) => [lat, lon] as [number, number])}
            pathOptions={{ color: '#B08D57', weight: 1, dashArray: '4 3', fillOpacity: 0.02 }}
          >
            <Tooltip>{granule.granuleId.slice(0, 52)}…</Tooltip>
          </Polygon>
        ))}
        {events.map((ev) => {
          const primary = primaryEvent && ev.id === primaryEvent.id;
          return (
            <CircleMarker
              key={ev.id}
              center={[ev.lat, ev.lon]}
              radius={4 + Math.max(0, ev.magnitude - 4) * 2.2}
              pathOptions={{
                color: primary ? '#6E2418' : '#9E3B2C',
                weight: primary ? 2.5 : 1,
                fillColor: '#9E3B2C',
                fillOpacity: 0.8,
              }}
            >
              <Tooltip>
                <div className="text-[11px] leading-4">
                  <div className="font-semibold">M{ev.magnitude.toFixed(1)} {ev.magType ?? ''}</div>
                  <div>{ev.place}</div>
                  <div>{ev.time.slice(0, 16).replace('T', ' ')} UTC · depth {ev.depthKm.toFixed(0)} km</div>
                  <a href={ev.url} target="_blank" rel="noopener noreferrer" className="underline">
                    USGS event page
                  </a>
                </div>
              </Tooltip>
            </CircleMarker>
          );
        })}
        <HoverReadout grids={grids ?? null} gridsMeta={gridsMeta} layer={layer} />
      </MapContainer>
      {dataset.availability.state !== 'available' && (
        <div className="pointer-events-none absolute inset-x-0 top-1/2 z-[500] -translate-y-1/2 px-6 text-center">
          <p className="mx-auto max-w-md rounded-lg border border-[#E5C4B7] bg-[#FBF3EF]/95 px-4 py-3 text-[12px] leading-[1.4rem] text-[#9E3B2C]">
            The data for this area have not been downloaded to this server, so there is nothing to
            show on the map yet. The panel alongside explains how to obtain them.
          </p>
        </div>
      )}
      {overlay && <Legend layer={layer} scaleMaxM={overlay.scaleMaxM} />}
      {rendering && (
        <div className="absolute right-3 top-14 z-[500] rounded-md border bg-white/95 px-2.5 py-1 text-[11px] text-[#6F6862] shadow-sm">
          Drawing the layer…
        </div>
      )}
    </div>
  );
}
