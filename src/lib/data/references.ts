/**
 * Scientific reference registry.
 *
 * Every reference below supports a specific claim, equation or data source
 * used by this application. checkedAt documents when the link/DOI was last
 * verified reachable. This registry is exposed through /api/references and
 * rendered in the UI next to the results it supports.
 */

export interface ScienceReference {
  key: string;
  title: string;
  authors: string;
  year: number;
  venue: string;
  url: string;
  doi?: string;
  type: 'paper' | 'document' | 'dataset' | 'api' | 'software';
  supports: string[];
  note?: string;
  checkedAt: string;
}

export const REFERENCES: ScienceReference[] = [
  // ---------------- tsunami capability (2026-10-24) ----------------
  {
    key: 'audusse2004',
    title: 'A fast and stable well-balanced scheme with hydrostatic reconstruction for shallow water flows',
    authors: 'E. Audusse, F. Bouchut, M.-O. Bristeau, R. Klein, B. Perthame',
    year: 2004,
    venue: 'SIAM Journal on Scientific Computing 25(6):2050–2065',
    url: 'https://doi.org/10.1137/S1064827503431097',
    doi: '10.1137/S1064827503431097',
    type: 'paper',
    supports: [
      'Hydrostatic reconstruction + double-sided pressure correction that makes the NSWE finite-volume solver exactly well-balanced (lake at rest incl. wet/dry), verified to machine precision in tests',
    ],
    checkedAt: '2026-10-24',
  },
  {
    key: 'george2008',
    title: 'Augmented Riemann solvers for the shallow water equations over variable bed topography',
    authors: 'D. L. George',
    year: 2008,
    venue: 'PhD thesis, University of Washington',
    url: 'https://www.clawpack.org/george-2008/',
    type: 'paper',
    supports: [
      'Dry-front wave-speed treatment (|u|+2√(gh) for cells bordering dry neighbours) used in the HLL fluxes and the CFL condition',
    ],
    checkedAt: '2026-10-24',
  },
  {
    key: 'kajiura1963',
    title: 'The leading wave of a tsunami',
    authors: 'K. Kajiura',
    year: 1963,
    venue: 'Bulletin of the Earthquake Research Institute 41:535–571',
    url: 'https://www.jstage.jst.go.jp/article/sokuchi1932/41/3/41_3_535/_article',
    type: 'paper',
    supports: [
      'Water-column transfer function η̂(k) = Δĥ(k)/cosh(k·d) applied to the seafloor displacement before the initial condition',
    ],
    checkedAt: '2026-10-24',
  },
  {
    key: 'taniokaseno1997',
    title: 'Sediment effect on tsunami generation of the 1896 Sanriku tsunami earthquake',
    authors: 'K. Tanioka, T. Seno',
    year: 1997,
    venue: 'Geophysical Research Letters 24(4):541–548',
    url: 'https://doi.org/10.1029/97GL04018',
    doi: '10.1029/97GL04018',
    type: 'paper',
    supports: [
      'Bathymetric-slope correction Δh = u_z + u_h·∇b added to the Okada vertical displacement',
    ],
    checkedAt: '2026-10-24',
  },
  {
    key: 'zhao2005',
    title: 'A fast sweeping method for eikonal equations',
    authors: 'H. Zhao',
    year: 2005,
    venue: 'Mathematics of Computation 74(250):603–627',
    url: 'https://doi.org/10.1090/S0025-5718-04-01678-3',
    doi: '10.1090/S0025-5718-04-01678-3',
    type: 'paper',
    supports: [
      'Gauss–Seidel fast-sweeping solver for the travel-time eikonal equation ‖∇T‖ = 1/√(gh)',
    ],
    checkedAt: '2026-10-24',
  },
  {
    key: 'etopo1',
    title: 'ETOPO1 1 Arc-Minute Global Relief Model',
    authors: 'C. Amante, B. W. Eakins (NOAA NCEI)',
    year: 2009,
    venue: 'NOAA National Centers for Environmental Information',
    url: 'https://www.ngdc.noaa.gov/mgg/global/relief/ETOPO1/',
    type: 'dataset',
    supports: [
      'Bathymetry/topography for all tsunami simulations, subset live via the NCEI THREDDS OPeNDAP service (verified 8°×6° in ≈4 s)',
    ],
    note: 'MSL vertical datum; ~1.8 km cells at best — coastal inundation is not resolved (UI carries the caveat)',
    checkedAt: '2026-10-24',
  },
  {
    key: 'ndbc-dart',
    title: 'NDBC DART® (Deep-ocean Assessment and Reporting of Tsunamis) data archive',
    authors: 'NOAA National Data Buoy Center',
    year: 2026,
    venue: 'ndbc.noaa.gov/data/historical/dart/ + /data/realtime2/',
    url: 'https://www.ndbc.noaa.gov/dart.shtml',
    type: 'dataset',
    supports: [
      'Deep-ocean bottom-pressure records for the observation check (15-min monitor / 1-min event cadence, 9999.0 = missing)',
    ],
    note: 'station positions are current deployments — buoys are redeployed over the years; historical comparisons carry this caveat',
    checkedAt: '2026-10-24',
  },
  {
    key: 'hayes2017ffm',
    title: 'The finite-fault slip model of the USGS Earthquake Hazard Program',
    authors: 'G. P. Hayes (USGS NEIC)',
    year: 2017,
    venue: 'USGS Earthquake Hazards Program',
    url: 'https://earthquake.usgs.gov/data/finitefault/',
    type: 'dataset',
    supports: [
      'Finite-fault subfault geometries + slip (FFM.geojson products) used to build the initial condition when published',
    ],
    checkedAt: '2026-10-24',
  },

  {
    key: 'okada1985',
    title: 'Surface deformation due to shear and tensile faults in a half-space',
    authors: 'Y. Okada',
    year: 1985,
    venue: 'Bulletin of the Seismological Society of America 75(4):1135–1154',
    url: 'https://doi.org/10.1785/BSSA0750041135',
    doi: '10.1785/BSSA0750041135',
    type: 'paper',
    supports: [
      'Analytic elastic half-space dislocation model used for synthetic validation fixtures and for the earthquake forward-model consistency screen',
    ],
    checkedAt: '2026-10-20',
  },
  {
    key: 'okada1992',
    title: 'Internal deformation due to shear and tensile faults in a half-space',
    authors: 'Y. Okada',
    year: 1992,
    venue: 'Bulletin of the Seismological Society of America 82(2):1018–1040',
    url: 'https://doi.org/10.1785/BSSA0820021018',
    doi: '10.1785/BSSA0820021018',
    type: 'paper',
    supports: [
      'DC3D reference implementation lineage; our TypeScript port is benchmarked against a Python port of this code',
    ],
    checkedAt: '2026-10-20',
  },
  {
    key: 'dc3dpy',
    title: 'dc3d.py — Python port of the dislocation model DC3D.f by Okada (1992)',
    authors: 'satoshi-pes (GitHub)',
    year: 2023,
    venue: 'GitHub repository',
    url: 'https://github.com/satoshi-pes/dc3d.py',
    type: 'software',
    supports: [
      'Independent reference implementation used to generate the Okada benchmark suite (vendored at tools/dc3d_reference.py)',
    ],
    note: 'Cross-validation: 72 scalar comparisons, worst relative difference 0.0 (8 significant digits).',
    checkedAt: '2026-10-20',
  },
  {
    key: 'rodriguez1992',
    title: 'Theory and design of interferometric synthetic aperture radars',
    authors: 'E. Rodriguez, J. M. Martin',
    year: 1992,
    venue: 'IEE Proceedings F 139(2):147–159',
    url: 'https://doi.org/10.1049/ip-f-2.1992.0018',
    doi: '10.1049/ip-f-2.1992.0018',
    type: 'paper',
    supports: [
      'Coherence-based interferometric phase standard deviation σ_φ = sqrt((1−γ²)/(2Lγ²)) used in the uncertainty layer',
    ],
    checkedAt: '2026-10-20',
  },
  {
    key: 'hanssen2001',
    title: 'Radar Interferometry: Data Interpretation and Error Analysis',
    authors: 'R. F. Hanssen',
    year: 2001,
    venue: 'Kluwer Academic Publishers, Dordrecht',
    url: 'https://doi.org/10.1007/0-306-47633-9',
    doi: '10.1007/0-306-47633-9',
    type: 'paper',
    supports: [
      'Error taxonomy of InSAR (atmospheric, ionospheric, unwrapping, decorrelation) informing the uncertainty and attribution layers',
    ],
    checkedAt: '2026-10-20',
  },
  {
    key: 'nisar-atbd',
    title: 'NISAR NASA SDS Algorithm Theoretical Basis Document (JPL D-95677, Rev A)',
    authors: 'NASA Jet Propulsion Laboratory / NISAR Project',
    year: 2023,
    venue: 'JPL document D-95677',
    url: 'https://nisar.asf.earthdatacloud.nasa.gov/NISAR-SAMPLE-DATA/DOCS/NISAR_D-95677_NASA_L1_L2_ATBD_20231112_R3.4_w-sigs.pdf',
    type: 'document',
    supports: [
      'Interferogram formation convention (reference × conj(secondary)) and the phase decomposition Δφ = (4π/λ)(Δr_d + Δr_g + Δr_t + Δr_i + Δr_n) (§5.7, §5.11.1) underlying the phase→displacement conversion',
      'Split-spectrum ionospheric correction description',
    ],
    checkedAt: '2026-10-20',
  },
  {
    key: 'nisar-gunw-spec',
    title: 'NISAR L2 GUNW Product Specification (JPL D-102272, Rev E)',
    authors: 'NASA Jet Propulsion Laboratory / NISAR Project',
    year: 2024,
    venue: 'JPL document D-102272',
    url: 'https://nisar.asf.earthdatacloud.nasa.gov/NISAR-SAMPLE-DATA/DOCS/NISAR_D-102272_RevE_NASA_SDS_Product_Specification_L2_GUNW_Nov8_2024_w-sigs.pdf',
    type: 'document',
    supports: [
      'HDF5 layout of the GUNW product (unwrappedPhase, coherenceMagnitude, connectedComponents, ionosphere screens, radarGrid metadata) consumed by the extractor',
    ],
    checkedAt: '2026-10-20',
  },
  {
    key: 'nisar-sample-data',
    title: 'NISAR Sample Data portal',
    authors: 'NASA / ASF DAAC',
    year: 2025,
    venue: 'ASF Earthdata Cloud',
    url: 'https://nisar.jpl.nasa.gov/data/sample-data/',
    type: 'dataset',
    supports: [
      'Openly distributed NISAR-format sample products; the analysed L2 GUNW sample (ALOS PALSAR 2008 pair over the Los Angeles region, NISAR SDS v0.24.0) originates here',
    ],
    note: 'Local copy: data/nisar-sample/. Product DOI recorded in-file: 10.5067/NIL2GUNW-B1.',
    checkedAt: '2026-10-20',
  },
  {
    key: 'cmr-api',
    title: 'NASA Common Metadata Repository (CMR) Search API',
    authors: 'NASA Earthdata',
    year: 2026,
    venue: 'cmr.earthdata.nasa.gov',
    url: 'https://cmr.earthdata.nasa.gov/search/',
    type: 'api',
    supports: [
      'Live discovery of NISAR L2 GUNW granule availability (collections NISAR_L2_GUNW_PROVISIONAL_V1 / BETA_V1) used by the availability panel',
    ],
    checkedAt: '2026-10-20',
  },
  {
    key: 'usgs-fdsn',
    title: 'USGS Earthquake Catalog API (ComCat FDSN ws-event)',
    authors: 'U.S. Geological Survey',
    year: 2026,
    venue: 'earthquake.usgs.gov/fdsnws',
    url: 'https://earthquake.usgs.gov/fdsnws/event/1/',
    type: 'api',
    supports: [
      'Independent seismic evidence for the attribution layer; moment-tensor nodal planes used by the forward-model screen',
    ],
    checkedAt: '2026-10-20',
  },
  {
    key: 'hanks1979',
    title: 'A moment magnitude scale',
    authors: 'T. C. Hanks, H. Kanamori',
    year: 1979,
    venue: 'Journal of Geophysical Research 84(B5):2348–2350',
    url: 'https://doi.org/10.1029/JB084iB05p02348',
    doi: '10.1029/JB084iB05p02348',
    type: 'paper',
    supports: ['Moment–magnitude relation M0 = 10^(1.5 Mw + 9.1) N·m used to scale the forward model'],
    checkedAt: '2026-10-20',
  },
  {
    key: 'wc1994',
    title: 'New empirical relationships among magnitude, rupture length, rupture width, rupture area, and surface displacement',
    authors: 'D. L. Wells, K. J. Coppersmith',
    year: 1994,
    venue: 'Bulletin of the Seismological Society of America 84(4):974–1002',
    url: 'https://doi.org/10.1785/BSSA0840040974',
    doi: '10.1785/BSSA0840040974',
    type: 'paper',
    supports: [
      'Empirical magnitude–rupture-area scaling (log10 A = 0.91 Mw − 3.49, all slip types) used for fault dimensions in the forward-model screen',
    ],
    note: 'Regression scatter ≈ 0.25 orders of magnitude — used only as an order-of-magnitude screen.',
    checkedAt: '2026-10-20',
  },
  {
    key: 'snyder1987',
    title: 'Map Projections — A Working Manual',
    authors: 'J. P. Snyder',
    year: 1987,
    venue: 'U.S. Geological Survey Professional Paper 1395',
    url: 'https://doi.org/10.3133/pp1395',
    doi: '10.3133/pp1395',
    type: 'document',
    supports: ['Transverse Mercator (UTM) forward/inverse series used for map alignment of product grids'],
    checkedAt: '2026-10-20',
  },
  {
    key: 'huber1981',
    title: 'Robust Statistics',
    authors: 'P. J. Huber',
    year: 1981,
    venue: 'John Wiley & Sons, New York',
    url: 'https://doi.org/10.1002/0471725250',
    doi: '10.1002/0471725250',
    type: 'paper',
    supports: ['Median/MAD robust estimators used for referencing and reference-region scatter'],
    checkedAt: '2026-10-20',
  },
  {
    key: 'akirichards',
    title: 'Quantitative Seismology (2nd edition)',
    authors: 'K. Aki, P. G. Richards',
    year: 2002,
    venue: 'University Science Books, Sausalito',
    url: 'https://www.uscis.org/books/quantitative-seismology-2nd-edition-aki-richards',
    type: 'paper',
    supports: ['Rake (slip vector) convention used to map USGS moment-tensor solutions onto Okada dislocation components'],
    checkedAt: '2026-10-20',
  },
];

export function referenceByKey(key: string): ScienceReference | undefined {
  return REFERENCES.find((r) => r.key === key);
}
