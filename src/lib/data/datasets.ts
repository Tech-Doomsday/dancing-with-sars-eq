/**
 * Dataset registry — safe discovery and loading of analysis-ready datasets.
 *
 * DESIGN CONTRACT (remediation 2026-10-21):
 *
 * 1. A fresh clone without any local scientific data must be able to list the
 *    dataset registry WITHOUT crashing. Every configured dataset is described
 *    by a static registry entry (title, blurb, provenance template, required
 *    files), so listing never depends on the files existing.
 * 2. Dataset discovery is explicit and structured: each dataset resolves to an
 *    availability state — 'available' | 'missing' | 'incomplete' | 'invalid' —
 *    with a human-readable explanation and the list of missing/failed files.
 *    Missing local data is NEVER silently replaced by zeros, fabricated
 *    arrays, or an empty "successful" analysis.
 * 4. Loading a dataset with state != 'available' is refused by the analysis
 *    API (HTTP 409) with the structured reason; the UI displays it.
 *
 * Real derived datasets come from tools/extract_gunw.py output (lossless
 * extraction of official NISAR L2 GUNW products). Synthetic fixtures are
 * generated deterministically in-process by src/lib/science/fixtures.ts and
 * are always available offline — but they are VALIDATION MACHINERY ONLY:
 * getDataset()/getDatasetAvailability() still resolve them for the test
 * suite and the /api/v1 plan-spec endpoints, while REGISTRY_ORDER lists only
 * the real datasets so the UI never offers synthetic data as a study area.
 * The Panama evidence dataset needs only its small cached CMR/USGS JSON
 * records (committed to the repository).
 */

import fs from 'fs';
import path from 'path';
import type { GridMeta, Raster, ScienceDataset, AnalysisParams } from '@/lib/science/types';
import {
  syntheticStrikeSlipFixture,
  syntheticThrustFixture,
  syntheticNullFixture,
} from '@/lib/science/fixtures';
import { STACK_ID, stackDescriptor } from '@/lib/science/stacks';

const DERIVED_ROOT_DEFAULT = path.join(process.cwd(), 'data', 'derived');
const BROWSE_ROOT_DEFAULT = path.join(process.cwd(), 'data', 'nisar-browse');

/** Test hook: allows the offline tests to point the loaders at temp dirs. */
export const _testRoots: { derived: string; browse: string } = {
  derived: DERIVED_ROOT_DEFAULT,
  browse: BROWSE_ROOT_DEFAULT,
};

// ---------------------------------------------------------------------------
// Structured availability

export type DatasetState = 'available' | 'missing' | 'incomplete' | 'invalid';

export interface DatasetAvailability {
  state: DatasetState;
  /** Files that must exist but do not (relative to the dataset directory). */
  missingFiles: string[];
  /** Files that exist but failed validation (with the reason). */
  invalidFiles: Array<{ file: string; reason: string }>;
  /** Plain-language explanation for the UI/API. */
  explanation: string;
  /**
   * When the raw data is absent but a REAL recorded analysis of this dataset
   * exists (captured from a past run of the actual product and stored as
   * recorded_run.json), the availability carries a pointer to it. The state
   * remains 'missing' — the pipeline still refuses to re-run — but the UI can
   * offer the recorded result as an honest, clearly-labelled alternative.
   */
  recorded?: { recordedAt: string; note: string };
}

function available(): DatasetAvailability {
  return {
    state: 'available',
    missingFiles: [],
    invalidFiles: [],
    explanation: 'All required local files are present and pass structural validation.',
  };
}

// ---------------------------------------------------------------------------
// Static registry — describes every configured dataset without needing data.

interface DerivedRegistryEntry {
  id: string;
  /** Directory under data/derived/ */
  dir: string;
  requiredFiles: string[];
  /** Metadata shown when the local files are absent (fresh clone). */
  fallbackTitle: string;
  fallbackBlurb: string;
  /** Provenance fields that do not depend on meta.json. */
  provenanceTemplate: {
    provider: string;
    productType: string;
    sourceUrl: string;
    accessNotes: string;
  };
  /** How to obtain the data (rendered into the explanation when missing). */
  acquisitionInstructions: string;
  suggestedParams?: Partial<AnalysisParams>;
}

const MOJAVE_GRANULE_ID =
  'NISAR_L2_PR_GUNW_021_013_D_071_022_4000_SH_20260522T024038_20260522T024116_20260603T024038_20260603T024115_P05023_N_F_J_001';

