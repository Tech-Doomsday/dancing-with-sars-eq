# Worklog — MOTUS: Earth-Change Intelligence System (NASA Space Apps 2026, "Dancing with the SARs")

Shared worklog for all agents. Append sections below with `---` separators per the template.

---
Task ID: 0
Agent: lead-architect
Task: Inspect repository, verify official challenge requirements, research data availability, design system architecture

Work Log:
- Inspected repository: bare Next.js 16 + Tailwind 4 + shadcn/ui scaffold (default page.tsx, hello-world /api, Prisma configured with SQLite at db/custom.db). No scientific code exists. Conventions to preserve: src/app structure, @/ alias, shadcn/ui components in src/components/ui, prisma schema location.
- Read uploaded PDF (/home/z/my-project/upload/): generic "interpreting vague research requests" document — NOT challenge-relevant. Ignored for science.
- Official challenge page https://www.spaceappschallenge.org/2026/challenges/dancing-with-the-sars/ is Cloudflare-blocked from this environment (documented as limitation; interpretation based on user brief).
- Current date: 2026-10-20 (verified via CMR response timestamps).
- Verified LIVE network access (all tested with curl):
  - NASA CMR search API (cmr.earthdata.nasa.gov): OPEN, no auth — 200 OK
  - USGS FDSN earthquake API (earthquake.usgs.gov): OPEN — v2.8.1
  - nisar.asf.earthdatacloud.nasa.gov (ASF cloudfront): browse PNGs OPEN (anonymous 200); .h5 science files redirect to Earthdata Login (302 → urs.earthdata.nasa.gov) — auth-gated
  - OSM/CARTO tiles reachable
- KEY DISCOVERY — real NISAR data is publicly indexed in NASA CMR (provider ASF):
  - NISAR_L2_GUNW_PROVISIONAL_V1: 90,974 granules (unwrapped geocoded interferograms), temporal span 2025-10-29 → 2026-10-18 (12-day pairs), ~1-2.3 GB per granule
  - Also indexed: NISAR_L2_GUNW_BETA_V1 (10,217), GSLC, GCOV, GOFF, RSLC, L3_SME2
- KEY DISCOVERY — 2026-10-09 M7.7 Panama earthquake (USGS us6000u18k, 7.5868°N -80.769°E, 12.6 km depth, 17:56 UTC): 14 real NISAR GUNW granules whose acquisition pairs bracket the event (verified via CMR spatial+temporal query). Frame 031_141_D_085 (2026-09-27→2026-10-09, second pass ~6h after mainshock) footprint polygon CONTAINS the epicenter.
- Downloaded real NISAR GUNW browse PNGs (official SDS renderings, open access) for 3 Panama-spanning granules → /home/z/my-project/data/nisar-browse/
- Downloaded official NISAR sample GUNW product (264 MB HDF5, openly accessible):
  /home/z/my-project/data/nisar-sample/NISAR_L2_PR_GUNW_001_030_A_019_002_2000_SH_20081012T060911...h5
  - REAL ALOS PALSAR L-band data over Los Angeles region, processed through the NISAR SDS v0.24.0 (2025-01-29), reference 2008-10-12, secondary 2008-11-27, 46-day baseline, frame 019 track 030 ascending, EPSG:32611, 80 m posting, 1555×1136 grid
  - Contains: unwrappedPhase (rad), coherenceMagnitude, connectedComponents (values 0,1,65535), ionospherePhaseScreen, wrappedInterferogram (complex), pixelOffsets, full orbit + radarGrid metadata (incidenceAngle 19.3–28.9°, LOS unit vectors, perp baseline -311 to -333 m)
  - centerFrequency 1269999750.06 Hz → λ = 0.2360571 m; looks 17 az × 7 rg = 119
  - All corrections documented as applied upstream: topographic + ellipsoidal flattening, ionospheric (range+azimuth), hydrostatic + wet tropospheric
  - Product DOI: 10.5067/NIL2GUNW-B1
  - QA summary CSV confirms NaN fraction 40.8% (mask/layover/incoherent)
