/**
 * "Find me a good radar pair" — search the live NASA CMR catalog for NISAR
 * GUNW interferometric pairs over a chosen place, group granules into pairs,
 * and rank them by honest metadata-only criteria.
 *
 * HONESTY CONTRACT: nothing about actual coherence is measured here (that
 * requires downloading each ~2.5 GB product). The ranking uses only what the
 * open catalog states: temporal baseline, recency, coverage of the chosen
 * point, and (via the live USGS catalog) whether earthquakes occurred inside
 * the acquisition window. Every list item says so.
 */

import { searchNisarGunw, type CmrGranule } from './cmr';
import { queryUsgsEvents } from './usgs';
import type { UsgsEventLite } from '@/lib/science/types';

export interface PairMember {
  granuleId: string;
  time: string; // acquisition time of this scene
}

export interface UsgsWindowEvent {
  id: string;
  magnitude: number;
  place: string;
  time: string;
  lat: number;
  lon: number;
}

export interface RankedPair {
  /** Shared identity of the pair (track/frames/polarity segment of the id). */
  pairKey: string;
  reference: PairMember;
  secondary: PairMember;
  temporalBaselineDays: number;
  /** Milliseconds between acquisitions (exact). */
  temporalBaselineMs: number;
  sizeMB: number;
  dataUrl?: string;
  browseUrl?: string;
  conceptId: string;
  /** Earthquakes M>=4.5 inside the acquisition window near the point (live USGS). */
  windowEvents: UsgsWindowEvent[];
  /** Plain-language reasons for this pair's rank. */
  rankReasons: string[];
  /** 0..100 metadata-only score (higher = more promising). */
  score: number;
}

export interface PairSearchResult {
  ok: true;
  query: { lat: number; lon: number; placeLabel: string; daysBack: number };
  hits: number | null;
  granuleCount: number;
  pairs: RankedPair[];
  note: string;
  queriedAt: string;
}