const DERIVED_REGISTRY: DerivedRegistryEntry[] = [
  {
    id: 'real-nisar-mojave-2026',
    dir: 'nisar-mojave-2026',
    requiredFiles: ['meta.json', 'phase.f32', 'coherence.f32', 'components.u16'],
    fallbackTitle: 'Mojave Desert — real operational NISAR 12-day pair (May–June 2026)',
    fallbackBlurb:
      'Operational NISAR L2 GUNW granule (PROVISIONAL_V1 collection) over the southern Sierra / ' +
      'Owens Valley / Mojave scene, acquired through a severely disturbed ionosphere. Requires an ' +
      'Earthdata-authenticated download (2.58 GB HDF5) plus extraction before it can be analysed.',
    provenanceTemplate: {
      provider: 'NASA / ASF DAAC (NISAR operational mission data, processed by JPL NISAR SDS)',
      productType:
        'NISAR L2 GUNW — geocoded unwrapped interferogram (operational NISAR_L2_GUNW_PROVISIONAL_V1 collection)',
      sourceUrl:
        'https://nisar.asf.earthdatacloud.nasa.gov/NISAR/NISAR_L2_GUNW_PROVISIONAL_V1/' +
        `${MOJAVE_GRANULE_ID}/${MOJAVE_GRANULE_ID}.h5`,
      accessNotes:
        'Credential-gated: requires a free NASA Earthdata Login bearer token. Fetch with ' +
        'tools/fetch_nisar_granule.py (bearer-token -> presigned-URL exchange), then extract with ' +
        'tools/extract_gunw.py. The collection is openly catalogued via NASA CMR; the HDF5 download ' +
        'itself requires authentication.',
    },
    acquisitionInstructions:
      'Set EARTHDATA_BEARER_TOKEN in .env, run `python3 tools/fetch_nisar_granule.py` (see ' +
      'docs/data-sources.md §9), then `python3 tools/extract_gunw.py <granule.h5> ' +
      'data/derived/nisar-mojave-2026 --slug nisar-mojave-2026`.',
    suggestedParams: { coherenceThreshold: 0.1 },
  },
  {
    id: 'real-nisar-la-2008',
    dir: 'nisar-la-2008',
    requiredFiles: ['meta.json', 'phase.f32', 'coherence.f32', 'components.u16'],
    fallbackTitle: 'Los Angeles region — NISAR-format L-band interferogram (2008)',
    fallbackBlurb:
      'Real ALOS PALSAR L-band pair over the San Gabriel Mountains processed into a NISAR L2 GUNW ' +
      'product by the NISAR SDS (open sample product).',
    provenanceTemplate: {
      provider: 'NASA / ASF DAAC (NISAR sample products, processed by JPL NISAR SDS)',
      productType: 'NISAR L2 GUNW — geocoded unwrapped interferogram (sample product)',
      sourceUrl: 'https://nisar.jpl.nasa.gov/data/sample-data/ (NISAR-SAMPLE-DATA, open access)',
      accessNotes:
        'Openly distributed official NISAR sample product (ALOS PALSAR data processed through the ' +
        'NISAR SDS). Download the HDF5 from the sample-data page, then run tools/extract_gunw.py.',
    },
    acquisitionInstructions:
      'Download the sample HDF5 listed on https://nisar.jpl.nasa.gov/data/sample-data/ into ' +
      'data/nisar-sample/ (see docs/data-manifest.md for the expected filename and SHA-256), then ' +
      'run `python3 tools/extract_gunw.py data/nisar-sample/<file>.h5 data/derived/nisar-la-2008 ' +
      '--slug nisar-la-2008`.',
  },
];

// ---------------------------------------------------------------------------
// Derived meta schema + loading

interface DerivedMeta {
  slug: string;
  title: string;
  blurb: string;
  grid: GridMeta;
  radar: {
    wavelength: number;
    centerFrequencyHz?: number;
    polarization?: string;
    incidenceAngleDeg: number;
    headingDeg: number;
    passDirection: 'ascending' | 'descending';
    lookDirection: 'right' | 'left';
    losUnitVectorProductX: number;
    losUnitVectorProductY: number;
    numberOfLooks: number;
    /** New extractor (2026-10-21) statistics of the supplied-but-unapplied screen. */
    ionoScreenVariationMadRad?: number | null;
    ionoScreenVariationStdRad?: number | null;
    ionoScreenUncertaintyMedianRad?: number | null;
    /** Legacy field from the pre-remediation extractor (screen-estimate uncertainty). */
    ionoScreenSigmaRad?: number | null;
  };
  identification: {
    missionId: string;
    granuleId: string;
    frameNumber: number;
    trackNumber: number;
    productDoi: string;
    productSpecificationVersion: string;
    processingDateTime: string;
    referenceZeroDopplerStartTime: string;
    referenceZeroDopplerEndTime: string;
    secondaryZeroDopplerStartTime: string;
    secondaryZeroDopplerEndTime: string;
    temporalBaselineDays: number;
    boundingPolygon: [number, number][];
  };
  processing: {
    softwareVersion: string;
    unwrappingAlgorithm: string;
    flatteningMethod: string;
    wrappedFiltering: string;
    topographicFlatteningApplied: string;
    ellipsoidalFlatteningApplied: string;
    rangeIonosphericCorrectionApplied: string;
    azimuthIonosphericCorrectionApplied: string;
    hydrostaticTroposphericCorrectionApplied: string;
    wetTroposphericCorrectionApplied: string;
    /** Authoritative correction status of the consumed phase layer (new extractor). */
    phaseIonosphericCorrectionAppliedToLayer?: string;
    phaseTroposphericCorrectionAppliedToLayer?: string;
    demSource: string;
    l1ReferenceSlcGranules: string[];
    l1SecondarySlcGranules: string[];
    looksAzimuth: number;
    looksRange: number;
  };
  stats: {
    phaseNanFraction: number;
    coherenceMean: number;
    coherenceMedian: number;
  };
}

