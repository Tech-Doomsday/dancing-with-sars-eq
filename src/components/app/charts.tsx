'use client';

/**
 * Result visualisations — real charts computed from the actual decoded grids.
 *
 *  - VerdictBanner: the five-second plain-language answer (src/lib/science/verdict).
 *  - HistogramCard: how the measurements distribute + interactive threshold explorer.
 *  - ProfileCard: movement along a line through the anomaly (with uncertainty band).
 *  - SignalVsNoiseCard: recorded-run variant (bars from recorded figures).
 *  - SeismicTimeline: the acquisition window with real USGS events on it.
 *  - WhyCantISeeAnything: plain-language explainer using this scene's numbers.
 *
 * Everything animated is data-driven (framer-motion); no decorative spinners.
 */

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Cell,
  LineChart, Line, Area, ReferenceArea,
} from 'recharts';
import { HelpCircle, Radio, Waves, Gauge, Activity } from 'lucide-react';
import type { AnalysisResult, UsgsEventLite } from '@/lib/science/types';
import { computeVerdict, areaLabel } from '@/lib/science/verdict';
import type { DecodedGrids } from './decode';
import { WhatIsThis, MicroLabel, fmtDateTime } from './ui-bits';

/* ------------------------------------------------------------------ */
/* Verdict banner — the one-screen answer, first thing in the results  */
/* ------------------------------------------------------------------ */

