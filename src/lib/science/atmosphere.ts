/**
 * Atmospheric delay mitigation framework (plan §6 "Atmospheric Delay
 * Mitigation Framework", §12 preprocessing module).
 *
 * The interferometric phase decomposes as (plan §6)
 *
 *   φ_int = φ_disp + φ_topo + φ_orbit + φ_atm + φ_noise
 *   φ_atm = φ_strat(tropospheric, stratified) + φ_turb(tropospheric, turbulent)
 *         + φ_iono (ionospheric, dispersive)
 *
 * The NISAR L2 GUNW products supply geocoding-step corrections only; the
 * stored unwrapped phase retains the atmospheric terms, so the system plan
 * prescribes:
 *
 *   1. Tropospheric delay — raytraced integration of hydrostatic + wet
 *      refractivity from ERA5 reanalysis fields (RAiDER). The ERA5 CDS API
 *      requires credentials this deployment does not hold, so the stack
 *      pipeline uses the documented fallback: the phase–elevation correlation
 *      method (Bekaert et al. 2015 GACOS-style iterative estimate), which
 *      estimates the stratified term  φ_strat ≈ g·(h − h̄)  directly from the
 *      interferogram itself with outlier trimming, and quantifies the
 *      turbulent remainder as a residual budget term.
 *
 *   2. Ionospheric delay — split-spectrum processing isolates the dispersive
 *      ionospheric phase in the L2 products (supplied as a screen that is NOT
 *      applied to the stored phase). At stack level the dominant ionospheric
 *      signature over one frame is a long-wavelength ramp (vTEC gradient);
 *      the pipeline estimates and removes a plane fitted over the stable
 *      reference region — the same region used for phase referencing — and
 *      reports the removed magnitude in the phase-budget ledger.
 *
 * Every correction here is applied with explicit before/after statistics in
 * the output, so the reader can see exactly what was removed and what
 * remained. Nothing is silently "fixed".
 */

import { madSigma, median } from './statistics';

export interface StratifiedCorrection {
  /** Estimated phase-per-elevation slope (m of LOS per metre of height). */
  slopeMPerM: number;
  /** RMS of the removed stratified term (m). */
  removedRmsM: number;
  /** Robust σ of the field before / after correction (m). */
  sigmaBeforeM: number;
  sigmaAfterM: number;
  /** Pixels used in the regression. */
  n: number;
  method: string;
}

/**
 * Estimate and REMOVE the stratified tropospheric term from one
 * interferogram (displacement in metres, DEM in metres, mask of valid
 * pixels). Iteratively reweighted least squares on d = g·h + c with MAD
 * outlier trimming (two passes), evaluated only where mask=1.
 *
 * Mutates `disp` (in-place removal); returns the ledger statistics.
 */