function readFloat32(file: string): Float32Array {
  const buf = fs.readFileSync(file);
  const out = new Float32Array(buf.length / 4);
  for (let i = 0; i < out.length; i++) {
    out[i] = buf.readFloatLE(i * 4);
  }
  return out;
}

function readUint16(file: string): Uint16Array {
  const buf = fs.readFileSync(file);
  const out = new Uint16Array(buf.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = buf.readUInt16LE(i * 2);
  }
  return out;
}

/** Shape of data/derived/<dir>/recorded_run.json (see the Mojave record). */
export interface RecordedRun {
  datasetId: string;
  note: string;
  recordedAt: string;
  provenance: {
    provider: string;
    productId: string;
    productType: string;
    platform: string;
    doi?: string;
    referenceTime: string;
    secondaryTime: string;
    temporalBaselineDays: number;
    sourceUrl: string;
    dataClass: 'real';
    qualityNotes?: string[];
  };
  geometry: {
    wavelength: number;
    incidenceAngleDeg: number;
    headingDeg: number;
    passDirection: 'ascending' | 'descending';
    lookDirection: 'right' | 'left';
    numberOfLooks: number;
  };
  footprintPolygon: [number, number][];
  center?: { lat: number; lon: number };
  params: AnalysisParams;
  summary: {
    validPixelCount: number;
    validFraction: number;
    analysedAreaKm2: number;
    coherenceMedian: number;
    affectedAreaKm2: number;
    systematicIonoFloorM: number;
    medianSigmaM: number;
    connectedComponentCount: number;
    [k: string]: unknown;
  };
  measuredFindings?: {
    maxAbsLosM: number;
    zeroPhaseFraction?: number;
    distribution?: Array<{ label: string; fraction: number }>;
    [k: string]: unknown;
  };
  event?: {
    id: string;
    magnitude: number;
    magType?: string;
    place: string;
    time: string;
    lat: number;
    lon: number;
    depthKm: number;
    url: string;
    insideAcquisitionWindow?: boolean;
    note?: string;
  };
  narrative: { verdict?: string; whatChanged: string; howMuch: string; reliability: string };
  attributionSummary?: { earthquake?: string; nullHypothesis?: string; methodNote?: string };
  warnings: string[];
}

/**
 * Attach a `recorded` pointer to a missing-data availability when a valid
 * recorded_run.json sits in the dataset directory. Never throws; a malformed
 * record is ignored (the plain missing state then applies).
 */
function withRecordedIfPresent(
  entry: DerivedRegistryEntry,
  dir: string,
  base: DatasetAvailability,
): DatasetAvailability {
  try {
    const p = path.join(dir, 'recorded_run.json');
    if (!fs.existsSync(p)) return base;
    const rec = JSON.parse(fs.readFileSync(p, 'utf-8')) as RecordedRun;
    if (rec?.datasetId !== entry.id || !rec?.summary || !rec?.narrative) return base;
    return {
      ...base,
      recorded: {
        recordedAt: rec.recordedAt,
        note: 'A real, recorded analysis of this dataset exists and can be viewed.',
      },
    };
  } catch {
    return base;
  }
}

/** Load and validate the recorded run of a dataset, if one exists. */
export function getRecordedRun(id: string): RecordedRun | undefined {
  const entry = DERIVED_REGISTRY.find((e) => e.id === id);
  if (!entry) return undefined;
  try {
    const p = path.join(_testRoots.derived, entry.dir, 'recorded_run.json');
    if (!fs.existsSync(p)) return undefined;
    const rec = JSON.parse(fs.readFileSync(p, 'utf-8')) as RecordedRun;
    if (rec?.datasetId !== id || !rec?.summary || !rec?.narrative) return undefined;
    return rec;
  } catch {
    return undefined;
  }
}

/**
 * Structural validation of one derived dataset directory. Never throws.
 * Checks: presence of required files, meta.json parseability, raster byte
 * sizes against the declared grid, and basic sanity of the grid metadata.
 */