/** Parse the two acquisition timestamps embedded in a NISAR granule id. */
export function granuleTimes(granuleId: string): { reference: Date; secondary: Date } | null {
  const m = granuleId.match(/_(\d{8}T\d{6})_(\d{8}T\d{6})_(\d{8}T\d{6})_(\d{8}T\d{6})_/);
  if (!m) return null;
  const parse = (s: string) => {
    const iso = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(9, 11)}:${s.slice(11, 13)}:${s.slice(13, 15)}Z`;
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : d;
  };
  // NISAR id: _refStart_refEnd_secStart_secEnd_ ; scene time = start of each.
  const ref = parse(m[1]);
  const sec = parse(m[3]);
  if (!ref || !sec) return null;
  return { reference: ref, secondary: sec };
}

/**
 * Pair identity: track + orbit direction + the two acquisition DAYS. Frame
 * variants of the same pass (overlapping frames 071/022 vs 072/023 of the
 * same orbit pair) group together — they are the same measurement
 * opportunity for the user, and the group's largest granule represents it.
 */
export function pairKeyOf(granuleId: string): string {
  const statics = granuleId.match(/^NISAR_L2_PR_GUNW_(\d+)_(\d+)_([DA])_/);
  const times = granuleTimes(granuleId);
  if (!statics || !times) return granuleId;
  return `T${statics[2]}${statics[3]}::${times.reference.toISOString().slice(0, 10)}::${times.secondary.toISOString().slice(0, 10)}`;
}

export interface PointLike {
  lat: number;
  lon: number;
}

/** Great-circle distance in km (spherical, adequate for ranking). */
export function haversineKm(a: PointLike, b: PointLike): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const la = (a.lat * Math.PI) / 180;
  const lb = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la) * Math.cos(lb) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Parse a CMR polygon string to centroid. */
function polygonCentroid(poly: string): PointLike | null {
  const nums = poly.trim().split(/\s+/).map(Number);
  if (nums.length < 6) return null;
  let lat = 0;
  let lon = 0;
  let n = 0;
  for (let i = 0; i + 1 < nums.length; i += 2) {
    lat += nums[i];
    lon += nums[i + 1];
    n++;
  }
  return n ? { lat: lat / n, lon: lon / n } : null;
}

/**
 * Search + group + rank. `bbox` is a small box around the chosen point
 * (CMR returns granules whose footprint intersects it).
 */
export async function findPairs(opts: {
  lat: number;
  lon: number;
  placeLabel: string;
  daysBack?: number;
  pageSize?: number;
  minMagnitude?: number;
}): Promise<PairSearchResult> {
  const daysBack = opts.daysBack ?? 120;
  const end = new Date();
  const start = new Date(end.getTime() - daysBack * 86400000);
  const d = 1.2; // ~±130 km box around the point
  const bbox: [number, number, number, number] = [
    Math.max(-180, opts.lon - d),
    Math.max(-85, opts.lat - d / 2),
    Math.min(180, opts.lon + d),
    Math.min(85, opts.lat + d / 2),
  ];

  const { granules, hits } = await searchNisarGunw(bbox, { start: start.toISOString(), end: end.toISOString() }, { pageSize: opts.pageSize ?? 120 });

  // Group into pairs.
  const byPair = new Map<string, CmrGranule[]>();
  for (const g of granules) {
    const times = granuleTimes(g.granuleId);
    if (!times) continue;
    const k = pairKeyOf(g.granuleId);
    if (!byPair.has(k)) byPair.set(k, []);
    byPair.get(k)!.push(g);
  }

  const point = { lat: opts.lat, lon: opts.lon };
  const minMag = opts.minMagnitude ?? 4.5;

  // ONE live USGS query over the whole search range (the FDSN service can
  // take ~20 s per query; per-pair queries would multiply that). Each pair
  // then picks up the events that fall inside its own acquisition window.
  let windowEventsAll: UsgsEventLite[] = [];
  let usgsAvailable = true;
  try {
    windowEventsAll = await queryUsgsEvents({
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      boundingBox: [opts.lon - 3, Math.max(-85, opts.lat - 3), opts.lon + 3, Math.min(85, opts.lat + 3)],
      minMagnitude: minMag,
      limit: 500,
    });
  } catch {
    usgsAvailable = false;
  }

  // Build ranked pairs (largest/first granule of each group represents it).
  const pairs: RankedPair[] = [];
  for (const [k, group] of byPair) {
    const g = group.reduce((a, b) => (b.sizeMB > a.sizeMB ? b : a));
    const times = granuleTimes(g.granuleId)!;
    const ms = times.secondary.getTime() - times.reference.getTime();
    const days = ms / 86400000;
    if (days < 0.5 || days > 30) continue; // not a standard revisit pair

    // Events from the single live query that fall inside THIS pair's window.
    // Aftershock sequences can run to dozens of events — keep the largest
    // handful (re-sorted by time) so the payload stays light and readable.
    const windowEvents: UsgsWindowEvent[] = usgsAvailable
      ? windowEventsAll
          .filter(
            (e) =>
              Date.parse(e.time) >= times.reference.getTime() &&
              Date.parse(e.time) <= times.secondary.getTime() &&
              haversineKm(point, { lat: e.lat, lon: e.lon }) < 250,
          )
          .sort((a, b) => b.magnitude - a.magnitude)
          .slice(0, 6)
          .sort((a, b) => a.time.localeCompare(b.time))
          .map((e) => ({ id: e.id, magnitude: e.magnitude, place: e.place, time: e.time, lat: e.lat, lon: e.lon }))
      : [];

    // ---- Metadata-only ranking ----
    const reasons: string[] = [];
    let score = 50;
    if (Math.abs(days - 12) < 0.6) {
      score += 20;
      reasons.push('nominal 12-day NISAR revisit');
    } else if (days <= 12) {
      score += 10;
      reasons.push(`short ${days.toFixed(0)}-day baseline`);
    } else {
      score -= Math.min(15, (days - 12) * 2);
      reasons.push(`long ${days.toFixed(0)}-day baseline (more time to decorrelate)`);
    }
    const centroid = polygonCentroid(g.polygon);
    if (centroid) {
      const distKm = haversineKm(point, centroid);
      if (distKm < 80) {
        score += 15;
        reasons.push('scene centred close to your point');
      } else if (distKm > 250) {
        score -= 10;
        reasons.push('scene only clips the edge of your area');
      }
    }
    const ageDays = (Date.now() - times.secondary.getTime()) / 86400000;
    score += Math.max(0, 15 - ageDays / 8); // recent pairs slightly preferred
    if (ageDays < 30) reasons.push('acquired in the last month');
    const bigQuake = windowEvents.find((e) => e.magnitude >= 5.5);
    if (bigQuake) {
      score += 25;
      reasons.push(`M${bigQuake.magnitude.toFixed(1)} earthquake inside the window — deformation signal possible`);
    } else if (windowEvents.length > 0) {
      score += 10;
      reasons.push(windowEvents.length >= 6 ? 'active earthquake sequence in the window' : `${windowEvents.length} smaller earthquake${windowEvents.length > 1 ? 's' : ''} in the window (M≥${minMag})`);
    } else {
      reasons.push('no M≥' + minMag + ' earthquakes in the window (good for quiet-ground monitoring)');
    }
    if (g.browseUrl) {
      score += 3;
      reasons.push('official browse image available');
    }

    pairs.push({
      pairKey: k,
      reference: { granuleId: g.granuleId, time: times.reference.toISOString() },
      secondary: { granuleId: g.granuleId, time: times.secondary.toISOString() },
      temporalBaselineDays: days,
      temporalBaselineMs: ms,
      sizeMB: g.sizeMB,
      dataUrl: g.dataUrl,
      browseUrl: g.browseUrl,
      conceptId: g.conceptId,
      windowEvents,
      rankReasons: reasons,
      score: Math.max(0, Math.min(100, Math.round(score))),
    });
  }

  pairs.sort((a, b) => b.score - a.score || b.secondary.time.localeCompare(a.secondary.time));

  return {
    ok: true,
    query: { lat: opts.lat, lon: opts.lon, placeLabel: opts.placeLabel, daysBack },
    hits,
    granuleCount: granules.length,
    pairs: pairs.slice(0, 12),
    note:
      'Ranked by catalog metadata only (baseline, coverage, recency, and live USGS earthquake context' +
      (usgsAvailable ? '' : ' — USGS catalog unreachable for this query, earthquake context omitted') +
      '). Actual measurement quality can only be known after downloading the product — this ranking never claims measured coherence.',
    queriedAt: new Date().toISOString(),
  };
}

/** Preset places offered in the UI (label + coords). */
export const PAIR_PLACES: Array<{ label: string; lat: number; lon: number }> = [
  { label: 'Mojave Desert, USA', lat: 35.05, lon: -117.7 },
  { label: 'Los Angeles, USA', lat: 34.05, lon: -118.24 },
  { label: 'Panama', lat: 8.5, lon: -80.0 },
  { label: 'Istanbul, Türkiye', lat: 41.0, lon: 29.0 },
  { label: 'Tokyo, Japan', lat: 35.7, lon: 139.7 },
  { label: 'Reykjanes, Iceland', lat: 63.9, lon: -22.4 },
  { label: 'Himalaya front, Nepal', lat: 27.7, lon: 85.3 },
  { label: 'Atacama, Chile', lat: -23.5, lon: -70.4 },
];