export function removeStratifiedTroposphere(
  disp: Float32Array,
  dem: Float32Array,
  mask: Uint8Array,
): StratifiedCorrection {
  const sigmaBefore = madSigma(masked(disp, mask));
  let g = 0;
  let intercept = 0;
  let nUsed = 0;
  let mad = Infinity;

  for (let pass = 0; pass < 2; pass++) {
    // Regress d on h over valid pixels (single pass = O(N) accumulators).
    let n = 0, sh = 0, sd = 0, shh = 0, shd = 0;
    for (let i = 0; i < disp.length; i++) {
      if (!mask[i]) continue;
      const h = dem[i];
      const d = disp[i];
      if (!Number.isFinite(h) || !Number.isFinite(d)) continue;
      if (pass === 1) {
        // Second pass: trim residuals > 2.5·MAD from the first-pass fit.
        const r = d - (g * h + intercept);
        if (Math.abs(r) > 2.5 * mad) continue;
      }
      n++;
      sh += h;
      sd += d;
      shh += h * h;
      shd += h * d;
    }
    nUsed = n;
    const den = n * shh - sh * sh;
    if (n >= 10 && Math.abs(den) > 1e-9) {
      g = (n * shd - sh * sd) / den;
      intercept = (sd - g * sh) / n;
    } else {
      break;
    }
    // MAD of current residuals for the next trim.
    const res: number[] = [];
    for (let i = 0; i < disp.length; i++) {
      if (!mask[i]) continue;
      const r = disp[i] - (g * dem[i] + intercept);
      if (Number.isFinite(r)) res.push(r);
    }
    mad = madSigma(res) || 1e-9;
  }

  // Remove g·(h − h̄) — centre on the mean elevation so the constant part is
  // absorbed by the phase referencing rather than a fake deformation offset.
  let hMean = 0;
  let hn = 0;
  for (let i = 0; i < disp.length; i++) {
    if (mask[i] && Number.isFinite(dem[i])) {
      hMean += dem[i];
      hn++;
    }
  }
  hMean = hn > 0 ? hMean / hn : 0;

  let removed2 = 0;
  let rn = 0;
  for (let i = 0; i < disp.length; i++) {
    if (!mask[i]) continue;
    const removed = g * (dem[i] - hMean);
    disp[i] -= removed;
    removed2 += removed * removed;
    rn++;
  }
  const sigmaAfter = madSigma(masked(disp, mask));

  return {
    slopeMPerM: g,
    removedRmsM: rn > 0 ? Math.sqrt(removed2 / rn) : 0,
    sigmaBeforeM: sigmaBefore,
    sigmaAfterM: sigmaAfter,
    n: nUsed,
    method:
      'Phase–elevation correlation (iteratively trimmed least squares, two passes, 2.5·MAD trim); ' +
      'ERA5/RAiDER raytracing requires CDS credentials not held by this deployment ' +
      '(plan §6 fallback, documented in the phase-budget ledger).',
  };
}

function masked(values: Float32Array, mask: Uint8Array): number[] {
  const out: number[] = [];
  for (let i = 0; i < values.length; i++) {
    if (mask[i] && Number.isFinite(values[i])) out.push(values[i]);
  }
  return out;
}

export interface RampCorrection {
  /** Planar coefficients a·x + b·y + c fitted over the reference region. */
  a: number;
  b: number;
  c: number;
  /** RMS of the removed ramp (m). */
  removedRmsM: number;
  /** Robust σ before / after (m). */
  sigmaBeforeM: number;
  sigmaAfterM: number;
  method: string;
}

/**
 * Estimate and REMOVE a planar long-wavelength ramp (ionospheric vTEC
 * gradient + residual orbital/orbit-attitude term) from one interferogram.
 * The plane is fitted ONLY over the stable reference region — the same
 * far-field pixels used for phase referencing — so it cannot absorb the
 * deformation signal inside the basin.
 *
 * Coordinates are pixel grid indices scaled to metres (x, y) for numerical
 * conditioning.
 */