function probeDerivedDataset(entry: DerivedRegistryEntry): DatasetAvailability {
  const dir = path.join(_testRoots.derived, entry.dir);
  const missingFiles: string[] = [];
  const invalidFiles: Array<{ file: string; reason: string }> = [];

  if (!fs.existsSync(dir)) {
    return withRecordedIfPresent(entry, dir, {
      state: 'missing',
      missingFiles: entry.requiredFiles,
      invalidFiles: [],
      explanation:
        `The local derived-data directory for this dataset (${entry.dir}) does not exist. ` +
        `This is expected in a fresh clone — the scientific data products are not part of the repository. ` +
        `${entry.acquisitionInstructions}`,
    });
  }

  for (const f of entry.requiredFiles) {
    if (!fs.existsSync(path.join(dir, f))) missingFiles.push(f);
  }
  if (missingFiles.length === entry.requiredFiles.length) {
    return withRecordedIfPresent(entry, dir, {
      state: 'missing',
      missingFiles,
      invalidFiles,
      explanation:
        `None of the required files for this dataset are present in ${entry.dir}. ` +
        `${entry.acquisitionInstructions}`,
    });
  }
  if (missingFiles.length > 0) {
    return {
      state: 'incomplete',
      missingFiles,
      invalidFiles,
      explanation:
        `Some required files are missing from ${entry.dir}: ${missingFiles.join(', ')}. ` +
        'A partial dataset cannot be analysed — re-run the extraction to produce a complete set ' +
        `(tools/extract_gunw.py writes all four files atomically enough for this check). ` +
        `${entry.acquisitionInstructions}`,
    };
  }

  // meta.json must parse and describe the grid the rasters must match.
  let meta: DerivedMeta | undefined;
  try {
    meta = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf-8')) as DerivedMeta;
  } catch (err) {
    return {
      state: 'invalid',
      missingFiles: [],
      invalidFiles: [{ file: 'meta.json', reason: `unparseable: ${(err as Error).message}` }],
      explanation:
        `The metadata file in ${entry.dir} cannot be parsed; the dataset may be corrupt or ` +
        'truncated. Re-download the source product and re-run the extraction.',
    };
  }
  const g = meta.grid;
  if (
    !Number.isInteger(g?.width) || !Number.isInteger(g?.height) ||
    g.width < 2 || g.height < 2 || !Number.isFinite(g?.xSpacing) || g.xSpacing <= 0
  ) {
    return {
      state: 'invalid',
      missingFiles: [],
      invalidFiles: [{ file: 'meta.json', reason: 'grid metadata is not structurally valid' }],
      explanation: `The grid metadata in ${entry.dir}/meta.json is not structurally valid.`,
    };
  }
  const n = g.width * g.height;
  const expected: Record<string, number> = {
    'phase.f32': n * 4,
    'coherence.f32': n * 4,
    'components.u16': n * 2,
  };
  for (const [file, bytes] of Object.entries(expected)) {
    const actual = fs.statSync(path.join(dir, file)).size;
    if (actual !== bytes) {
      invalidFiles.push({
        file,
        reason: `size ${actual} bytes does not match the ${g.width}x${g.height} grid declared in meta.json (${bytes} bytes expected) — truncated or stale file`,
      });
    }
  }
  if (invalidFiles.length > 0) {
    return {
      state: 'invalid',
      missingFiles: [],
      invalidFiles,
      explanation:
        `One or more raster files in ${entry.dir} do not match the grid declared in meta.json. ` +
        'The dataset is corrupt or was extracted from a different product; re-run the extraction.',
    };
  }

  return available();
}

interface DerivedLoadOptions {
  sourceUrl: string;
  accessNotes: string;
  provider?: string;
  productType?: string;
  suggestedParams?: Partial<AnalysisParams>;
}

function loadDerivedDataset(dir: string, opts: DerivedLoadOptions): ScienceDataset {
  const meta = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf-8')) as DerivedMeta;
  const phaseRaster: Raster = { meta: meta.grid, data: readFloat32(path.join(dir, 'phase.f32')) };
  const coherenceRaster: Raster = {
    meta: meta.grid,
    data: readFloat32(path.join(dir, 'coherence.f32')),
  };
  const components = readUint16(path.join(dir, 'components.u16'));

  // Dataset centre from the bounding polygon.
  const poly = meta.identification.boundingPolygon;
  const cx = poly.reduce((s, p) => s + p[0], 0) / poly.length;
  const cy = poly.reduce((s, p) => s + p[1], 0) / poly.length;

  const qualityNotes = [
    `Phase unwrapping: ${meta.processing.unwrappingAlgorithm}`,
    `Flattening (geometric term removed): ${meta.processing.flatteningMethod}`,
    // Correction status per the authoritative ASF GUNW guide: the geocoding
    // flags below record GEOLOCATION-step corrections, and the ionospheric /
    // tropospheric phase corrections are supplied but NOT removed from the
    // interferometric data. Stating "applied" without this caveat would
    // misrepresent the product.
    `Geocoding-step ionospheric correction flag: ${meta.processing.rangeIonosphericCorrectionApplied} (geolocation only, not a phase correction)`,
    `Geocoding-step tropospheric correction flags: hydrostatic ${meta.processing.hydrostaticTroposphericCorrectionApplied}, wet ${meta.processing.wetTroposphericCorrectionApplied} (geolocation only, not a phase correction)`,
    meta.processing.phaseIonosphericCorrectionAppliedToLayer
      ? `Ionospheric phase screen: ${meta.processing.phaseIonosphericCorrectionAppliedToLayer}`
      : 'Ionospheric phase screen: supplied by the producer but not applied to the stored phase (ASF GUNW guide)',
    `No-data fraction in stored layers: ${(meta.stats.phaseNanFraction * 100).toFixed(1)}%`,
    `Multilooking: ${meta.processing.looksAzimuth} az x ${meta.processing.looksRange} rg = ${meta.radar.numberOfLooks} looks`,
    'Output of the pipeline is apparent relative LOS range change: uncorrected tropospheric and ionospheric residuals remain in the measurement and are quantified as a systematic floor.',
  ];

  return {
    id: `real-${meta.slug}`,
    slug: meta.slug,
    title: meta.title,
    blurb: meta.blurb,
    mode: 'quantitative',
    suggestedParams: opts.suggestedParams,
    provenance: {
      datasetId: `real-${meta.slug}`,
      provider: opts.provider ?? 'NASA / ASF DAAC (NISAR sample products, processed by JPL NISAR SDS)',
      productId: meta.identification.granuleId,
      productType: opts.productType ?? 'NISAR L2 GUNW — geocoded unwrapped interferogram (sample product)',
      platform: `${meta.identification.missionId} L-band (NISAR SDS v${meta.processing.softwareVersion})`,
      referenceTime: meta.identification.referenceZeroDopplerStartTime,
      secondaryTime: meta.identification.secondaryZeroDopplerStartTime,
      temporalBaselineDays: meta.identification.temporalBaselineDays,
      processingTime: meta.identification.processingDateTime,
      processingSoftware: `NISAR SDS ${meta.processing.softwareVersion}, spec v${meta.identification.productSpecificationVersion}`,
      dataClass: 'real',
      sourceUrl: opts.sourceUrl,
      doi: meta.identification.productDoi,
      accessNotes: opts.accessNotes,
      qualityNotes,
    },
    geometry: {
      wavelength: meta.radar.wavelength,
      incidenceAngleDeg: meta.radar.incidenceAngleDeg,
      headingDeg: meta.radar.headingDeg,
      passDirection: meta.radar.passDirection,
      lookDirection: meta.radar.lookDirection,
    },
    phase: phaseRaster,
    coherence: coherenceRaster,
    components,
    numberOfLooks: meta.radar.numberOfLooks,
    ionoScreen: buildIonoScreen(meta.radar),
    footprintPolygon: meta.identification.boundingPolygon,
    center: { lat: cy, lon: cx },
  };
}