- Downloaded official NISAR documents (open): L2 GUNW Product Specification (D-102272 RevE, Nov 2024) and L1/L2 ATBD (D-95677 RevA, Nov 2023) → data/nisar-sample/*.pdf, extracted text at *.txt
- SIGN CONVENTION VERIFIED from ATBD §5.7 (D-95677, p.52): interferogram = reference × conj(secondary), flattened via I×exp(−j(4π/λ)δr); phase decomposition Δφ = (4π/λ)(Δr_d + Δr_g + Δr_t + Δr_i + Δr_n). Under this convention (S = exp(−j4πR/λ)): φ = (4π/λ)·ΔR with ΔR = R_secondary − R_reference → LOS displacement d = λφ/(4π), POSITIVE = motion AWAY from the radar. This differs from the common d=−λφ/(4π) statement used when the conjugation order is reversed; documented explicitly in code + docs.
- Okada85 validation reference: fetched dc3d.py (github.com/satoshi-pes/dc3d.py), a faithful Python port of Okada's official DC3D Fortran (1991-93). Saved to /tmp/dc3d.py; will be vendored to tools/ for benchmarks. Also downloaded full product-spec and ATBD PDFs.
- Sandbox resources: 4.1 GB RAM (2.9 available), 7.9 GB disk free, Python 3.12 + h5py 3.15.1 available, bun available.

Stage Summary:
- Repository is a bare scaffold; nothing scientific to preserve.
- NISAR L2 GUNW data is real, public (metadata+browse open; H5 needs free Earthdata Login), and includes pairs bracketing a major 2026 M7.7 earthquake. 
- Architecture locked (see Task 1): Next.js single-page app + TS scientific pipeline (stages A–E) + derived-product data layer (Python h5py extractor for the real sample H5) + live CMR/USGS integrations + Okada85 synthetic validation fixtures generated in TS with dc3d-benchmarked math.
- Primary capability: LOS displacement measurement with uncertainty + change detection + transparent multi-hypothesis attribution. Complementary: live NISAR data-availability intelligence (CMR) cross-referenced with USGS seismicity.
- Product name: MOTUS (Latin: motion). UI: minimal warm-light scientific aesthetic, map-centric, no blue/indigo theme, sticky footer.

---
Task ID: 1
Agent: lead-architect
Task: Scientific core TypeScript modules

Work Log:
- Created src/lib/science/: types.ts, constants.ts, phase.ts, los-projection.ts, utm.ts, okada.ts
- types.ts: ScienceDataset, AnalysisParams, AnalysisResult, AttributionOutput, TransportGrid shared types
- phase.ts: phase↔displacement with NISAR SDS convention (d = λφ/(4π), + = away from radar), verified from ATBD D-95677 §5.7 (interferogram = reference × conj(secondary), flattening exp(−j4πδr/λ))
- los-projection.ts: LOS ENU unit vectors; VERIFIED against NISAR sample product radarGrid vectors (product stores satellite→ground = negative of ground→satellite; sample: losUnitVectorX=−0.4005, losUnitVectorY=−0.0837, incidence 24.17°, ascending — matches reconstruction to <0.01)
- okada.ts: full port of DC3D surface-displacement algorithm (dccon0/dccon2/ua/ub + corner loop). Slip-sense conventions determined EMPIRICALLY against dc3d.py: U1+ = sinistral, U2+ = normal-sense, U3+ = opening → rake mapping U1=slip·cos(rake), U2=−slip·sin(rake)
- CROSS-VALIDATION: TS port vs dc3d.py over 24 case×slip-mode combinations (varied dip 10–90°, depth, geometry incl. vertical + shallow-dipping faults): worst relative difference = 0.0 (agreement to 8 significant digits, 72 scalar comparisons). Benchmark cases captured for permanent test suite.
- Vendored reference: tools/dc3d_reference.py (Okada DC3D Python port, github.com/satoshi-pes/dc3d.py) for benchmark generation
- utm.ts: Snyder (1987) USGS PP1395 ch.8 transverse Mercator series, forward+inverse, EPSG 326xx/327xx

Stage Summary:
- Okada85 core is mathematically validated against the official DC3D algorithm lineage.
- Sign conventions for phase→displacement and LOS vectors are pinned to the NISAR product/documents, not assumed.
- Remaining: statistics/uncertainty/detection/attribution/validation/fixtures/pipeline modules.

---
Task ID: 2
Agent: lead-architect
Task: Data layer — Python extractor, derived products, external clients

Work Log:
- tools/extract_gunw.py: documented lossless extractor (HDF5 -> phase.f32/coherence.f32/components.u16 + meta.json with full provenance). Heading is derived from the product's own LOS unit vectors (sat2ground az -> ground2sat az -> heading = az-90 for right-look); the orbit-velocity approach was WRONG because velocities are ECEF, not ENU.
- Extracted the real NISAR sample product -> data/derived/nisar-la-2008/ (1136x1555, EPSG:32611, 119 looks, iono screen uncertainty median 4.31 rad)
- Saved Panama evidence records: data/derived/panama-2026/usgs_event.json (M7.7 us6000u18k with moment tensor strike 25.21/dip 74.77/rake -155.3, M0 3.77e20 N·m) + granules.json (3 CMR granule records incl. footprints + browse URLs)
- src/lib/data/: datasets.ts (registry: 5 datasets incl. 3 synthetic fixtures generated on demand), usgs.ts (FDSN client with moment-tensor parsing, 15-min TTL cache, 35s timeout + retry after observing 15-25s latencies and intermittent 502s), cmr.ts (CMR search client + bracketsEvent), references.ts (15-entry scientific registry)
- CRITICAL FINDING: NISAR product ionospherePhaseScreenUncertainty median ≈ 4.3 rad (~81 mm) — spatially correlated systematic. Pipeline treats it as a DETECTION FLOOR (not per-pixel noise); summary.systematicIonoFloorM + narrative expose it honestly.

Stage Summary:
- All data assets in place: real LA sample (quantitative), Panama evidence (metadata+browse+MT), 3 synthetic fixtures, live CMR/USGS clients.

---
Task ID: 3
Agent: lead-architect
Task: API routes + Prisma schema

Work Log:
- prisma/schema.prisma: AnalysisRun + Reference models (replaced unused User/Post scaffold), db:push OK
- API routes: /api (health/capabilities), /api/datasets, /api/datasets/[id] (provenance + evidence extras), /api/analyses POST (quantitative pipeline with live USGS cross-match; evidence mode with static event + live sequence + Okada prediction transport grid + honest narratives), /api/analyses/[id], /api/external/cmr (live, bracketsEvent flags), /api/external/usgs (live), /api/external/browse (path-traversal-guarded PNG serving), /api/references (DB mirror + registry)
- In-memory deterministic result cache keyed datasetId+params; DB persists every run for audit
- Smoke-tested ALL endpoints via curl: health OK, datasets OK (5), references OK (15), POST synthetic OK (runId, 1371.5 km² detected, validation MAE 2.59 mm), POST Panama OK (prediction grid 400x400, granules 3, MT parsed); /api/external/usgs OK after timeout fix (24s query, 60 events)

Stage Summary:
- Full backend live on port 3000. USGS latency handled with retry+cache; honest degradation messages verified.

---
Task ID: 4
Agent: lead-architect
Task: Automated validation tests

Work Log:
- tests/science/okada.test.ts: 24-case DC3D benchmark suite (worst rel diff < 1e-8), buried-fault 2D analytic calibration, slip-sense trace-jump tests (U2+ normal: hanging wall drops; U1+ sinistral; U3+ opening), far-field decay, moment/area scaling
- tests/science/core.test.ts: phase conventions (fringe=λ/2, round trips, wrap), LOS vectors (matches NISAR product vector < 0.02), coherence σ (known values, monotonicity, quadrature), robust statistics (median/MAD/planar fit/Pearson)
- tests/science/pipeline.test.ts: UTM round trips + sample-grid corner check vs footprint, Stage A validation rejections, null fixture false-alarm control (0 km² detected), strikeslip recovery (MAE < 10 mm asserted, actual 2.59 mm), real LA sample honesty (iono floor > 50 mm reported), threshold-rejection error, fixture determinism
- RESULT: 42 tests pass, 0 fail (234 expect calls, ~1.1 s). Lint clean.

Stage Summary:
- Science core fully test-verified. Okada port: exact agreement with the official DC3D algorithm lineage.

---
Task ID: 4b (debugging interlude)
Agent: lead-architect
Task: Okada fault-placement bug found and fixed via analytic calibration

Work Log:
- Symptom: synthetic fixture truth showed unphysical 67-90 m peaks near the fault trace.
- Diagnosis chain: (1) TS port matched dc3d.py EXACTLY on all benchmarks, so the port was faithful; (2) calibrated against the 2D screw-dislocation analytic solution — surface-breaking config matched theory to <1%; (3) decisive geometry tests showed DC3D's aw convention: POSITIVE aw extends UP-DIP from the reference point, so a buried fault with top edge at DEPTH must use aw = [-W, 0]. The friendly wrapper had used [0, +W], placing the fault ABOVE the surface into the air.
- Fix: wrapper now passes aw = [-fault.width, 0]; docstrings updated with the convention and the calibration story.
- Re-verified: buried strike-slip matches the 2D analytic solution within 1-10% (finite-length explains residual); slip senses re-confirmed via trace-jump tests on a near-surface-breaking steep fault (uz jump -0.93 for U2+ => normal sense); fixtures now produce physical fields (strikeslip LOS peaks ±0.14 m); pipeline MAE vs truth 2.6 mm.

Stage Summary:
- The kind of bug that silently corrupts science output was caught by insisting on analytic calibration rather than implementation-to-implementation agreement alone. Both the fix and the calibration tests are now permanent.

---
Task ID: 5 & 6 — delegated
Agent: lead-architect
Task: Launch frontend (Task 5, full-stack-developer) and documentation (Task 6, general-purpose) agents in parallel

Work Log:
- Wrote SPEC-FRONTEND.md (complete UI specification: design system, API contract, Mercator-exact raster rendering algorithm, panel specs, methodology drawer content, quality rules)
- Wrote SPEC-DOCS.md (README + 8 docs/ files + .env.example with all content sources and verified facts)
- Both agents instructed to read this worklog first and append their entries (Task IDs 5 and 6).

---
Task ID: 5
Agent: lead-architect (subagents were stuck; executed directly)
Task: Frontend UI implementation

Work Log:
- Installed leaflet + react-leaflet@5. Built under src/components/app/: types.ts (API contract), decode.ts (b64→Float32 transport decoding), colormap.ts (warm diverging terracotta↔teal displacement scale, coherence, σ scales), raster-render.ts (Mercator-exact raster warping: per-canvas-pixel Mercator inversion → UTM via Snyder series → nearest-neighbour grid sample → imageOverlay), map-panel.tsx (Leaflet map, footprint polygons, earthquake markers with tooltips, layer switcher, opacity slider, hover readout with lat/lon/value, legend, custom zoom controls), results-panel.tsx (narrative sections, stats strips, expandable hypothesis rows with status badges, forward-model block, validation block, warnings, events), methodology.tsx (drawer with equations, conventions, validation summary, live reference registry), evidence-viewer.tsx (official browse gallery with thumbnails+zoom, granule table with spans-event badges, live CMR check, USGS sequence), ui-bits.tsx (badges, stats, formatters)
- page.tsx: header with live status pills, intro strip, dataset card selector (5 cards), 2-column workspace (map + side panel), advanced parameter controls (coherence threshold, detection floor, k, reference strategy, detrend), run button with elapsed timer + USGS note, evidence/quantitative result modes, sticky footer with honest attribution
- layout.tsx: MOTUS metadata; next.config.ts: allowedDevOrigins
- BUGS FOUND & FIXED during browser verification:
  1. Turbopack corrupted cache → 500 on / — fixed by clearing .next and restarting dev server
  2. CARTO basemap now serves "API KEY REQUIRED" watermarked tiles — switched to ESRI World_Topo (keyless, clean, minimal)
  3. DOUBLE-SWAP BUG in FitBounds: footprint [lat,lon] was swapped again → map flew to the Southern Ocean near Antarctica; caught by VLM screenshot analysis + tile-coordinate forensics (tile 4/14/7 = 66°S!). Fixed; polygon now renders (M10 91L…), zoom 8 over Panama
  4. Added earthquake marker on dataset selection for evidence mode (was analysis-only)
- VERIFIED IN BROWSER (agent-browser + VLM): page loads clean (no console errors); dataset selection; synthetic-strikeslip analysis (1372 km², 135.7mm peak, MAE 2.59mm validation block); layer switching displacement/coherence/uncertainty with correct legends; methodology drawer (equations, 15 references from live API); Panama evidence mode (browse gallery, 3 granules with SPANS EVENT badges, live CMR check: "92 granules catalogue this region · 9 acquisition pairs bracket the event" — live NASA query, prediction overlay with "model · not a measurement" label); LA real dataset (honest 81mm-floor negative result, ~20-30s with live USGS cross-match); mobile 390px (no horizontal overflow, cards scroll, footer pinned exactly at viewport bottom when scrolled); desktop 1440px full-page VLM assessment: "clean, professional... successfully rendering... accurately representing the InSAR interferogram data"
- lint: 0 errors 0 warnings

Stage Summary:
- Complete single-page scientific application, all interactions browser-verified. Design: warm off-white minimal Apple-scientific, no blue/indigo, sticky footer, responsive, accessible (aria labels, keyboard focus, reduced-motion via CSS defaults).

---
Task ID: 6
Agent: lead-architect (executed directly)
Task: Documentation set

Work Log:
- README.md: project identity, defensibility bullet list, quick start (bun install/db:push/dev, bun test), demonstration flow (Panama → LA → synthetic lab), repository map, docs pointers, scope statement
- docs/science.md: measurement problem; NISAR phase convention verified from JPL D-95677 §5.7/§5.11.1 (incl. the contrast with the opposite conjugation convention); LOS geometry + product-vector verification; referencing strategies + failure modes; uncertainty model with worked σ table (Rodríguez & Martín); the ionospheric systematic floor reasoning; detection rule; Okada implementation lineage + benchmarks + slip-sense conventions + aw-convention finding; scaling relations + failure modes; attribution rules; geodesy; explicit non-claims
- docs/data-sources.md: every dataset/service with verified facts and dates — CMR collections (90,974+10,217 granules), the analysed sample granule (full metadata table), Panama event + 14 bracketing granules + primary frame, USGS API behaviour (latencies, retries, cache), fixtures, tiles (incl. the CARTO watermark finding), provenance model, access policy
- docs/methodology.md: stages A–E as implemented (validation gates, masking, referencing, offset removal, detrend caveat, summary metrics, uncertainty composition, detection, attribution, narrative generation, transport downsampling), defaults table, tooling
- docs/validation.md: full test inventory (42 tests, 234 assertions, all enumerated with what each proves), measured end-to-end results (strikeslip MAE 2.59 mm / RMSE 3.18 / bias −2.04; thrust; null zero-false-alarm; LA honest negative), explicit NOT-validated list, reproducibility
- docs/architecture.md: ASCII data-flow diagram, modes, persistence, external-service handling, browser georeferencing design, measured performance table
- docs/limitations.md: 15 numbered limitations with severity + resolution paths
- docs/references.md: all 15 registry entries grouped, each with what it supports, policy preamble, verification date
- .env.example: DATABASE_URL + documented optional EARTHDATA_BEARER_TOKEN path

Stage Summary:
- Complete documentation set with verified facts only; numbers cross-checked against test output and product metadata; honest gaps stated.

---
Task ID: 7
Agent: lead-architect
Task: Integration, final verification, and completion

Work Log:
- Final bugs found & fixed during the completion pass:
  1. /api/external/browse returned 404 despite the file existing — root cause: an em-dash in the X-Source HTTP header is not a latin-1 ByteString ("character at index 25"); replaced with a plain hyphen. All 3 official browse images now serve (200, 0.5–1.6 MB PNGs).
  2. Evidence-mode analyses response lacked granule.localBrowseUrl (only /api/datasets/[id] added it) — browse gallery rendered empty; fixed by adding localBrowseUrl in the analyses route.
  3. Server in-memory result cache served pre-fix responses until restart (documented behaviour); dev server restarted.
  4. One further Turbopack cache corruption after restart — cleared .next, restarted; stable since.
- Final verification (all green):
  - bun test: 42 pass / 0 fail / 234 assertions
  - bun run lint: 0 errors, 0 warnings
  - GET / 200; all API endpoints verified (health, datasets x5, references x15, panama detail with 3 granules + M7.7 event, browse PNGs, path-traversal attempt correctly 400)
  - Browser E2E (agent-browser + VLM): dataset selection; synthetic-strikeslip analysis (1372 km², +135.7 mm peak, MAE 2.59 mm validation block shown); LA real analysis (honest 81 mm-floor negative); Panama evidence mode (official browse gallery loads 4/4 at 1407×1384, granule table with SPANS EVENT badges, live CMR "92 granules · 9 bracketing pairs", USGS moment tensor, prediction overlay with "model · not a measurement" label); layer switching displacement/coherence/uncertainty with correct legends; methodology drawer with equations + 15 live references; mobile 390px (no overflow, footer pinned); desktop full-page VLM assessments positive.
- Removed the internal working spec files (SPEC-FRONTEND.md, SPEC-DOCS.md) — superseded by the implementation and docs/.

Stage Summary:
- MOTUS is complete: 5 datasets (1 real quantitative, 1 real evidence, 3 synthetic), full stages A–E pipeline, live NASA CMR + USGS integration, Okada forward modelling, 42-test validation suite, complete documentation, and a browser-verified single-page interface.

---
Task ID: 8
Agent: lead-architect
Task: Ingest the user's authenticated real NISAR 2026 granule (Earthdata bearer token + ASF URLs), integrate it as the flagship quantitative dataset, and harden the pipeline/UI for what it revealed

Work Log:
- Stored the user's Earthdata bearer token in .env (git-ignored; .env.example updated). Wrote tools/fetch_nisar_granule.py implementing the verified ASF auth flow: Bearer token -> 303 -> ~3h presigned CloudFront/S3 URL -> fetch WITHOUT the auth header (S3 rejects dual auth). Observed: the token presigns exactly ONCE (later attempts 401 invalid_token); the presigned URL + asf-urs session cookie remain the working credentials. Documented in code + docs.
- Downloaded NISAR_L2_PR_GUNW_021_013_D_071_022_4000_SH_20260522T024038...20260603..._001.h5 (2,575,302,656 bytes) via tools/parallel_fetch.sh (12 HTTP-range parts, ~19 MB/s, 2m16s) after discovering the sandbox reaper kills background downloads and single streams throttle to ~2 MB/s.
- Inspected the product: operational NISAR_L2_GUNW_PROVISIONAL_V1, southern Sierra/Owens Valley/Death Valley/Mojave scene (track 13, frame 71, DESCENDING LEFT-looking), 12-day pair, 4401x4338 @ 80 m EPSG:32611, lambda=0.2420 m (1.239 GHz), incidence 41.05 deg, heading 198.5 deg (from product LOS vectors), 208 looks, SNAPHU, SDS 0.25.16, spec 1.5.0, DOI 10.5067/NIL2GUNW-P1, real NISAR L1 RSLC inputs (DHDH).
- SCIENCE FINDINGS (measured): the pair was acquired through a severely disturbed ionosphere - product ionosphere phase screens std ~36 rad, correction-uncertainty median 3.73 rad (~72 mm); coherence collapsed uniformly (median 0.08; 12.3% >= 0.1, 0.3% >= 0.2); cc=0 areas carry a finite ~5-rad noise phase field (invalid filler); the single valid unwrapping component (324,103 px, 99.7% exact-zero phase) is a stable surface with max |LOS| 48 mm. A real M4.06 earthquake (Johannesburg, CA, 2026-06-01 22:34 UTC, 7.6 km depth) occurred inside the frame between acquisitions.
- Extracted lossless derived layers to data/derived/nisar-mojave-2026/ via tools/extract_gunw.py (unchanged tool, 2.2 s).
- Registered as dataset 'real-nisar-mojave-2026' (FIRST in the registry) with operational-collection provenance and suggestedParams { coherenceThreshold: 0.1 } (global 0.5 default would reject the scene at Stage B). Implemented suggestedParams end-to-end: science types, datasets registry, analyses route parameter precedence (body > dataset > global), frontend slider initialization/reset + hint.
- CRITICAL BUGS FOUND BY THE REAL DATA AND FIXED:
  1. FALSE-POSITIVE DETECTION: without gating on unwrapping connected components, the cc=0 noise filler produced 5,923 km2 "ground motion" with referenceSigmaM=0 (51% of reference pixels shared exact 0.0). Fixed: Stage B mask now requires component >= 1 (0 and 65535 excluded) + explicit warning when >50% of coherence-passing pixels are excluded (86% here). Cross-tab proved cc=1 is the valid measurement (99.7% exact-zero phase) and cc=0 is filler.
  2. Degenerate MAD fallback: when >50% of reference pixels share one exact value (MAD=0), fall back to std with a warning.
  3. Narrative credibility rule: affected areas below max(1 km2, 4 pixels) are described as isolated stray pixels consistent with statistical noise (shared with the attribution layer's detected flag) - LA now correctly reads "Isolated pixels ~0.01 km2".
  4. USGS FDSN HTTP 400: the client sent an invalid 'boundingbox' joined parameter; replaced with the correct minlatitude/maxlatitude/minlongitude/maxlongitude (verified live: returns the M4.06). The live cross-match now works for every dataset.
  5. Forward-model scaling hazard: Math.max(...spread) over 19M-element arrays + full-grid Okada evaluation; replaced with a deterministic <=400k strided subgrid + loop-based peaks.
  6. Iono double-count removed (per-pixel quadrature term contradicted the documented floor-only design; comments and code now agree).
  7. RASTER ASPECT BUG (browser): canvas aspect mixed Mercator radians with longitude degrees (57x unit error -> every overlay squashed to 760x64). Fixed to radians/radians (Mojave overlay now 1024x1001) + maxCanvasPx 760->1024.
  8. Added a 'Coverage' map layer (flat tone where mask=1) - the honest visualization for scenes whose displacement is ~zero (near-white on the diverging scale) or whose valid mask is sparse.
- INFRASTRUCTURE FINDINGS: the sandbox reaper kills Bash-spawned background processes between tool calls - the dev server must be launched as an orphaned double-fork (( setsid cmd & )) which survives (ppid=1). The original dev server was OOM-killed during my parallel download; restarting repeatedly OOM'd until root-causing Tailwind 4's content scanner reading the 2.58 GB .h5 (data/ was not git-ignored) -> added /data/ and /tools/venv/ to .gitignore + @source not directives in globals.css; postcss then completes in seconds. Bounded the analysis result cache (10 entries, oldest-first eviction).
- VERIFICATION (all green): bun test 42/42 pass (234 assertions); bun run lint 0/0; Mojave analysis via API: 324,103 valid px, 0 km2 detected, iono floor 71.8 mm, honest-negative narrative, M4.06 matched live, attribution null=supported/coseismic=insufficient-evidence; LA (stray-pixel narrative + unchanged iono story), synthetic-strikeslip (1372 km2, 135.7 mm, MAE 2.59 mm - identical to before), Panama evidence mode (60 live events, SPANS EVENT badges, browse gallery) all re-verified. Browser E2E (agent-browser + VLM): page loads with 0 console errors, 6 dataset cards (Mojave first), full analysis flow, displacement/coherence/sigma/coverage layer switching with correct legends and 1024x1001 overlays, earthquake marker, methodology drawer, mobile 390px clean (fresh render; docScrollW=clientW=390), footer pinned exactly at viewport bottom on scroll, desktop 1440px clean.
- Docs updated: data-sources.md (new section 2 with the full granule table + measured findings + verified auth flow in section 9; sections renumbered), methodology.md (Stage B cc-gate + MAD fallback + suggested params; Stage E subgrid; narrative credibility rule), validation.md (Mojave measured results + the two caught-by-real-data defect stories), architecture.md (Mojave timings, memory discipline, coverage layer), README (Mojave as the lead demonstration), .env.example, tools/fetch_nisar_granule.py docstring.

Stage Summary:
- The application now analyses a REAL OPERATIONAL NISAR mission product end-to-end (the previous real quantitative dataset was a 2008 ALOS sample). The flagship honest result: a severely ionosphere-degraded 12-day pair over the Mojave yields NO deformation claim - 2% valid coverage, 48 mm max motion vs a 72 mm systematic floor - while a real in-frame M4.06 earthquake is correctly reported as insufficient evidence rather than a cause.
- The real data immediately exposed and led to fixes of one false-positive detection mechanism (phase filler over cc=0 areas), one silent statistical degeneracy (MAD=0), one narrative overclaim path (stray pixels), one live-query regression (USGS bbox), one scaling hazard (19M-element spreads), and one browser rendering defect (57x aspect squash) - each now documented and regression-checked.

---
Task ID: R1 (remediation baseline)
Agent: lead-architect
Task: Phase A of the full scientific/engineering remediation — inspect repository, run existing checks, record baseline

Work Log:
- Read every audited file: science core (phase, pipeline, attribution, okada, detection, uncertainty, validation, statistics, los-projection, utm, fixtures, types), data layer (datasets, usgs, cmr, references), all API routes, tools/extract_gunw.py, next.config.ts, package.json, prisma/schema.prisma, .gitignore, docs/science.md, docs/validation.md, page.tsx.
- Ran `bun test`: 42 pass / 0 fail / 234 assertions (exit 0).
- Ran `bun run lint`: 0 errors (exit 0).
- Ran `npx tsc --noEmit`: 11 errors — 4 in app source (analyses route granuleId typing, map-panel role prop, results-panel runId, pipeline.test disposition), 3 `bun:test` module errors in tests, 4 in sandbox vendor dirs (skills/, examples/) that tsconfig includes.
- Ran listDatasets() directly: **CRASH — ENOENT data/derived/nisar-mojave-2026/meta.json**. The Mojave dataset (added with the 2.58 GB granule last session) was never persisted (data/ gitignored, raw granule gone). /api/datasets currently returns 500; the app is broken in exactly the clean-clone failure mode the audit describes.
- Data inventory present now: derived/nisar-la-2008 (4 files, git-tracked), derived/panama-2026 (granules.json + usgs_event.json, git-tracked), nisar-browse (3 PNGs, git-tracked), nisar-sample (ALOS 2008 H5 264 MB + PDFs, git-tracked). Mojave derived dir ABSENT.
- Confirmed audit findings against code: (1) listDatasets uses getDataset(id)! and crashes on missing files; (2) forwardModelCheck + buildPredictionOnGrid anchor model offsets to the RASTER CENTER, not the event epicenter (misplaces model whenever epicenter != grid centre; synthetic fixtures pass only because their faults sit at the grid centre); (3) pipeline passes usgsEvents[0] with no ranking (FDSN default order is time-ascending, so [0] is the EARLIEST event, not the largest/most relevant); (4) attribution thresholds (30 mm atmospheric, amplitude ratio 0.3–3, r>0.25) are hardcoded, only partially documented in methodNote; (5) H5 'null supported' + H4 single-component 'not-supported' overclaim; (6) detection.ts has no masked-pixel count, no cluster statistics, no null-scene FP calibration; (7) Panama narrative claims deformation "very likely captured" — overclaim vs the mandated conservative language; granules[0] selected without criteria; (8) next.config.ts ignores TS build errors; (9) db:push uses --accept-data-loss; (10) .env* gitignore pattern would exclude .env.example (which does not exist); (11) extractor does no structural validation and never closes the HDF5 file; (12) LA meta.json correction flags read "True" for tropo/iono — docs must state residuals remain (the 81 mm iono floor IS that residual).
- Baseline accepted; findings checklist created in the task plan. Not fabricated: every number above was observed by executed commands.

Stage Summary:
- Baseline recorded. App currently broken (/api/datasets 500) due to unguarded dataset loading — confirms the audit's critical finding in the live environment. Proceeding to remediation in the mandated order: clean-clone handling first.

---
Task ID: R2 (full remediation)
Agent: lead-architect
Task: Execute the complete scientific/engineering remediation (all sections of the audit) in the existing repository

Work Log:
- PHASE A (baseline, recorded as R1 above): 42 tests/234 assertions passed; lint 0; tsc had 11 errors hidden by ignoreBuildErrors; /api/datasets was 500 (Mojave data absent, listDatasets crashed).
- §3 Clean-clone reproducibility: rewrote src/lib/data/datasets.ts around a static registry + structured availability ('available'|'missing'|'incomplete'|'invalid') with missing-file lists, byte-size validation vs meta.json grid, explanations naming the acquisition path, and a re-probing getDataset that evicts stale cache entries. /api/datasets lists without data; /api/datasets/[id] resolves known-but-absent ids to 200 with fallback metadata; POST /api/analyses refuses unavailable datasets with 409 + code 'dataset-unavailable'. UI: availability badges on cards, alert block with instructions, disabled run button, honest map empty-state. Panama granule selection now by explicit criteria (bracketing + epicentre containment) instead of granules[0]. New tests/data/registry.test.ts (clean/partial/corrupt scenarios). tools/generate_data_manifest.py + committed docs/data-manifest.md (SHA-256 for every consumed file); tools/prepare_data.sh (open-access fetch + checksum verify + guided extraction; credential-gated paths documented, never auto-fetched). .env.example created (placeholders only); .gitignore !.env.example fix.
- §4 GUNW phase semantics: fetched the OFFICIAL ASF guide (nisar-docs.asf.alaska.edu/gunw/) — CRITICAL FINDING: the ionospheric phase screen is "included in the product but not applied to the data layers", and tropospheric/SET corrections "are not removed from the interferometric data". Cross-verified against the sample product's embedded runConfigurationContents (ionosphere_phase_correction writes the screen; troposphere_delay writes LUTs) and measured the screen layers (variation σ 0.37–0.60 rad vs uncertainty median 4.31 rad). Rewrote phase.ts docstring, types.ts (structured ionoScreen{variationMad,variationStd,uncertaintyMedian}, ChangeSummary.correctionStatus + ionoFloorBasis), pipeline.ts Stage D: floor = max(unapplied-screen variation, screen-estimate uncertainty) — a correction-uncertainty alone would NOT represent the spatially varying contamination still in the data. All outputs/narratives now say "apparent relative LOS range change"; qualityNotes rewritten to distinguish geocoding-step flags from phase corrections. Extractor rewritten with full structural validation (required groups, spec-version gate, co-pol, shapes, coordinate/spacing checks, EPSG range, time ordering, screen-shape checks, context-managed HDF5, provenance-preserving) + 6 corruption modes tested by tools/test_extract_gunw.py (26 checks, synthetic fixtures from tools/make_synthetic_gunw_fixture.py, everything labelled SYNTHETIC). LA re-extracted losslessly (heading corrected 8.98°→−11.80° by the fixed derivation; phase/coherence bytes unchanged).
- §5 Forward-model coordinates: added latLonToUtmInZone + zoneFromEpsg to utm.ts; attribution.ts forward model now projects the EPICENTRE into the raster's own UTM zone and takes per-pixel offsets relative to IT (was: raster centre). Non-UTM grids disable the check with an explicit reason; missing mechanisms skip, never invent. Tests: bit-exact grid-shift invariance (max diff 0.0 on probe points), move-event tracking, near-epicentre peak, unit-consistency.
- §6 Event selection: new rankEventsForPair (window → distance → magnitude desc → proximity → mechanism; deterministic tie-break) returning primary/alternatives/criteria/excluded-reasons; pipeline uses it; AttributionOutput.eventSelection carries it to the API/UI.
- §7 Attribution honesty: heuristics collected in ATTRIBUTION_HEURISTICS (30mm/ factor-3 / r-0.25) with documented rationale, exposed in every result; statuses unchanged but language rewritten — "consistent…not causation", H5 relabelled "No change above the detection threshold" with "NOT that the ground did not move", H4 single-component no longer 'not-supported' and states "NOT proof of artefact absence". Atmospheric H3 explains the supplied-but-unapplied corrections.
- §8 Detection statistics: detection.ts adds maskedPixelCount/detectedPixelCount/thresholdMedianM, 4-neighbourhood cluster stats (≥4px), and runNullSceneScreen (deterministic seeded, box-filter correlated noise scaled by the scene σ map, exploratory labelling); pipeline runs 8 scenes at analysis-grid scale and reports summary.nullScreen. Tests cover bookkeeping, NaN handling, cluster counting, null-screen determinism + correlated-noise cluster behaviour + empty-mask refusal.
- §10 Engineering: removed typescript.ignoreBuildErrors; fixed all exposed errors (analyses-route Raster|error union, map-panel role prop, results-panel runId, test disposition typo); tsconfig now types:["bun-types"] + excludes examples/ skills/ vendor dirs. db:push no longer passes --accept-data-loss. New .github/workflows/ci.yml (install/lint/typecheck/offline tests/python extractor tests/production build; no credentials or untracked data needed). package.json adds typecheck + test scripts.
- §9 Validation claims: docs/validation.md rewritten as a claim-by-claim table (category, source, command, expected, observed, status, limitations) — measured numbers re-captured (strikeslip MAE 2.59mm unchanged; LA: 258,402 valid px, floor 81.0mm basis=uncertainty, median threshold 81mm, 0.013km² stray); Mojave figures marked NOT REPRODUCED (granule not retained) with the dataset honestly reporting 'missing'. docs/science.md §2.1 correction-status rewrite with the ASF quotes, §5.2 floor semantics, §5.4 detection-statistics status, §7.1 forward-model coordinate frame; methodology/limitations/README updated; data-manifest committed.
- Production build: initially failed (Turbopack: tools/venv/bin/python symlink pointed outside the filesystem root — a git-tracked generated artifact from the prior session); removed the generated venv (system python3 has h5py) and the build then SUCCEEDED with strict TS (exit 0, all routes compiled).
- Browser E2E (agent-browser): page loads with 0 console errors; 6 dataset cards with honest availability badges; Mojave flow shows disabled button + instructions alert; LA analysis renders apparent-LOS narrative, correction-status block, null-scene screen, new stats (masked/detected/clusters/threshold); synthetic run shows 1372 km², MAE 2.59mm validation block, exploratory heuristics in method note; Panama evidence mode live (USGS 'live' status), conservative "has not yet been established" narrative, browse gallery + SPANS EVENT badges; layer tabs switch (coherence overlay renders, 1 image layer); mobile 390px: fixed a 531px overflow (Leaflet attribution min-content + grid tracks → attribution-wrap CSS + minmax(0,1fr) tracks) — now docScrollW=clientW=390; footer follows the mandated flex/mt-auto pattern.
- Final battery: bun test 86/86 (485 assertions), lint 0/0, tsc --noEmit clean, python tools/test_extract_gunw.py 26/26, production build exit 0, dev server serving GET / 200.

Stage Summary:
- Every confirmed audit finding is fixed or explicitly documented as blocked (Mojave re-analysis: source granule not retained). The application now states from the authoritative source that its measurements are apparent relative LOS range change with uncorrected atmospheric/ionospheric contamination, quantifies that contamination per product, anchors its forward model at the projected epicentre (bit-exact tested), ranks earthquake candidates explicitly, separates detection bookkeeping from classification with an exploratory null-scene screen, and ships strict-TS CI + checksummed data manifest + offline-first tests. No commit or push performed (not authorized).

---
Task ID: final-pass-baseline
Agent: main (Z.ai Code)
Task: MOTUS final pass — baseline before UI simplification + science audit

Work Log:
- git status: clean tree on main @ e811972
- bun test: 86 pass / 0 fail, 485 assertions (exit 0)
- bun run typecheck: exit 0; bun run lint: exit 0
- dev server running on :3000 (dev.log clean, /api + /api/datasets 200)
- Datasets: mojave-2026=missing(credential-gated), panama-2026=evidence available, la-2008=real available, 3 synthetic available
- UI default selection bug: selects datasets[0] = the MISSING Mojave dataset
- Science audit spot-checks: phase.ts conventions documented vs ATBD/ASF guide; rankEventsForPair explicit; nullScreen labelled exploratory; okada epicentre-anchored (§5 tests pass)
- VERIFIED DEFECT: synthetic earthquake fixture reports "Earthquake (coseismic deformation): not-supported / No USGS catalog earthquake..." — misleading (cause is known by construction)

Stage Summary:
- Baseline green; begin PRIORITY 1 UI redesign (page.tsx, ui-bits, results-panel, evidence-viewer, map-panel), then attribution fix for synthetic fixtures.

---
Task ID: final-pass-complete
Agent: main (Z.ai Code)
Task: MOTUS final pass — UI simplification, science audit, verified fixes

Work Log:
- UI REWRITE (PRIORITY 1):
  - page.tsx: hero ("Explore how Earth's surface may have moved." + plain intro + "Start an analysis" CTA + 3-step map), numbered Step 1/2/3 sections, dataset cards sorted real-ready → evidence → demo → unavailable with plain ReadinessBadge (icon+text, never color alone), default selection = first real quantitative available dataset (was: the missing Mojave set), honest processing-stage list (real pipeline stages, no fake per-stage completion), Advanced settings + About this data collapsibles, "What MOTUS can and cannot tell you" scope note, mobile order (controls → map → result) via CSS grid placement, map sticky on desktop
  - results-panel.tsx: restructured to required order — What did we find? (OutcomeBanner: Possible change detected / No change detected above the threshold / Inconclusive, exact honest copy) → How certain are we? → What could explain it? (plain hypothesis badges) → What are the limitations? → Advanced results (collapsible technical evidence: full stats, null screen, correction status, validation, USGS events); new EvidenceResults for Panama with "Real earthquake, real radar data — measurement pending" banner
  - evidence-viewer.tsx: plain section titles (Official radar images of the area / Radar data pairs that cover the earthquake / Check NASA's data catalog now / What an earthquake model predicts), causation caution
  - map-panel.tsx: plain legends with color meaning + units ("brown = toward · green = away"), hover readout with direction label, moved rendering chip below zoom controls
  - ui-bits.tsx: WhatIsThis inline glossary, ReadinessBadge, plain DataClassBadge + HypothesisStatusBadge labels (technical term in title attr), EventRow moved here (breaks results↔evidence circular import), fmtKm2 small-value decimals (0.013 km² no longer shows "0 km²")
- SCIENCE FIX (verified defect): attribution.ts — synthetic earthquake fixture reported "Earthquake: not-supported / No USGS catalog earthquake" (self-contradiction; cause known by construction). Fix: construction-fact branch for ds.isSynthetic&&ds.truth with truth-peak scan (supported-by-construction for earthquake fixtures, not-supported-by-construction for null fixture); anthro/atmospheric hypotheses get fixture-honest evidence (no real-product GUNW language on synthetic data); methodNote explains demo mode; pipeline.ts reliability narrative for synthetic no longer cites "the product". +4 regression tests.
- DOCS: methodology test count 42→90; validation.md 86/485→90/498 + new validation row + attribution inventory note.
- CHECKS: bun test 90 pass/0 fail/498 assertions; tsc --noEmit clean; eslint clean; python3 tools/test_extract_gunw.py 26/26 pass; dev.log clean; agent-browser E2E verified (hero, card sort, LA real run → Inconclusive banner, demo run → Possible change detected + FITS THE EVIDENCE earthquake, Mojave → disabled button + guidance, Panama evidence mode + prediction overlay + MODEL PREDICTION — NOT A MEASUREMENT tag, layer switcher all 4 layers with interpretation text, What-does-this-mean expandable, methodology drawer, 390px no horizontal scroll, footer bottom).

Stage Summary:
- Working tree ready for review (NOT committed, per instruction). Production build not executed (sandbox forbids `bun run build`) — strict tsc is the substitute check. Mojave real-data reproduction + independent geodetic validation remain outstanding by nature of missing credentials/data.

---
Task ID: feature-pass (post final-pass)
Agent: main (Z.ai Code)
Task: Do-first feature pass — recorded flagship story, one-screen verdicts, histogram + profile charts, guided demo tour, exports, why-empty panel, pair finder, aliveness/animation, earthquake focus

Work Log:
- DATA SITUATION (attempted fix): tried to re-download the Mojave 2.58 GB granule — anonymous HEAD on the ASF URL still presigns, but the GET requires Earthdata Login and the bearer token did not survive the sandbox reset. Recovered instead: (a) the 3 recorded Mojave analysis runs from the local analysis-run database (latest 2026-10-20T08:51:33Z: 324,103 valid px, 2,074 km² measured, 71.8 mm iono floor, coherence median 0.138, 0 km² detected); (b) the real footprint polygon from live CMR (4-point polygon, verified); (c) the real M4.06 event record live from USGS (ci41478192, mw 4.06, 2026-06-01T22:34:01Z, 35.299/-117.8098, 7.64 km depth).
- RECORDED STORY: data/derived/nisar-mojave-2026/recorded_run.json (every figure traceable to the DB record, worklog measurements, or live catalogs); datasets.ts gained DatasetAvailability.recorded + getRecordedRun() with validation; /api/datasets/[id] serves recordedRun + real provenance/geometry/footprint when data absent; analyses POST still refuses (409) — honest; UI: "Recorded result" badge (icon+text), "View the recorded result" button, RecordedResults panel (recorded banner, verdict, stat grid, signal-vs-noise bar chart, recorded distribution strip, seismic timeline with the M4.06, why-empty, provenance block); map shows the real footprint + M4.06 marker with an honest no-measurement-layer note.
- VERDICT ENGINE: src/lib/science/verdict.ts — pure computeVerdict/computeRecordedVerdict producing the five-second headline ("No motion detectable. Ionosphere noise (72 mm) exceeds the signal (48 mm)." / "Possible change detected — up to X mm across Y km²." / "Inconclusive…"), with honesty contract unit-tested (never "no movement", never "caused by", floor comparison is the headline when it dominates). VerdictBanner renders it first in every result.
- CHARTS (src/components/app/charts.tsx, recharts + framer-motion): HistogramCard — client-side histogram of masked displacement with ionosphere-floor reference lines + interactive threshold explorer slider (live flagged-area recalculation); ProfileCard — profile line through the anomaly centroid along the principal axis with ±1σ dashed bounds and shaded noise floor; SignalVsNoiseCard — recorded-run bars; SeismicTimeline — animated acquisition-window band with real USGS events (size=magnitude, primary highlighted+labelled, in/out-of-window styling, links); WhyCantISeeAnything — plain-language explainer using the scene's own numbers (ionospheric disturbance / coherence loss / noise floor).
- EXPORTS (src/components/app/export.ts): minimal standards-compliant GeoTIFF writer (classic TIFF, little-endian, 15 tags, float32, ModelPixelScale/ModelTiepoint at outer corner, GeoKeyDirectory with ProjectedCSType=EPSG + linear units metres + WGS84, GDAL_NODATA=nan) — INDEPENDENTLY VERIFIED with a Python struct parser (tags, geokeys, tiepoint 399960/3800040, pixels incl. NaN all correct); CSV writer (UTM + lat/lon + values, capped sampling); PNG via the existing Mercator-exact renderer. Export chips in the map layer card; all client-side from the decoded grids (works for evidence prediction too, labelled).
- PAIR FINDER: src/lib/data/pairs.ts — CMR bbox search + granule-id parsing (granuleTimes/pairKeyOf: track+direction+acquisition-days grouping, frame variants merge) + ONE batched live USGS window query + metadata-only ranking (12-day baseline, coverage, recency, M≥5.5-in-window boost) with honest "promise score" labelling; POST /api/pairs route; PairFinder UI (8 preset places + custom lat/lon, ranked pair cards with reasons, earthquake context, ASF/browse links, copy granule ID). LIVE-VERIFIED: Mojave 83 granules → 12 pairs (3.5 s); Panama correctly surfaces the M7.7 + aftershock sequence.
- GUIDED TOUR (src/components/app/tour.tsx): 3 stories × 4-5 steps (~2 min) driving the REAL page (select/run/recorded actions executed via pending-action effect); StoryPicker dialog; TourCard fixed-bottom narration with progress dots, keyboard nav (arrows/Esc), tour-highlight ring animation; DemoScriptDialog with the full copyable demo-video script. Mojave story verified to auto-drive the recorded result; lab story auto-runs the synthetic analysis to "Possible change detected — up to 136 mm across 1,372 km²".
- PAGE REDESIGN (page.tsx): earthquake-focused hero ("Did the ground move? Check it with space radar.") + Start-an-analysis + Take-the-guided-tour CTAs + animated live-stats strip (count-up datasets, real-data count, live-catalogs pulse dot); section ids for tour targets; recorded-story wiring; export handlers; result entrance animations; PairFinder section after the scope note.
- TESTS: +13 (verdict engine incl. exact Mojave headline reproduction + honesty contract; pair grouping incl. frame-variant merge + different-revisit split + haversine sanity; GeoTIFF structure incl. II/42 magic, 15 tags, SAMPLEFORMAT=3 + size-mismatch rejection). Fixed two bugs the tests caught: 14-vs-15 tag count drift; pairKeyOf originally keyed by frame numbers (frame variants of the same orbit pair must merge).
- CHECKS: bun test 103/103 pass, 533 assertions; bun run typecheck clean; bun run lint clean; dev.log clean (only Prisma query logs); GET / 200.
- BROWSER E2E (agent-browser + VLM, desktop 1440 + mobile 390): hero renders with tour + live stats; LA analysis → "Inconclusive — only isolated pixels" verdict banner, histogram + profile charts (2 recharts surfaces), threshold explorer live recalculation (80 mm → 41.3 km²), why-empty panel, seismic timeline, export chips (all 3 clicked, zero console errors); Mojave recorded story → verdict "No motion detectable. Ionosphere-related noise (72 mm) exceeds the largest apparent signal (48 mm)", signal-vs-noise bars, recorded distribution, M4.06 timeline + map marker + footprint, honest no-layer map note (VLM-confirmed); tour story picker → Mojave story auto-drives recorded result at step 3, lab story auto-runs analysis to the detection verdict; pair finder → 12 pairs over Mojave with score badges/reasons/links (VLM-confirmed); Panama evidence → green banner, 61-event timeline, browse gallery, prediction overlay (VLM-confirmed, 0 errors); mobile 390px: docScrollW=clientW=390, footer pinned at viewport bottom, no overflow (VLM-confirmed).
- DOCS: validation.md (103/533 counts, Mojave row → RECORDED RESULT SERVED with the new evidence trail); data-sources.md (recorded-run note in the Mojave section); README (feature-pass section).

Stage Summary:
- All "do first" items delivered: the flagship real-data story is visible again as an honestly-labelled recorded result; every analysis opens with a five-second plain verdict; histogram + profile charts compute from the real grids; the guided tour walks the three stories in ~2 minutes with a copyable demo script. Worth-adding items also delivered: GeoTIFF/CSV/PNG export (independently verified writer), the why-empty explainer, and the live CMR/USGS pair finder (verified on 2 regions). Skipped as advised: ML classification, multi-hazard dashboards, more datasets. Remaining honest limits: the Mojave pipeline still cannot re-execute without Earthdata credentials; the pair-finder ranking is metadata-only (says so in the UI); the null screen remains exploratory.

---
Task ID: 6 (research-paper implementation)
Agent: lead-architect (direct work, no subagents per user instruction)
Task: Re-base the whole project on the uploaded research paper ("Building a Scientifically Defensible NISAR Surface-Deformation Detection and Attribution System") — implement everything in it.

Work Log:
- Extracted and read the full 21-page plan (pdftotext): SBAS WLS inversion with Tikhonov first-difference regularization + L-curve λ; Okada forward modeling; six-stage Bayesian causal engine (CCA clustering → quality filtering → feature extraction → multi-hypothesis forward models → posterior with context priors → entropy/Bayes-factor abstention); PELT change points; Brier calibration; GNSS LOS-projection validation; ERA5/RAiDER + split-spectrum atmospheric framework; Central Valley Track-42 case study (24 GUNW stack, P271 reference, Hanford/Fresno bowls); /api/v1/{search,velocity,timeseries,attribute} spec; 4-concept distinction (change detection vs deformation vs event detection vs attribution).
- NEW SCIENCE MODULES: sbas.ts (design matrix, per-pixel WLS solve in m/yr-scaled variables, displacement-bounded interval prior, Cholesky core, variance-component weights, DOF-aware Morozov L-curve, blockwise stack inversion, step-augmented solver); pelt.ts (exact optimal-partitioning recursion on the first-difference series with known-σ Gaussian cost + BIC penalty — PELT pruning provably invalid for this cost family, documented); bayes.ts (plan §13 likelihoods verbatim + forward-residual Gaussian consistency terms + priors + normalized Shannon entropy + abstention H>0.75 / p<0.6 + Bayes factor + Brier score); atmosphere.ts (stratified-troposphere regression with physical slope clamp + DEM-range identifiability gate, long-wavelength ionospheric ramp removal over the stable reference, von-Kármán plane-wave turbulent synthesis); gnss.ts (LOS projection + RMSE protocol); stacks.ts (Central Valley fixture: 21 epochs/24 ifgs, NISAR gap honoured, two published-scale bowls, tectonic shear, Coalinga-analog M6.2, CRLB noise, land-cover coherence classes, causal labels); sbas-pipeline.ts (the §12 end-to-end orchestrator).
- DEBUGGING SAGA (root-caused and fixed): FFT Hermitian bug producing 57σ spikes → replaced with exact plane-wave synthesis; PELT missing-argument NaN (silent in Bun) → all costs NaN → zero detections; Morozov target √m never reachable (DOF!) → λ at grid max over-smoothed everything; velocity prior in wrong units dominated the data term 6× (σ_d=25mm vs data weight w·sInv²≈70); pass-2 step refit reused stale scratch arrays from the last pass-1 pixel; strat regression over the full frame absorbed deformation (slopes 10× physical) → stable-mask + clamp; Bayes engine NaN demCorr collapsed posteriors to uniform; GNSS stations outside the 55-km grid.
- PIPELINE RESULTS (deterministic fixture): subsidence bowls recovered (peak ~253 mm/yr vs truth 238), coseismic step isolated at 98% amplitude (175.8 vs 179.8 mm) at the correct epoch by the PELT-guided step refit; PRIMARY_CAUSE_QUAKE (H=0.00) on the step cluster and PRIMARY_CAUSE_SUBSID (H=0.01) on the bowls; GNSS RMSE 33.2 mm/yr over 9 stations; Brier 0.163 (target 0.15); truth velocity RMSE 34.4 mm/yr; temporal-coherence retention 100%.
- API: analyses route runs the stack pipeline (live USGS context merged); dataset detail endpoint serves a lightweight stack descriptor (8s → 0.1s); /api/v1/search (live CMR, verified 38 granules over Central Valley), /api/v1/velocity, /api/v1/timeseries (6 series with σ + change points), /api/v1/attribute (posteriors/entropy/Bayes factor) all live-verified.
- UI: SbasResults panel (verdict banner, key-series chart with σ bands + PELT marks + per-series tabs, Bayesian posterior bars with entropy/Bayes factor/evidence, GNSS scatter + metrics, Brier/truth cards, corrections ledger, warnings); map gains a velocity layer (mm/yr legend + hover) and an EPOCH TIME SLIDER scrubbing the 21 cumulative-displacement grids; key-series tabs include the PELT step candidate; export chips work on velocity/cumulative layers; tour gains a 4th story driving the full pipeline; methodology drawer now carries the paper's 4-concept distinction, SBAS/Bayes equations, atmospheric framework and the v1 API spec.
- TESTS: +24 (plan-core: design matrix, secular/step/missing-obs solves, L-curve, PELT step/trend/NaN, Bayes subsid/quake/abstain/NaN-regression/Brier, turbulent RMS + tails, ramp preservation, gap/network/step-epoch fixtures, full-pipeline contract, GNSS projection). Suite: 127 pass / 659 assertions. Fixed every wrong test expectation against verified solver semantics (unobserved-interval prior pinning, step-prior leak with λ).
- CHECKS: tsc clean; eslint clean; dev.log clean; browser E2E: dataset select → analyze → full SBAS result renders (verdict, series chart, posterior bars, GNSS scatter — VLM-verified), epoch slider drags to Jul 1 2026 (the post-event epoch), no console errors; mobile 390px no overflow, footer pinned; v1 endpoints live-verified. Dev server restarted once after an OOM kill during the test run.
- DOCS: README feature pass + validation.md SBAS section appended.

Stage Summary:
- The project is now backed on the research paper end-to-end: every algorithm it specifies (SBAS WLS + Tikhonov + L-curve, PELT, six-stage Bayesian engine with abstention, Okada forward residuals, GNSS/Brier validation, atmospheric framework with documented ERA5 fallback, Central Valley case study, v1 API) is implemented, tested and live in the UI, with the paper's honesty contract preserved (synthetic fixtures labelled, abstention rule active, "consistent with" language, no fabricated data). The earthquake-detection focus is realized as the PELT step-isolation + step-augmented refit + coseismic Bayesian attribution storyline. Remaining honest limits: real GUNW stacks/GNSS need credentials; Brier 0.163 vs 0.15 target on mixed-zone pixels.

---
Task ID: 17
Agent: main (Z.ai Code)
Task: User reported everything from the previous sessions was gone ("demo datas still, no real map, the slider its gone") — diagnose and restore.

Work Log:
- DIAGNOSIS: the filesystem had been ROLLED BACK to the Oct 21 17:37 state (git clean at commit 78fb056). All uncommitted work from Oct 22-24 was lost from the source: Task 12 (token route + tools), Task 13 (demo-data removal), Task 14 (Panama measured dataset + swipe viewer), Task 15 (pixel-exact slider + understandability), Task 16 (satellite basemap). The worklog itself was truncated to Task 6.
- DATA LOSSES: data/derived/nisar-mojave-2026/ lost its rasters (only recorded_run.json survives — honest recorded-result fallback intact); data/derived/nisar-panama-2026/ (the measured 1.48 GB extraction) gone entirely; .env Earthdata token gone (only DATABASE_URL).
- TOKEN HUNT: recovered the only committed token copy from git (d90693b, Oct 20) and live-tested it against the ASF presign gateway → HTTP 401 invalid_token: it is the KNOWN CORRUPTED COPY (one character off — the exact 2026-10-23 outage signature). The working token exists only in the user's possession. Conclusion: the two granule re-downloads (Mojave live, Panama measured) must wait for the user to re-paste their token.
- REBUILT EVERYTHING ELSE (from this conversation's detailed records of the lost code):
  - TransportGrid.detected (types.ts, optional field) + pipeline.ts majority-vote construction (exact server-side rule |d| > max(k·σ, floor), detected ⊆ valid mask) + tolerant client decode (zero-fill when absent).
  - raster-render.ts: LayerKind += 'detected' (solid sign colors ONLY where the rule passes) + 'phase' (wrapped fringes from displacement/(λ/4π) mod 2π, cyclic muted colormap, λ/2 legend); sampleAt returns detected; renderOverlay gained wavelengthM.
  - colormap.ts: phaseColor (cyclic terracotta→sand→sage→umber, seamless at 0/1).
  - map-panel.tsx: FULL swipe-viewer rewrite — pixel-exact clip (containerPointToLayerPoint − L.DomUtil.getPosition, re-applied on move/zoomend/resize/overlayadd + drags + overlay swaps), draggable divider (pointer capture, keyboard, touch-action none), BEFORE/AFTER chips with real dates (sm: condensation), one-time drag hint (sessionStorage, 12 s), "What am I seeing?" plain-language popover, satellite basemap (Esri World_Imagery + labels reference layer) in EVERY mode, white-cased footprint, window.__motusMap dev handle.
  - page.tsx: mapMode toggle (Before/After ↔ Single layer), beforeAfter/swipeDays/windowQuake/wavelengthM/layerOptions memos, story-led caption ("two radar snapshots N days apart; a magnitude X earthquake struck in between — the red marker"), plain layer names ('Where the ground moved', 'Detected change', 'Radar phase (advanced)'), idle satellite caption, detected/phase exports, no-demo copy (rank, hint, tip, timing, footer), TokenPasteBox integration.
  - usgs.ts: orderBy option (magnitude-descending, limit 200 — the M7.7-cut-by-aftershock-swarm fix) + mergeCachedMechanism (FDSN listing omits the moment tensor; cached detailed record merged into the matching live event). Wired into both analysis-route query paths.
  - datasets.ts: REGISTRY_ORDER = exactly 3 real datasets (mojave, la-2008, evidence-panama); dead synthetic/stack listing branches removed; module doc updated. Synthetic fixtures still loadable for tests + /api/v1.
  - tour.tsx: 3 REAL stories (Mojave recorded w/ generalized numbers, Los Angeles 2008 live-run story with Landmark icon, Panama evidence); 'lab'/'sbas' removed; ~3 minutes copy; script regenerated.
  - methodology.tsx §6: stack machinery exercised by tests + /api/v1 only, never offered as a study area.
  - NEW /api/earthdata/token (POST): live ASF-gateway probe as the only authority (claims never interpreted), corrupted-copy detection (same payload + different signature → explicit note), .env persistence; GET reports configured status without leaking the token. NEW token-paste-box.tsx rendered for credential-gated datasets (unavailable panel) AND the Mojave recorded panel — so the user can re-paste and re-enable the granule downloads.
  - tests: registry test asserts exactly the 3 real ids + no synthetic listed (clean-clone variant too); pipeline test asserts transport.detected presence, size, detected ⊆ valid-mask, and >0 detected cells on the strike-slip fixture + detected present on the real LA product.
- VERIFIED IN BROWSER (agent-browser + VLM): 3 cards, zero demo text; default map = realistic satellite + labels + white footprint (VLM-confirmed terrain depth); LA-2008 LIVE analysis → swipe with real dates (OCT 12 → NOV 27 2008 + MEASURED CHANGE), story caption, What-am-I-seeing popover (all sections), Detected-change + phase layers with correct legends, 0 = no change tick; PIXEL-EXACT alignment re-measured with the correct clamped formula (edge left of image start → inset 0 is CORRECT): 0.00 px at rest, drag-to-60%, panBy, zoomIn(2), zoomOut(3), fitBounds — all exactly 0. (The first stress-test "failures" were a measurement bug in the test itself: inset(0px 0px 0px 0px) is browser-normalized to inset(0px) and the left-of-image clamp was not accounted for.) Mode toggle clears chips/handle (the remaining role=slider is the opacity slider thumb); Panama evidence → prediction swipe with brown/green lobes + red M7.7 marker + 'model prediction' chip; Mojave → recorded result + M4.06 seismic context + token paste box; token route rejects garbage + the corrupted copy with clear live-probe messages; mobile 390px: 3 cards, full live run, no overflow (scrollW 390), chips with 72px gap (VLM false-positive on overlap disproven by geometry), divider present; footer natural at page end; tour picker shows the 3 real stories only; ZERO console/page errors throughout.
- GATES: bun test 127/127 (22603 expect — the count drop from 141 is the lost tests/data/edl-token.test.ts and demo-era tests that no longer apply), ESLint clean, bunx tsc --noEmit clean, dev.log clean.

Stage Summary:
- The rollback wiped all uncommitted work; every code feature is rebuilt and browser-verified on the surviving real data (LA-2008 live measured swipe, Panama evidence prediction swipe, Mojave recorded result).
- The ONE thing that cannot be restored without the user: their Earthdata token (the only surviving copy is the known-corrupted one). The rebuilt /api/earthdata/token route + paste box are ready — once the user re-pastes a valid token, the Mojave granule (2.58 GB) and the measured Panama granule (1.48 GB) can be re-downloaded and re-registered to bring back the full 4-dataset live experience.