export function removeLongWavelengthRamp(
  disp: Float32Array,
  mask: Uint8Array,
  isReference: Uint8Array,
  width: number,
  xSpacing: number,
  ySpacing: number,
): RampCorrection {
  const sigmaBefore = madSigma(masked(disp, mask));

  // Fit over reference pixels (fallback: all valid pixels).
  let useRef = false;
  for (let i = 0; i < isReference.length; i++) {
    if (isReference[i] && mask[i]) {
      useRef = true;
      break;
    }
  }
  const use = (i: number) => (useRef ? isReference[i] && mask[i] : mask[i]);

  let n = 0, sx = 0, sy = 0, sxx = 0, sxy = 0, syy = 0, sxz = 0, syz = 0, sz = 0;
  for (let i = 0; i < disp.length; i++) {
    if (!use(i)) continue;
    const x = ((i % width) * xSpacing) / 1000; // km for conditioning
    const y = ((Math.floor(i / width)) * Math.abs(ySpacing)) / 1000;
    const z = disp[i];
    if (!Number.isFinite(z)) continue;
    n++;
    sx += x; sy += y; sz += z;
    sxx += x * x; sxy += x * y; syy += y * y;
    sxz += x * z; syz += y * z;
  }
  let a = 0, b = 0, c = 0;
  if (n >= 20) {
    // 3×3 normal equations via Cramer's rule.
    const m = [
      [sxx, sxy, sx],
      [sxy, syy, sy],
      [sx, sy, n],
    ];
    const rhs = [sxz, syz, sz];
    const det = (mm: number[][]) =>
      mm[0][0] * (mm[1][1] * mm[2][2] - mm[1][2] * mm[2][1]) -
      mm[0][1] * (mm[1][0] * mm[2][2] - mm[1][2] * mm[2][0]) +
      mm[0][2] * (mm[1][0] * mm[2][1] - mm[1][1] * mm[2][0]);
    const D = det(m);
    if (Math.abs(D) > 1e-12) {
      const rep = (col: number) => {
        const mm = m.map((row) => row.slice());
        for (let r = 0; r < 3; r++) mm[r][col] = rhs[r];
        return det(mm);
      };
      a = rep(0) / D;
      b = rep(1) / D;
      c = rep(2) / D;
    }
  }

  let removed2 = 0;
  let rn = 0;
  for (let i = 0; i < disp.length; i++) {
    if (!mask[i]) continue;
    const x = ((i % width) * xSpacing) / 1000;
    const y = ((Math.floor(i / width)) * Math.abs(ySpacing)) / 1000;
    const removed = a * x + b * y + c;
    disp[i] -= removed;
    removed2 += removed * removed;
    rn++;
  }
  const sigmaAfter = madSigma(masked(disp, mask));

  return {
    a, b, c,
    removedRmsM: rn > 0 ? Math.sqrt(removed2 / rn) : 0,
    sigmaBeforeM: sigmaBefore,
    sigmaAfterM: sigmaAfter,
    method:
      'Planar ramp fitted over the stable reference region (the split-spectrum ionospheric screen ' +
      'is supplied but not applied by the product; at frame scale the residual ionosphere dominates ' +
      'the long-wavelength error budget — plan §6). Fitting only over the reference region prevents ' +
      'the ramp from absorbing real deformation.',
  };
}

/**
 * Fractal (power-law) turbulent-troposphere simulator for the synthetic
 * validation stack: spectrally-shaped 1/f^β noise with β = 8/3 (Kolmogorov
 * 3-D turbulence integrated along the ray), generated in the Fourier domain
 * with a deterministic seed. Used ONLY to synthesize the exercise fixture;
 * the estimator side never assumes this exact field.
 *
 * Implementation: standard radix-2 inverse FFT on a power-of-two padded
 * grid (row–column separation), then crop to (width, height) and normalize
 * to the requested RMS.
 */
export function turbulentField(
  width: number,
  height: number,
  rmsM: number,
  correlationKm: number,
  pixelKm: number,
  seed: number,
): Float32Array {
  // Deterministic RNG (mulberry32).
  let s = seed >>> 0;
  const rand = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const W = 1 << Math.ceil(Math.log2(Math.max(2, width)));
  const H = 1 << Math.ceil(Math.log2(Math.max(2, height)));

  // von Kármán spectrum on the padded frequency grid (cycles/km).
  const spec = new Float64Array(W * H);
  const k0 = 1 / Math.max(correlationKm, 1e-6);
  for (let ky = 0; ky < H; ky++) {
    const fky = (ky <= H / 2 ? ky : ky - H) / (H * pixelKm);
    for (let kx = 0; kx < W; kx++) {
      const fkx = (kx <= W / 2 ? kx : kx - W) / (W * pixelKm);
      const k = Math.hypot(fkx, fky);
      const denom = 1 + (k / k0) ** 2;
      spec[ky * W + kx] = 1 / Math.pow(denom, (8 / 3 + 1) / 2);
    }
  }

  // Complex spectrum with random phases (Hermitian for a real field).
  const re = new Float64Array(W * H);
  const im = new Float64Array(W * H);
  for (let ky = 0; ky < H; ky++) {
    for (let kx = 0; kx < W; kx++) {
      const kMirrorX = kx === 0 ? 0 : W - kx;
      const kMirrorY = ky === 0 ? 0 : H - ky;
      const a = ky * W + kx;
      const b = kMirrorY * W + kMirrorX;
      if (a >= b) continue; // fill only the independent half
      const phase = rand() * 2 * Math.PI;
      const amp = (a === 0 || (kx === W / 2 && ky === H / 2)) ? 0 : spec[a];
      re[a] = amp * Math.cos(phase);
      im[a] = amp * Math.sin(phase);
      re[b] = re[a];
      im[b] = -im[a];
    }
  }

  // Inverse FFT (radix-2, in-place per row then per column).
  ifft2d(re, im, W, H);

  // Crop + normalize to the requested RMS.
  const out = new Float32Array(width * height);
  let m = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      out[y * width + x] = re[y * W + x];
      m += re[y * W + x] * re[y * W + x];
    }
  }
  const cur = Math.sqrt(m / (width * height)) || 1;
  const scale = rmsM / cur;
  for (let i = 0; i < out.length; i++) out[i] *= scale;
  return out;
}