/**
 * Map the extracted ionospheric screen statistics onto the dataset. Handles
 * both the new extractor fields and the legacy single field (screen-estimate
 * uncertainty only) so older derived directories remain usable.
 */
function buildIonoScreen(
  radar: DerivedMeta['radar'],
): ScienceDataset['ionoScreen'] {
  const variationMad = radar.ionoScreenVariationMadRad;
  const variationStd = radar.ionoScreenVariationStdRad;
  const uncMedian =
    radar.ionoScreenUncertaintyMedianRad ?? radar.ionoScreenSigmaRad ?? null;
  if (
    (variationMad == null || !Number.isFinite(variationMad)) &&
    (variationStd == null || !Number.isFinite(variationStd)) &&
    (uncMedian == null || !Number.isFinite(uncMedian))
  ) {
    return undefined;
  }
  return {
    variationMadRad: Number.isFinite(variationMad as number) ? (variationMad as number) : 0,
    variationStdRad: Number.isFinite(variationStd as number) ? (variationStd as number) : 0,
    uncertaintyMedianRad: Number.isFinite(uncMedian as number) ? (uncMedian as number) : 0,
  };
}

// ---------------------------------------------------------------------------
// Panama evidence dataset (cached CMR + USGS records)

interface PanamaGranuleRecord {
  granuleId: string;
  timeStart: string;
  timeEnd: string;
  polygon: string;
  sizeMB: number;
  dataUrl?: string;
  browseUrl?: string;
  conceptId: string;
}

