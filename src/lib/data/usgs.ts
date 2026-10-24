/**
 * USGS ComCat (FDSN) earthquake catalog client.
 *
 * API: https://earthquake.usgs.gov/fdsnws/event/1/ (documented, open, no auth).
 * The moment tensor nodal plane is read from the detail product attached to
 * each event's properties.products["moment-tensor"].
 *
 * All fetches carry a timeout and surface failures explicitly — the app must
 * never pretend the catalog is reachable when it is not.
 */

import type { UsgsEventLite } from '@/lib/science/types';

const FDSN_BASE = 'https://earthquake.usgs.gov/fdsnws/event/1';

interface FdsnProperties {
  mag: number | null;
  magType?: string;
  place: string;
  time: number;
  url: string;
  products?: Record<string, Array<{ code?: string; source?: string; properties: Record<string, string> }>>;
}

interface FdsnFeature {
  id: string;
  properties: FdsnProperties;
  geometry: { coordinates: [number, number, number] };
}

function parseNodalPlane(ev: FdsnFeature): UsgsEventLite['nodalPlane'] | undefined {
  const mts = ev.properties.products?.['moment-tensor'];
  if (!mts || mts.length === 0) return undefined;
  const p = mts[0].properties;
  const s = parseFloat(p['nodal-plane-1-strike']);
  const d = parseFloat(p['nodal-plane-1-dip']);
  const r = parseFloat(p['nodal-plane-1-rake']);
  if (Number.isFinite(s) && Number.isFinite(d) && Number.isFinite(r)) {
    return { strike: s, dip: d, rake: r };
  }
  return undefined;
}

function toLite(ev: FdsnFeature): UsgsEventLite {
  const [lon, lat, depthKm] = ev.geometry.coordinates;
  const mt = ev.properties.products?.['moment-tensor']?.[0];
  return {
    id: ev.id,
    magnitude: ev.properties.mag ?? NaN,
    magType: ev.properties.magType,
    place: ev.properties.place,
    time: new Date(ev.properties.time).toISOString(),
    lat,
    lon,
    depthKm,
    url: ev.properties.url,
    nodalPlane: parseNodalPlane(ev),
    momentTensorSource: mt ? `${mt.source ?? 'unknown'}/${mt.code ?? ''}` : undefined,
  };
}

/** Query events; throws on network/API failure (caller must surface it).
 * Responses are cached in memory for 15 minutes (catalogs evolve slowly and
 * the FDSN service can take ~20 s per query under load); the cache timestamp
 * is reported to callers via queryUsgsEvents.freshUntil. */
const CACHE_TTL_MS = 15 * 60 * 1000;
const globalUsgsCache = globalThis as unknown as {
  __motusUsgsCache?: Map<string, { at: number; events: UsgsEventLite[] }>;
};
if (!globalUsgsCache.__motusUsgsCache) globalUsgsCache.__motusUsgsCache = new Map();
const usgsCache = globalUsgsCache.__motusUsgsCache;

export interface UsgsQueryOptions {
  minMagnitude?: number;
  /** ISO strings */
  startTime: string;
  endTime: string;
  /** [minLon, minLat, maxLon, maxLat] */
  boundingBox?: [number, number, number, number];
  limit?: number;
  /**
   * FDSN ordering (2026-10-24 fix). The default time-ascending order caused
   * a large mainshock to be silently cut by the limit when an aftershock
   * swarm filled the window: 'magnitude' (descending) is required whenever
   * a limit is in play.
   */
  orderBy?: 'time-asc' | 'time-desc' | 'magnitude';
}

async function fetchUsgsOnce(url: string, timeoutMs: number): Promise<FdsnFeature[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) {
      throw new Error(`USGS FDSN returned HTTP ${res.status}`);
    }
    const data = (await res.json()) as { features?: FdsnFeature[] };
    return data.features ?? [];
  } finally {
    clearTimeout(timer);
  }
}