/** In-place radix-2 Cooley–Tukey FFT of one complex row/buffer (sign = −1). */
function fft1d(re: Float64Array, im: Float64Array, n: number, stride: number, inverse: boolean): void {
  // Bit-reversal permutation.
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const ti = i * stride;
      const tj = j * stride;
      [re[ti], re[tj]] = [re[tj], re[ti]];
      [im[ti], im[tj]] = [im[tj], im[ti]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inverse ? 2 : -2) * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = (i + k) * stride;
        const b = (i + k + len / 2) * stride;
        const ur = re[a];
        const ui = im[a];
        const vr = re[b] * cr - im[b] * ci;
        const vi = re[b] * ci + im[b] * cr;
        re[a] = ur + vr;
        im[a] = ui + vi;
        re[b] = ur - vr;
        im[b] = ui - vi;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
  if (inverse) {
    for (let i = 0; i < n * stride; i += stride) {
      re[i] /= n;
      im[i] /= n;
    }
  }
}

/** Separable 2-D inverse FFT on W×H data laid out row-major (W = row pitch). */
function ifft2d(re: Float64Array, im: Float64Array, W: number, H: number): void {
  // Rows.
  for (let y = 0; y < H; y++) fft1d(re, im, W, 1, true);
  // Columns (stride = W).
  for (let x = 0; x < W; x++) fft1d(re, im, H, W, true);
}

/**
 * Ionospheric screen for the synthetic stack: a smooth, slowly varying
 * (epoch-to-epoch) long-wavelength ramp whose difference between two epochs
 * enters the interferogram — modelling vTEC gradients that the unapplied
 * split-spectrum screen would have removed.
 */
export function ionoRampField(
  width: number,
  height: number,
  epochIndex: number,
  seed: number,
  rmsM: number,
  pixelKm: number,
): Float32Array {
  let s = (seed + epochIndex * 2654435761) >>> 0;
  const rand = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  // One gradient direction per "ionospheric weather regime" (regime changes
  // slowly: 1 new draw every 4 epochs).
  const regime = Math.floor(epochIndex / 4);
  let s2 = (seed + regime * 40503) >>> 0;
  const rand2 = () => {
    s2 = (s2 + 0x6d2b79f5) >>> 0;
    let t = s2;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const theta = rand2() * 2 * Math.PI;
  const gradPerKm = (rand() - 0.5) * 2; // direction-stable magnitude per regime
  const gx = Math.cos(theta) * gradPerKm;
  const gy = Math.sin(theta) * gradPerKm;

  const out = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      out[y * width + x] = (gx * x + gy * y) * pixelKm;
    }
  }
  // Normalize RMS.
  let m = 0;
  for (let i = 0; i < out.length; i++) m += out[i] * out[i];
  const cur = Math.sqrt(m / out.length) || 1;
  const scale = rmsM / cur;
  for (let i = 0; i < out.length; i++) out[i] *= scale;
  return out;
}

/** Median of a Float32 subarray helper (kept local; statistics exports median for number[]). */
export function medianOf(values: ArrayLike<number>): number {
  const arr: number[] = [];
  for (let i = 0; i < values.length; i++) if (Number.isFinite(values[i])) arr.push(values[i]);
  return median(arr);
}