function loadPanamaEvidenceDataset(): { ds: ScienceDataset } {
  const granules = JSON.parse(
    fs.readFileSync(path.join(_testRoots.derived, 'panama-2026', 'granules.json'), 'utf-8'),
  ) as PanamaGranuleRecord[];
  const ev = JSON.parse(
    fs.readFileSync(path.join(_testRoots.derived, 'panama-2026', 'usgs_event.json'), 'utf-8'),
  ) as {
    id: string; magnitude: number; place: string; time: string; lat: number; lon: number;
    depthKm: number; url: string; nodalPlane: { strike: string; dip: string; rake: string } | null;
    momentTensorSource: string | null;
  };

  // Select the primary granule by explicit criteria, NOT by array order:
  // (1) its acquisition interval must bracket the event; (2) among those,
  // prefer the granule whose footprint polygon contains the event (nearest
  // centroid as tiebreak). The criteria are returned to the API for display.
  const eventTime = Date.parse(ev.time);
  const withDist = granules.map((g, idx) => {
    const poly = parsePolygonLocal(g.polygon);
    const contains = pointInPolygon(ev.lon, ev.lat, poly);
    const centroid = poly.length
      ? {
          lon: poly.reduce((s, p) => s + p[0], 0) / poly.length,
          lat: poly.reduce((s, p) => s + p[1], 0) / poly.length,
        }
      : { lon: ev.lon, lat: ev.lat };
    const dLon = ((centroid.lon - ev.lon + 540) % 360) - 180;
    const distDeg = Math.hypot(centroid.lat - ev.lat, dLon);
    return {
      granule: g,
      idx,
      brackets:
        Number.isFinite(eventTime) &&
        Date.parse(g.timeStart) < eventTime &&
        Date.parse(g.timeEnd) > eventTime,
      contains,
      distDeg,
    };
  });
  const bracketing = withDist.filter((w) => w.brackets);
  const candidates = bracketing.length > 0 ? bracketing : withDist;
  candidates.sort((a, b) => (b.contains ? 1 : 0) - (a.contains ? 1 : 0) || a.distDeg - b.distDeg);
  const primary = candidates[0]?.granule ?? granules[0];
  const selectionCriteria = {
    rule:
      'Primary granule = the CMR-catalogued pair whose acquisition interval brackets the event, ' +
      'preferring footprints that contain the epicentre (nearest centroid as tie-break). Array ' +
      'order from the CMR response is explicitly NOT used.',
    considered: granules.length,
    bracketing: bracketing.length,
    selectedContainsEpicentre: candidates[0]?.contains ?? false,
    sourceUrl: `https://cmr.earthdata.nasa.gov/search/concepts/${primary.conceptId}.json`,
    retrievedAt: '2026-10-20 (cached CMR query; live re-verification available in the UI)',
  };

  // Parse the CMR polygon ("lat lon lat lon ...").
  const poly = parsePolygonLocal(primary.polygon);

  // Local browse images (downloaded from the official ASF cloud, open access).
  // The directory may legitimately be absent in a minimal deployment — the
  // gallery degrades to per-image fetch instructions.
  const browseFiles = listBrowseFiles();

  const evLite = {
    id: ev.id,
    magnitude: ev.magnitude,
    place: ev.place,
    time: ev.time,
    lat: ev.lat,
    lon: ev.lon,
    depthKm: ev.depthKm,
    url: ev.url,
    nodalPlane: ev.nodalPlane
      ? {
          strike: Number(ev.nodalPlane.strike),
          dip: Number(ev.nodalPlane.dip),
          rake: Number(ev.nodalPlane.rake),
        }
      : undefined,
    momentTensorSource: ev.momentTensorSource ?? undefined,
  };

  const ds: ScienceDataset = {
    id: 'evidence-panama-2026',
    slug: 'panama-2026',
    title: 'Panama M7.7 earthquake — real NISAR evidence (October 2026)',
    blurb:
      'A M7.7 earthquake struck Panama on 9 October 2026, between the acquisitions of real NISAR ' +
      'interferometric pairs. Explore the actual product availability, official browse imagery and an ' +
      'independent forward model of the expected deformation.',
    mode: 'evidence',
    provenance: {
      datasetId: 'evidence-panama-2026',
      provider: 'NASA CMR / ASF DAAC / USGS (all queried live or cached from live queries)',
      productId: primary.granuleId,
      productType: 'NISAR L2 GUNW — granule metadata + official browse imagery',
      platform: 'NISAR L-SAR (L band)',
      referenceTime: primary.timeStart,
      secondaryTime: primary.timeEnd,
      temporalBaselineDays: 12,
      processingTime: undefined,
      processingSoftware: 'NISAR SDS (browse rendering: official product browse)',
      dataClass: 'real',
      sourceUrl: `https://cmr.earthdata.nasa.gov/search/concepts/${primary.conceptId}.json`,
      doi: '10.5067/NIL2GUNW-B1',
      accessNotes:
        'Granule metadata (NASA CMR) and official browse imagery are open. The full HDF5 science ' +
        'product (~1-2 GB) requires a free NASA Earthdata Login to download; this deployment has no ' +
        'credentials, so quantitative processing of this specific pair is not performed here. The ' +
        'identical pipeline is demonstrated on the open NISAR sample product and synthetic fixtures.',
      qualityNotes: [
        `${granules.length} NISAR GUNW granules with acquisition pairs bracketing the M7.7 event are catalogued for this region`,
        'Browse images are the official SDS renderings (geocoded unwrapped phase) served by the ASF cloud',
        'Acquisition intervals spanning the event do NOT by themselves establish that a measurable deformation signal is present in the products',
      ],
    },
    geometry: {
      wavelength: 0.2360571,
      incidenceAngleDeg: 34,
      headingDeg: -167.5,
      passDirection: 'descending',
      lookDirection: 'right',
    },
    numberOfLooks: 119,
    footprintPolygon: poly,
    center: { lat: ev.lat, lon: ev.lon },
  };

  // Expose the event + granules via attached fields (typed loosely; the API
  // layer reads them explicitly).
  const extended = ds as ScienceDataset & {
    event?: typeof evLite;
    granules?: PanamaGranuleRecord[];
    browseFiles?: string[];
    granuleSelection?: typeof selectionCriteria;
  };
  extended.event = evLite;
  extended.granules = granules;
  extended.browseFiles = browseFiles;
  extended.granuleSelection = selectionCriteria;
  return { ds };
}

function parsePolygonLocal(polygon: string): [number, number][] {
  const nums = polygon.trim().split(/\s+/).map(Number);
  const poly: [number, number][] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) poly.push([nums[i + 1], nums[i]]);
  return poly;
}