export function VerdictBanner({ result }: { result: AnalysisResult & { runId?: string } }) {
  const v = computeVerdict(result.summary, result.attribution);
  const toneCls =
    v.tone === 'detected'
      ? 'border-[#2C5F58]/40 bg-[#EDF4F1]'
      : v.tone === 'inconclusive'
        ? 'border-[#B08D57]/50 bg-[#F7F2E7]'
        : 'border-[#D8D2C6] bg-[#F7F4EE]';
  const textCls = v.tone === 'detected' ? 'text-[#2C5F58]' : v.tone === 'inconclusive' ? 'text-[#7A6438]' : 'text-[#1C1A17]';
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className={`rounded-xl border px-4 py-4 ${toneCls}`}
      role="status"
    >
      <div className="flex items-start gap-2.5">
        <Activity className={`mt-0.5 h-4.5 w-4.5 shrink-0 ${textCls}`} size={18} aria-hidden />
        <div>
          <p className={`text-[15px] font-semibold leading-6 ${textCls}`}>{v.headline}</p>
          <p
            className="mt-1.5 text-[12.5px] leading-[1.45rem] text-[#6F6862]"
            dangerouslySetInnerHTML={{ __html: v.support }}
          />
        </div>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* Histogram of the measured displacement + threshold explorer         */
/* ------------------------------------------------------------------ */

function buildHistogram(grids: DecodedGrids) {
  // Symmetric bins in mm around zero; masked pixels only.
  let absMax = 0;
  for (let i = 0; i < grids.displacement.length; i++) {
    if (grids.mask[i]) {
      const v = Math.abs(grids.displacement[i]);
      if (Number.isFinite(v) && v > absMax) absMax = v;
    }
  }
  const maxMm = Math.max(20, Math.ceil((absMax * 1000) / 10) * 10);
  const nBins = 25;
  const w = (2 * maxMm) / nBins;
  const counts = new Array<number>(nBins).fill(0);
  let total = 0;
  for (let i = 0; i < grids.displacement.length; i++) {
    if (!grids.mask[i]) continue;
    const mmv = grids.displacement[i] * 1000;
    if (!Number.isFinite(mmv)) continue;
    let b = Math.floor((mmv + maxMm) / w);
    if (b < 0) b = 0;
    if (b >= nBins) b = nBins - 1;
    counts[b]++;
    total++;
  }
  const bins = counts.map((c, i) => ({
    x: Math.round(-maxMm + (i + 0.5) * w),
    count: c,
    frac: total ? c / total : 0,
    toward: -maxMm + (i + 0.5) * w < 0,
  }));
  return { bins, maxMm, total };
}

function countAbove(grids: DecodedGrids, thresholdM: number): number {
  let c = 0;
  for (let i = 0; i < grids.displacement.length; i++) {
    if (grids.mask[i] && Math.abs(grids.displacement[i]) >= thresholdM) c++;
  }
  return c;
}

export function HistogramCard({
  grids,
  summary,
  isPrediction = false,
}: {
  grids: DecodedGrids;
  summary: AnalysisResult['summary'];
  isPrediction?: boolean;
}) {
  const [threshMm, setThreshMm] = useState<number | null>(null);
  const hist = useMemo(() => buildHistogram(grids), [grids]);
  const floorMm = (summary.systematicIonoFloorM ?? 0) * 1000;
  const appliedMm = (summary.thresholdMedianM ?? 0) * 1000;

  // Live area-above-threshold for the explorer slider.
  const live = useMemo(() => {
    const t = (threshMm ?? appliedMm) / 1000;
    const px = countAbove(grids, t);
    return { km2: px * (summary.pixelAreaKm2 ?? 0), px };
  }, [grids, threshMm, appliedMm, summary.pixelAreaKm2]);

  if (isPrediction) {
    return (
      <p className="text-[12px] leading-[1.4rem] text-[#8A837B]">
        Distribution charts apply to measurements; this layer is a model prediction.
      </p>
    );
  }

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <MicroLabel>How the measurements are distributed</MicroLabel>
        <span className="text-[10.5px] text-[#8A837B]">{hist.total.toLocaleString()} measured pixels</span>
      </div>
      <div className="mt-2.5 h-[170px] w-full" role="img" aria-label="Histogram of apparent movement values">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={hist.bins} margin={{ top: 6, right: 6, left: -18, bottom: 0 }} barCategoryGap={1}>
            <XAxis
              dataKey="x"
              tick={{ fontSize: 9.5, fill: '#8A837B' }}
              tickFormatter={(v) => `${v}`}
              stroke="#D8D2C6"
              interval={5}
              label={{ value: 'apparent movement (mm)  ·  − toward · + away', position: 'insideBottom', offset: -2, fontSize: 9, fill: '#8A837B' }}
            />
            <YAxis tick={{ fontSize: 9.5, fill: '#8A837B' }} stroke="#D8D2C6" tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : `${v}`)} width={38} />
            <Tooltip
              cursor={{ fill: 'rgba(28,26,23,0.04)' }}
              formatter={(value: number, _n, item) => [`${value.toLocaleString()} px (${((item as { payload?: { frac?: number } }).payload?.frac ?? 0) * 100 < 0.1 ? '<0.1' : (((item as { payload?: { frac?: number } }).payload?.frac ?? 0) * 100).toFixed(1)}%)`, 'pixels']}
              labelFormatter={(l) => `around ${l} mm`}
              contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #E7E2DA' }}
            />
            <ReferenceLine x={0} stroke="#4A443C" strokeWidth={1} />
            {floorMm > 0 && floorMm < hist.maxMm && (
              <ReferenceLine x={floorMm} stroke="#9E3B2C" strokeDasharray="4 3" label={{ value: 'ionosphere floor', fontSize: 9, fill: '#9E3B2C', position: 'top' }} />
            )}
            {floorMm > 0 && floorMm < hist.maxMm && (
              <ReferenceLine x={-floorMm} stroke="#9E3B2C" strokeDasharray="4 3" />
            )}
            <Bar dataKey="count" radius={[2, 2, 0, 0]} animationDuration={700}>
              {hist.bins.map((b, i) => (
                <Cell key={i} fill={b.toward ? '#B0714E' : '#2C5F58'} fillOpacity={0.82} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-1.5 text-[11px] leading-4 text-[#8A837B]">
        Each bar counts pixels whose apparent movement falls in that range.{' '}
        {floorMm > 0 && <>The dashed line marks the ionosphere-related noise floor ({floorMm.toFixed(0)} mm): anything smaller than this cannot be confidently told apart from ionosphere effects. </>}
        <WhatIsThis>the radar signal travels through the ionosphere — a layer of charged particles — and when it is disturbed it shifts the signal by amounts that look exactly like ground movement. The product ships an estimate of this distortion but does not remove it, so the analysis treats it as a hard noise floor.</WhatIsThis>
      </p>

      {/* Threshold explorer */}
      <div className="mt-3 rounded-lg border border-[#EFEAE2] bg-[#FDFCF9] px-3.5 py-3">
        <div className="flex items-center justify-between gap-3">
          <MicroLabel>Explore: what counts as &ldquo;detected&rdquo;?</MicroLabel>
          <span className="font-mono text-[12px] tabular-nums text-[#1C1A17]">{(threshMm ?? appliedMm).toFixed(0)} mm</span>
        </div>
        <input
          type="range"
          min={5}
          max={Math.max(30, Math.ceil(hist.maxMm))}
          step={5}
          value={threshMm ?? Math.round(appliedMm)}
          onChange={(e) => setThreshMm(Number(e.target.value))}
          className="mt-2 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-[#E7E2DA] accent-[#1C1A17]"
          aria-label="Detection threshold explorer (mm)"
        />
        <p className="mt-1.5 text-[11.5px] leading-4 text-[#6F6862]">
          At this threshold, <strong className="font-semibold text-[#1C1A17]">{areaLabel(live.km2)}</strong> of the
          measured area would be flagged ({live.px.toLocaleString()} pixels).{' '}
          {threshMm !== null && Math.abs(threshMm - appliedMm) >= 5 && (
            <span className="text-[#8A837B]">(the analysis actually used {appliedMm.toFixed(0)} mm)</span>
          )}
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Profile line through the anomaly                                    */
/* ------------------------------------------------------------------ */

function buildProfile(
  grids: DecodedGrids,
  meta: { xStart: number; xSpacing: number; yStart: number; ySpacing: number; width: number; height: number; epsg: number },
  summary: AnalysisResult['summary'],
) {
  // Start point: the anomaly centroid when known, else the largest-signal pixel.
  const w = grids.width;
  const h = grids.height;
  let ci: number, cj: number;
  if (summary.anomalyCentroid && Number.isFinite(summary.anomalyCentroid.x)) {
    cj = Math.round((summary.anomalyCentroid.x - meta.xStart) / meta.xSpacing);
    ci = Math.round((meta.yStart - summary.anomalyCentroid.y) / -meta.ySpacing);
  } else {
    let best = 0;
    ci = Math.floor(h / 2);
    cj = Math.floor(w / 2);
    for (let i = 0; i < h; i++) {
      for (let j = 0; j < w; j++) {
        const gi = i * w + j;
        if (!grids.mask[gi]) continue;
        const v = Math.abs(grids.displacement[gi]);
        if (Number.isFinite(v) && v > best) {
          best = v;
          ci = i;
          cj = j;
        }
      }
    }
  }
  ci = Math.min(h - 1, Math.max(0, ci));
  cj = Math.min(w - 1, Math.max(0, cj));

  // Direction: the anomaly's principal axis (degrees from east), else E-W.
  const thetaDeg = summary.anomalyOrientationDeg ?? 0;
  const theta = (thetaDeg * Math.PI) / 180;
  const dx = Math.cos(theta);
  const dy = -Math.sin(theta); // rows grow southward

  const maxSpanPx = Math.min(400, Math.floor(Math.min(w, h) * 0.9));
  const half = Math.floor(maxSpanPx / 2);
  const pts: Array<{ km: number; mm: number; sigma: number }> = [];
  const spacingKm = meta.xSpacing / 1000;
  for (let s = -half; s <= half; s++) {
    const i = Math.round(ci + dy * s);
    const j = Math.round(cj + dx * s);
    if (i < 0 || i >= h || j < 0 || j >= w) continue;
    const gi = i * w + j;
    if (!grids.mask[gi]) continue;
    const d = grids.displacement[gi];
    const sg = grids.sigma[gi];
    if (!Number.isFinite(d)) continue;
    pts.push({ km: s * spacingKm, mm: d * 1000, sigma: Number.isFinite(sg) ? sg * 1000 : 0 });
  }
  return { pts, thetaDeg, through: summary.anomalyCentroid ? 'anomaly centre' : 'largest signal' };
}

export function ProfileCard({
  grids,
  gridsMeta,
  summary,
  isPrediction = false,
}: {
  grids: DecodedGrids;
  gridsMeta?: { xStart: number; xSpacing: number; yStart: number; ySpacing: number; width: number; height: number; epsg: number };
  summary: AnalysisResult['summary'];
  isPrediction?: boolean;
}) {
  const prof = useMemo(
    () => (gridsMeta ? buildProfile(grids, gridsMeta, summary) : null),
    [grids, gridsMeta, summary],
  );
  if (!prof || prof.pts.length < 4 || isPrediction) {
    return (
      <p className="text-[12px] leading-[1.4rem] text-[#8A837B]">
        Too few measured points along a profile line to plot — the measurable part of this scene is very sparse.
      </p>
    );
  }
  const data = prof.pts.map((p) => ({
    km: Math.round(p.km * 10) / 10,
    mm: Math.round(p.mm * 10) / 10,
    band: p.sigma,
    mmPlus: p.mm + p.sigma,
    mmMinus: p.mm - p.sigma,
  }));
  const floorMm = (summary.systematicIonoFloorM ?? 0) * 1000;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <MicroLabel>Movement along a line through the {prof.through}</MicroLabel>
        <span className="text-[10.5px] text-[#8A837B]">profile angle {prof.thetaDeg.toFixed(0)}° from east</span>
      </div>
      <div className="mt-2.5 h-[180px] w-full" role="img" aria-label="Profile of apparent movement with uncertainty band">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
            <XAxis
              dataKey="km"
              tick={{ fontSize: 9.5, fill: '#8A837B' }}
              stroke="#D8D2C6"
              label={{ value: 'distance along profile (km)', position: 'insideBottom', offset: -2, fontSize: 9, fill: '#8A837B' }}
            />
            <YAxis
              tick={{ fontSize: 9.5, fill: '#8A837B' }}
              stroke="#D8D2C6"
              width={40}
              tickFormatter={(v) => `${v}`}
              label={{ value: 'movement (mm)', angle: -90, position: 'insideLeft', fontSize: 9, fill: '#8A837B', dy: 40 }}
            />
            <Tooltip
              formatter={(value: number, name) => [
                name === 'mm' ? `${value.toFixed(1)} mm` : `${value.toFixed(1)}`,
                name === 'mm' ? 'apparent movement' : '± 1σ uncertainty',
              ]}
              labelFormatter={(l) => `${(l as number).toFixed(1)} km along profile`}
              contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #E7E2DA' }}
            />
            {floorMm > 0 && (
              <ReferenceArea y1={-floorMm} y2={floorMm} fill="#9E3B2C" fillOpacity={0.06} />
            )}
            <ReferenceLine y={0} stroke="#4A443C" strokeWidth={1} />
            <Line dataKey="mmPlus" stroke="#B8AFA2" strokeWidth={1} strokeDasharray="3 3" dot={false} activeDot={false} legendType="none" animationDuration={900} />
            <Line dataKey="mmMinus" stroke="#B8AFA2" strokeWidth={1} strokeDasharray="3 3" dot={false} activeDot={false} legendType="none" animationDuration={900} />
            <Line
              dataKey="mm"
              stroke="#1C1A17"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 3, fill: '#B0714E' }}
              animationDuration={900}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-1.5 text-[11px] leading-4 text-[#8A837B]">
        How the apparent movement varies along a line drawn through the {prof.through}, in the direction the
        change is most elongated. Negative = toward the satellite, positive = away; the dashed grey lines are
        the ±1σ measurement uncertainty at each point.{' '}
        {floorMm > 0 && <>The shaded band around zero is the ionosphere-related noise floor ({floorMm.toFixed(0)} mm) — anything inside it is not distinguishable from ionosphere effects. </>}
        <WhatIsThis>a profile is like a cross-section: it takes a slice through the map and shows the values along that slice, which makes the shape of a change (sharp step, smooth dome, tilted ramp) easier to see than in the color map.</WhatIsThis>
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Signal vs noise bars (recorded run)                                 */
/* ------------------------------------------------------------------ */

export function SignalVsNoiseCard({
  signalMm,
  floorMm,
  sigmaMm,
  zeroFraction,
}: {
  signalMm: number;
  floorMm: number;
  sigmaMm: number;
  zeroFraction?: number;
}) {
  const data = [
    { name: 'largest apparent signal', mm: Math.round(signalMm), fill: '#2C5F58' },
    { name: 'ionosphere noise floor', mm: Math.round(floorMm), fill: '#9E3B2C' },
    { name: 'typical measurement noise', mm: Math.round(sigmaMm), fill: '#B08D57' },
  ];
  return (
    <div>
      <MicroLabel>Signal versus noise (recorded figures)</MicroLabel>
      <div className="mt-2.5 h-[150px] w-full" role="img" aria-label="Bar chart comparing the largest signal with the noise floor">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 30, left: 10, bottom: 0 }}>
            <XAxis type="number" tick={{ fontSize: 9.5, fill: '#8A837B' }} stroke="#D8D2C6" unit=" mm" />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#4A443C' }} stroke="#D8D2C6" width={135} />
            <Tooltip formatter={(v: number) => [`${v} mm`, '']} contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #E7E2DA' }} />
            <Bar dataKey="mm" radius={[0, 4, 4, 0]} animationDuration={800} label={{ position: 'right', fontSize: 10, fill: '#4A443C', formatter: (v: number) => `${v} mm` }}>
              {data.map((d, i) => (
                <Cell key={i} fill={d.fill} fillOpacity={0.85} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {zeroFraction !== undefined && (
        <p className="mt-1.5 text-[11px] leading-4 text-[#8A837B]">
          {(zeroFraction * 100).toFixed(1)}% of the measurable region showed no apparent change at all; the remaining{' '}
          {((1 - zeroFraction) * 100).toFixed(1)}% reached at most ±{signalMm.toFixed(0)} mm — still below the noise floor.
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Seismic timeline — acquisitions + real USGS events                  */
/* ------------------------------------------------------------------ */

export function SeismicTimeline({
  referenceTime,
  secondaryTime,
  events,
  primaryEventId,
  compact = false,
}: {
  referenceTime: string;
  secondaryTime: string;
  events: UsgsEventLite[];
  primaryEventId?: string | null;
  compact?: boolean;
}) {
  const t0 = Date.parse(referenceTime);
  const t1 = Date.parse(secondaryTime);
  if (!Number.isFinite(t0) || !Number.isFinite(t1) || t1 <= t0) return null;
  const inWindow = events.filter((e) => {
    const t = Date.parse(e.time);
    return Number.isFinite(t) && t >= t0 && t <= t1;
  });
  const shown = (compact ? inWindow : events).slice(0, compact ? 8 : 14);
  const pos = (iso: string) => {
    const t = Date.parse(iso);
    return Math.max(2, Math.min(98, ((t - t0) / (t1 - t0)) * 100));
  };
  return (
    <div className="rounded-lg border border-[#EFEAE2] bg-[#FDFCF9] p-3.5">
      <div className="flex items-baseline justify-between gap-3">
        <MicroLabel>Earthquakes near this radar pair</MicroLabel>
        <span className="text-[10.5px] text-[#8A837B]">live USGS catalog</span>
      </div>
      <div className="relative mt-4 h-14">
        {/* acquisition window band */}
        <div className="absolute left-0 right-0 top-6 h-2 rounded-full bg-gradient-to-r from-[#E7E2DA] via-[#B08D57]/40 to-[#E7E2DA]" />
        <motion.div
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          style={{ originX: 0 }}
          className="absolute left-0 right-0 top-6 h-2 rounded-full bg-gradient-to-r from-[#B0714E]/60 to-[#2C5F58]/60"
        />
        {/* endpoint labels */}
        <div className="absolute -top-0.5 left-0 font-mono text-[9.5px] leading-3 text-[#8A837B]">
          1st image
          <div className="text-[#4A443C]">{fmtDateTime(referenceTime).slice(0, 11)}</div>
        </div>
        <div className="absolute -top-0.5 right-0 text-right font-mono text-[9.5px] leading-3 text-[#8A837B]">
          2nd image
          <div className="text-[#4A443C]">{fmtDateTime(secondaryTime).slice(0, 11)}</div>
        </div>
        {/* events */}
        {shown.map((ev, idx) => {
          const primary = ev.id === primaryEventId;
          const inside = Date.parse(ev.time) >= t0 && Date.parse(ev.time) <= t1;
          return (
            <motion.div
              key={ev.id}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 + idx * 0.07, duration: 0.3 }}
              className="group absolute -translate-x-1/2"
              style={{ left: `${pos(ev.time)}%`, top: inside ? 13 : 22 }}
              title={`M${ev.magnitude.toFixed(1)} — ${ev.place}\n${fmtDateTime(ev.time)} · depth ${ev.depthKm.toFixed(0)} km`}
            >
              <a
                href={ev.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`M${ev.magnitude} earthquake, ${ev.place}, ${fmtDateTime(ev.time)}`}
                className={`block rounded-full border-2 transition-transform hover:scale-125 ${
                  primary
                    ? 'border-[#6E2418] bg-[#9E3B2C] shadow-[0_0_0_4px_rgba(158,59,44,0.15)]'
                    : inside
                      ? 'border-[#9E3B2C]/70 bg-[#9E3B2C]/70'
                      : 'border-[#B8AFA2] bg-white'
                }`}
                style={{ width: Math.max(7, 6 + Math.max(0, ev.magnitude - 4) * 2.4), height: Math.max(7, 6 + Math.max(0, ev.magnitude - 4) * 2.4), marginTop: 4 }}
              />
              {primary && (
                <span className="absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap font-mono text-[9px] font-semibold text-[#9E3B2C]">
                  M{ev.magnitude.toFixed(1)}
                </span>
              )}
            </motion.div>
          );
        })}
      </div>
      <p className="mt-1 text-[11px] leading-4 text-[#8A837B]">
        {inWindow.length === 0
          ? 'No earthquakes appear inside this acquisition window (shown for context only).'
          : inWindow.length === 1
            ? 'One earthquake occurred between the two radar images — inside the measurement window.'
            : `${inWindow.length} earthquakes occurred between the two radar images.`}{' '}
        Dot size = magnitude; outlined dots fall outside the window.{' '}
        <WhatIsThis>a radar pair can only measure changes that happened BETWEEN its two images — that is the measurement window. Earthquakes inside it are candidates for explaining a detected pattern; ones outside it cannot be.</WhatIsThis>
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* "Why can't I see anything?" — plain-language explainer              */
/* ------------------------------------------------------------------ */

export function WhyCantISeeAnything({ summary }: { summary: AnalysisResult['summary'] }) {
  const floorMm = (summary.systematicIonoFloorM ?? 0) * 1000;
  const covPct = (summary.validFraction ?? 0) * 100;
  const items: Array<{ icon: React.ReactNode; title: string; body: React.ReactNode }> = [];

  if (floorMm > 15) {
    items.push({
      icon: <Radio className="h-4 w-4" aria-hidden />,
      title: 'Ionospheric disturbance',
      body: (
        <>
          The radar signal passed through the ionosphere — a layer of charged particles 80–1000 km up — and it
          was strongly disturbed during these acquisitions. That shifts the signal by{' '}
          <strong className="font-semibold text-[#1C1A17]">{floorMm.toFixed(0)} mm</strong>, which looks exactly
          like ground movement. The product ships an estimate of this distortion but does not remove it, so
          anything smaller than the floor is treated as unmeasurable.{' '}
          <WhatIsThis>L-band radar (24 cm wavelength) is the best available choice for ionosphere tolerance, but a severe disturbance can still swamp it — that is what happened here.</WhatIsThis>
        </>
      ),
    });
  }
  if (covPct < 50) {
    items.push({
      icon: <Waves className="h-4 w-4" aria-hidden />,
      title: 'Coherence loss',
      body: (
        <>
          Only <strong className="font-semibold text-[#1C1A17]">{covPct.toFixed(0)}%</strong> of the scene had a
          reliable enough signal to measure at all (median signal quality{' '}
          {(summary.coherenceMedian ?? 0).toFixed(2)} on a 0–1 scale). Where the surface or the signal changes
          too much between the two images, the comparison becomes noise — those areas are shown as blank on
          the map and are excluded from every statistic.{' '}
          <WhatIsThis>coherence measures how similar the radar echo is between the two passes. Vegetation, snow, water, and extreme ionospheric disturbance all destroy it.</WhatIsThis>
        </>
      ),
    });
  }
  items.push({
    icon: <Gauge className="h-4 w-4" aria-hidden />,
    title: 'The noise floor of this pair',
    body: (
      <>
        Random measurement scatter is about ±{((summary.medianSigmaM ?? 0) * 1000).toFixed(1)} mm per pixel, and
        the analysis only flags changes above{' '}
        <strong className="font-semibold text-[#1C1A17]">{((summary.thresholdMedianM ?? 0) * 1000).toFixed(0)} mm</strong>{' '}
        (the stricter of the statistical rule and the physical floor). A real change smaller than that is
        present-but-unprovable from this pair alone.{' '}
        <WhatIsThis>stacking many independent pairs over time is the standard remedy: random noise averages down roughly as the square root of the number of pairs, while a real signal mostly adds up.</WhatIsThis>
      </>
    ),
  });

  return (
    <div className="rounded-xl border border-[#E7D9B8] bg-[#FCF8EE] p-4">
      <p className="flex items-center gap-2 text-[13px] font-semibold text-[#7A6438]">
        <HelpCircle className="h-4 w-4 shrink-0" aria-hidden />
        Why can&rsquo;t I see anything on the map?
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {items.map((it, i) => (
          <motion.div
            key={it.title}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + i * 0.08, duration: 0.3 }}
            className="rounded-lg border border-[#EFE5CC] bg-white/70 p-3"
          >
            <p className="flex items-center gap-1.5 text-[12px] font-semibold text-[#7A6438]">
              <span className="text-[#B08D57]">{it.icon}</span>
              {it.title}
            </p>
            <p className="mt-1.5 text-[11.5px] leading-[1.45rem] text-[#6F6862]">{it.body}</p>
          </motion.div>
        ))}
      </div>
      <p className="mt-3 text-[11.5px] leading-4 text-[#8A837B]">
        This is normal and expected for single radar pairs — it is why MOTUS reports a noise floor instead of a
        confident zero. The &ldquo;no change detected&rdquo; verdict means exactly what it says: nothing above
        the threshold this data can support.
      </p>
    </div>
  );
}