export async function queryUsgsEvents(opts: UsgsQueryOptions): Promise<UsgsEventLite[]> {
  const params = new URLSearchParams({
    format: 'geojson',
    starttime: opts.startTime,
    endtime: opts.endTime,
    minmagnitude: String(opts.minMagnitude ?? 4.5),
    limit: String(opts.limit ?? 30),
    eventtype: 'earthquake',
  });
  if (opts.orderBy) params.set('orderby', opts.orderBy);
  if (opts.boundingBox) {
    // FDSN event-service parameters (verified 2026-10-20): the service has no
    // combined "boundingbox" query parameter — it requires the four explicit
    // bounds below; anything else yields HTTP 400.
    params.set('minlatitude', String(opts.boundingBox[1]));
    params.set('maxlatitude', String(opts.boundingBox[3]));
    params.set('minlongitude', String(opts.boundingBox[0]));
    params.set('maxlongitude', String(opts.boundingBox[2]));
  }
  const url = `${FDSN_BASE}/query?${params.toString()}`;

  const cached = usgsCache.get(url);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.events;
  }

  // Two attempts with generous timeouts: the FDSN service regularly needs
  // ~20 s per time-range query under load and intermittently 502s.
  let features: FdsnFeature[];
  try {
    features = await fetchUsgsOnce(url, 35000);
  } catch (firstErr) {
    try {
      features = await fetchUsgsOnce(url, 35000);
    } catch (secondErr) {
      throw new Error(`${(firstErr as Error).message}; retry: ${(secondErr as Error).message}`);
    }
  }
  const events = features.map(toLite);
  usgsCache.set(url, { at: Date.now(), events });
  return events;
}

/**
 * Events that fall strictly INSIDE the interferometric acquisition window
 * (reference -> secondary) and within maxDistanceKm of the footprint.
 */
export function filterEventsInWindow(
  events: UsgsEventLite[],
  referenceTime: string,
  secondaryTime: string,
  centerLat: number,
  centerLon: number,
  maxDistanceKm = 300,
): UsgsEventLite[] {
  const t0 = Date.parse(referenceTime);
  const t1 = Date.parse(secondaryTime);
  const R = 6371.0088;
  const toRad = (d: number) => (d * Math.PI) / 180;
  return events.filter((ev) => {
    const t = Date.parse(ev.time);
    if (!(t > t0 && t < t1)) return false;
    const dLat = toRad(ev.lat - centerLat);
    const dLon = toRad(ev.lon - centerLon);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(centerLat)) * Math.cos(toRad(ev.lat)) * Math.sin(dLon / 2) ** 2;
    const dist = 2 * R * Math.asin(Math.sqrt(a));
    return dist <= maxDistanceKm;
  });
}

/** Load a static event record from the derived-data directory (Bun/Node fs). */
export async function loadStaticEvent(path: string): Promise<UsgsEventLite> {
  const fs = await import('fs/promises');
  const raw = JSON.parse(await fs.readFile(path, 'utf-8')) as Record<string, unknown>;
  const np = raw.nodalPlane as Record<string, string> | null;
  return {
    id: String(raw.id),
    magnitude: Number(raw.magnitude),
    magType: raw.magType as string | undefined,
    place: String(raw.place),
    time: String(raw.time),
    lat: Number(raw.lat),
    lon: Number(raw.lon),
    depthKm: Number(raw.depthKm),
    url: String(raw.url),
    nodalPlane: np
      ? { strike: Number(np.strike), dip: Number(np.dip), rake: Number(np.rake) }
      : undefined,
    momentTensorSource: raw.momentTensorSource as string | undefined,
  };
}

/**
 * Merge a cached detailed event record (e.g. the Panama usgs_event.json with
 * its moment-tensor product) into the matching event of a LIVE query result.
 *
 * Why this exists (2026-10-24): the FDSN listing endpoint omits the
 * moment-tensor product that the detailed per-event record carries. Without
 * the merge, a live-queried mainshock reaches the attribution layer without
 * its published fault mechanism, and the Okada forward-model check silently
 * degrades to "no mechanism available". The merge is id-matched and never
 * overwrites an existing mechanism.
 */
export function mergeCachedMechanism(
  events: UsgsEventLite[],
  cached: UsgsEventLite | null | undefined,
): UsgsEventLite[] {
  if (!cached?.nodalPlane) return events;
  return events.map((e) =>
    e.id === cached.id && !e.nodalPlane
      ? { ...e, nodalPlane: cached.nodalPlane, momentTensorSource: cached.momentTensorSource }
      : e,
  );
}