function pointInPolygon(lon: number, lat: number, poly: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function listBrowseFiles(): string[] {
  try {
    return fs
      .readdirSync(_testRoots.browse)
      .filter((f) => f.endsWith('_LATLON.png'))
      .map((f) => path.join(_testRoots.browse, f));
  } catch {
    return [];
  }
}

function probePanamaEvidence(): DatasetAvailability {
  const dir = path.join(_testRoots.derived, 'panama-2026');
  const required = ['granules.json', 'usgs_event.json'];
  const missing = required.filter((f) => !fs.existsSync(path.join(dir, f)));
  if (missing.length === required.length && !fs.existsSync(dir)) {
    return {
      state: 'missing',
      missingFiles: missing,
      invalidFiles: [],
      explanation:
        'The cached Panama evidence records are absent. These small JSON files are committed to ' +
        'the repository — if you see this, the checkout is incomplete; restore data/derived/panama-2026/.',
    };
  }
  if (missing.length > 0) {
    return {
      state: 'incomplete',
      missingFiles: missing,
      invalidFiles: [],
      explanation: `The Panama evidence cache is incomplete (missing ${missing.join(', ')}).`,
    };
  }
  // Both present: try to parse; malformed JSON -> invalid.
  for (const f of required) {
    try {
      JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8'));
    } catch (err) {
      return {
        state: 'invalid',
        missingFiles: [],
        invalidFiles: [{ file: f, reason: `unparseable: ${(err as Error).message}` }],
        explanation: `The cached record ${f} is malformed; re-generate it from the live CMR/USGS queries (docs/data-sources.md).`,
      };
    }
  }
  return available();
}

// ---------------------------------------------------------------------------
// Registry with lazy caching.

const cache = new Map<string, ScienceDataset>();

function synthetic(name: 'strikeslip' | 'thrust' | 'null'): ScienceDataset {
  if (name === 'strikeslip') return syntheticStrikeSlipFixture();
  if (name === 'thrust') return syntheticThrustFixture();
  return syntheticNullFixture();
}

/**
 * Availability of one configured dataset id (never throws; unknown ids return
 * a missing state so callers can 404 cleanly).
 */
export function getDatasetAvailability(id: string): DatasetAvailability {
  const derived = DERIVED_REGISTRY.find((e) => e.id === id);
  if (derived) return probeDerivedDataset(derived);
  if (id === 'evidence-panama-2026') return probePanamaEvidence();
  if (id === STACK_ID) return available(); // in-process deterministic fixture
  if (id.startsWith('synthetic-')) return available(); // in-process, deterministic
  return {
    state: 'missing',
    missingFiles: [],
    invalidFiles: [],
    explanation: `Unknown dataset id: ${id}`,
  };
}

/** Load a dataset. Returns undefined ONLY for unknown ids. */
export function getDataset(id: string): ScienceDataset | undefined {
  // Re-probe availability even on cache hits: local files can appear or
  // disappear between calls (and between tests), and a stale cached dataset
  // must never be served as if its data still existed.
  const availability = getDatasetAvailability(id);
  if (availability.state !== 'available') {
    cache.delete(id);
    return undefined;
  }
  if (cache.has(id)) return cache.get(id);

  let ds: ScienceDataset | undefined;
  if (id === 'real-nisar-mojave-2026') {
    const entry = DERIVED_REGISTRY.find((e) => e.id === id)!;
    ds = loadDerivedDataset(path.join(_testRoots.derived, entry.dir), {
      sourceUrl: entry.provenanceTemplate.sourceUrl,
      accessNotes: entry.provenanceTemplate.accessNotes,
      provider: entry.provenanceTemplate.provider,
      productType: entry.provenanceTemplate.productType,
      suggestedParams: entry.suggestedParams,
    });
  } else if (id === 'real-nisar-la-2008') {
    const entry = DERIVED_REGISTRY.find((e) => e.id === id)!;
    ds = loadDerivedDataset(path.join(_testRoots.derived, entry.dir), {
      sourceUrl: entry.provenanceTemplate.sourceUrl,
      accessNotes: entry.provenanceTemplate.accessNotes,
    });
  } else if (id === 'evidence-panama-2026') {
    ds = loadPanamaEvidenceDataset().ds;
  } else if (id.startsWith('synthetic-')) {
    const kind = id.replace('synthetic-', '') as 'strikeslip' | 'thrust' | 'null';
    if (kind === 'strikeslip' || kind === 'thrust' || kind === 'null') {
      ds = synthetic(kind);
    }
  }
  if (ds) cache.set(id, ds);
  return ds;
}

export interface DatasetListEntry {
  id: string;
  slug: string;
  title: string;
  blurb: string;
  mode: 'quantitative' | 'evidence';
  dataClass: 'real' | 'synthetic' | 'derived';
  isSynthetic: boolean;
  sensor: string;
  referenceTime: string;
  secondaryTime: string;
  temporalBaselineDays: number;
  center: { lat: number; lon: number } | undefined;
  suggestedParams?: Partial<AnalysisParams>;
  /** Structured availability of the local data (never fabricated). */
  availability: DatasetAvailability;
}

const REGISTRY_ORDER = [
  'real-nisar-mojave-2026',
  'real-nisar-la-2008',
  'evidence-panama-2026',
] as const;

/**
 * List all configured datasets. This function NEVER throws: datasets whose
 * local files are absent are listed with their availability state and the
 * registry's fallback description, so a fresh clone gets a working registry
 * endpoint instead of a 500.
 */
export function listDatasets(): DatasetListEntry[] {
  return REGISTRY_ORDER.map((id) => {
    const availability = getDatasetAvailability(id);
    const ds = availability.state === 'available' ? getDataset(id) : undefined;

    // Prefer the loaded dataset's metadata; fall back to the static registry
    // description when the local data is absent.
    let title: string;
    let blurb: string;
    let dataClass: DatasetListEntry['dataClass'];
    let sensor: string;
    let referenceTime: string;
    let secondaryTime: string;
    let temporalBaselineDays: number;

    if (ds) {
      title = ds.title;
      blurb = ds.blurb;
      dataClass = ds.provenance.dataClass;
      sensor = ds.provenance.platform;
      referenceTime = ds.provenance.referenceTime;
      secondaryTime = ds.provenance.secondaryTime;
      temporalBaselineDays = ds.provenance.temporalBaselineDays;
    } else {
      const derivedEntry = DERIVED_REGISTRY.find((e) => e.id === id);
      if (derivedEntry) {
        title = derivedEntry.fallbackTitle;
        blurb = derivedEntry.fallbackBlurb;
        dataClass = 'real';
        sensor = derivedEntry.provenanceTemplate.provider;
        referenceTime = '';
        secondaryTime = '';
        temporalBaselineDays = 0;
      } else if (id === 'evidence-panama-2026') {
        title = 'Panama M7.7 earthquake — real NISAR evidence (October 2026)';
        blurb =
          'A M7.7 earthquake struck Panama on 9 October 2026, between the acquisitions of real ' +
          'NISAR interferometric pairs. Requires the cached CMR/USGS evidence records.';
        dataClass = 'real';
        sensor = 'NASA CMR / ASF DAAC / USGS';
        referenceTime = '';
        secondaryTime = '';
        temporalBaselineDays = 12;
      } else {
        // Unreachable for listed ids (the registry lists only real datasets);
        // kept as a defensive fallback so listing never throws.
        title = id;
        blurb = '';
        dataClass = 'real';
        sensor = '';
        referenceTime = '';
        secondaryTime = '';
        temporalBaselineDays = 0;
      }
    }

    return {
      id,
      slug: ds?.slug ?? id,
      title,
      blurb,
      mode: ds?.mode ?? (id === 'evidence-panama-2026' ? 'evidence' : 'quantitative'),
      dataClass,
      isSynthetic: !!ds?.isSynthetic,
      sensor,
      referenceTime,
      secondaryTime,
      temporalBaselineDays,
      center: ds?.center,
      suggestedParams:
        ds?.suggestedParams ??
        DERIVED_REGISTRY.find((e) => e.id === id)?.suggestedParams,
      availability,
    };
  });
}

/** Evidence-mode extras (Panama): event, granules, browse files, selection. */
export function getEvidenceExtras(id: string): {
  event?: unknown;
  granules?: unknown;
  browseFiles?: string[];
  granuleSelection?: unknown;
} {
  const ds = getDataset(id) as
    | (ScienceDataset & {
        event?: unknown;
        granules?: unknown;
        browseFiles?: string[];
        granuleSelection?: unknown;
      })
    | undefined;
  if (!ds) return {};
  return {
    event: ds.event,
    granules: ds.granules,
    browseFiles: ds.browseFiles,
    granuleSelection: ds.granuleSelection,
  };
}

/** Registry of derived-dataset definitions (used by the manifest tooling). */
export function derivedRegistryInfo(): Array<{
  id: string;
  dir: string;
  requiredFiles: string[];
  sourceUrl: string;
  accessNotes: string;
}> {
  return DERIVED_REGISTRY.map((e) => ({
    id: e.id,
    dir: e.dir,
    requiredFiles: e.requiredFiles,
    sourceUrl: e.provenanceTemplate.sourceUrl,
    accessNotes: e.provenanceTemplate.accessNotes,
  }));
}

/**
 * Stack dataset metadata (the SBAS time-series fixture): descriptive info
 * for the detail endpoint without running the pipeline.
 */
export function getStackDatasetInfo(): {
  id: string;
  title: string;
  blurb: string;
  epochs: string[];
  ifgCount: number;
  event: import('@/lib/science/types').StackCatalogEvent;
  footprintPolygon: [number, number][];
  center: { lat: number; lon: number };
  warnings: string[];
} {
  const stack = stackDescriptor();
  return {
    id: STACK_ID,
    title: 'Central Valley SBAS time series — full system plan pipeline (synthetic stack)',
    blurb:
      '21 acquisitions / 24 interferograms (12-day repeat, 2026-07-27…08-10 instrument gap ' +
      'honoured) over a California Central Valley analog: two aquifer-compaction bowls, a ' +
      'tectonic shear gradient and one synthetic M6.2 blind-thrust event drive the complete ' +
      'plan pipeline end-to-end.',
    epochs: stack.epochs,
    ifgCount: stack.ifgCount,
    event: stack.event,
    footprintPolygon: stack.footprintPolygon,
    center: stack.center,
    warnings: [
      'SYNTHETIC VALIDATION FIXTURE: the stack is generated deterministically in-process from ' +
        'published-scale Central Valley deformation rates, a Coalinga-1983-analog event, and ' +
        'physically-modelled atmosphere (stratified + turbulent troposphere, ionospheric vTEC ' +
        'ramps). It exercises the complete pipeline against known truth; it is not an observation ' +
      'of the Earth.',
      'GNSS validation velocities are fixtures sampled from the same synthetic Earth truth ' +
        '(the live NGL endpoint was unreachable from this deployment).',
    ],
  };
}
