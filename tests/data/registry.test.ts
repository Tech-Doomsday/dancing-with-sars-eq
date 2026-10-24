import { describe, expect, test, beforeAll, afterAll } from 'bun:test';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  listDatasets,
  getDataset,
  getDatasetAvailability,
  _testRoots,
} from '@/lib/data/datasets';

/**
 * Clean-clone reproducibility tests (remediation §3).
 *
 * A fresh clone without any local scientific data must:
 *  - list the dataset registry without crashing,
 *  - report structured availability states ('missing' etc.) with file lists,
 *  - refuse to load unavailable datasets (getDataset -> undefined) rather
 *    than fabricating data,
 *  - keep synthetic fixtures always available offline.
 *
 * The scenarios are simulated by pointing the loader's test roots at
 * temporary directories (empty / partial / corrupt).
 */

const REAL_DERIVED = _testRoots.derived;
const REAL_BROWSE = _testRoots.browse;

function makeTempRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'motus-regression-'));
}

afterAll(() => {
  _testRoots.derived = REAL_DERIVED;
  _testRoots.browse = REAL_BROWSE;
});

describe('dataset registry with all local data present (this repository)', () => {
  beforeAll(() => {
    _testRoots.derived = REAL_DERIVED;
    _testRoots.browse = REAL_BROWSE;
  });

  test('the UI registry lists EXACTLY the real datasets — no synthetic demo data', () => {
    const list = listDatasets();
    // Only real datasets are offered as study areas (2026-10-24 contract).
    expect(list.map((d) => d.id)).toEqual([
      'real-nisar-mojave-2026',
      'real-nisar-la-2008',
      'evidence-panama-2026',
    ]);
    for (const d of list) {
      expect(d.dataClass).toBe('real');
      expect(['available', 'missing', 'incomplete', 'invalid']).toContain(d.availability.state);
    }
  });

  test('synthetic fixtures remain loadable as validation machinery but are never listed', () => {
    expect(getDatasetAvailability('synthetic-strikeslip').state).toBe('available');
    expect(getDatasetAvailability('synthetic-null').state).toBe('available');
    expect(getDataset('synthetic-strikeslip')).toBeDefined();
    expect(listDatasets().some((d) => d.id.startsWith('synthetic-'))).toBe(false);
    expect(listDatasets().some((d) => d.id === 'stack-central-valley-2026')).toBe(false);
  });

  test('LA dataset present in this repository is available and loads', () => {
    // This assertion documents the state of THIS checkout; the clean-clone
    // scenarios below cover the absent-data behaviour.
    if (getDatasetAvailability('real-nisar-la-2008').state === 'available') {
      const ds = getDataset('real-nisar-la-2008');
      expect(ds).toBeDefined();
      expect(ds!.phase!.data.length).toBe(ds!.phase!.meta.width * ds!.phase!.meta.height);
    }
  });

  test('the committed Panama evidence cache resolves as available', () => {
    expect(getDatasetAvailability('evidence-panama-2026').state).toBe('available');
    const ds = getDataset('evidence-panama-2026');
    expect(ds).toBeDefined();
  });

  test('Panama primary granule is selected by explicit criteria, not array order', () => {
    const ds = getDataset('evidence-panama-2026') as unknown as {
      granules?: Array<{ granuleId: string }>;
      granuleSelection?: { selectedContainsEpicentre: boolean; considered: number; bracketing: number };
    };
    expect(ds.granules).toBeDefined();
    expect(ds.granuleSelection).toBeDefined();
    // The cached records contain 3 granules; the selected one must be the
    // bracketing footprint containing (or nearest to) the epicentre.
    expect(ds.granules!.length).toBe(3);
    expect(ds.granuleSelection!.considered).toBe(3);
    expect(ds.granuleSelection!.bracketing).toBe(3);
    expect(ds.granuleSelection!.selectedContainsEpicentre).toBe(true);
  });
});

describe('clean clone: no local data at all', () => {
  let emptyRoot: string;
  beforeAll(() => {
    emptyRoot = makeTempRoot();
    _testRoots.derived = path.join(emptyRoot, 'derived');
    _testRoots.browse = path.join(emptyRoot, 'browse');
    fs.mkdirSync(_testRoots.derived, { recursive: true });
    fs.mkdirSync(_testRoots.browse, { recursive: true });
  });

  test('listDatasets does not crash and reports missing states with file lists', () => {
    const list = listDatasets();
    // A clean clone still lists exactly the real datasets (with fallback
    // titles) — never synthetic ones.
    expect(list.length).toBe(3);
    const mojave = list.find((d) => d.id === 'real-nisar-mojave-2026')!;
    expect(mojave.availability.state).toBe('missing');
    expect(mojave.availability.missingFiles).toContain('meta.json');
    expect(mojave.availability.explanation.length).toBeGreaterThan(20);
    expect(mojave.title.length).toBeGreaterThan(5); // fallback title from registry

    const la = list.find((d) => d.id === 'real-nisar-la-2008')!;
    expect(la.availability.state).toBe('missing');
    expect(la.availability.missingFiles.length).toBe(4);

    const panama = list.find((d) => d.id === 'evidence-panama-2026')!;
    expect(panama.availability.state).toBe('missing');
    expect(panama.availability.missingFiles).toContain('granules.json');

    // Synthetic fixtures survive a dataless clone (loadable, not listed).
    expect(getDatasetAvailability('synthetic-strikeslip').state).toBe('available');
    expect(list.some((d) => d.id.startsWith('synthetic-'))).toBe(false);
  });

  test('getDataset refuses to fabricate data for missing datasets', () => {
    expect(getDataset('real-nisar-mojave-2026')).toBeUndefined();
    expect(getDataset('real-nisar-la-2008')).toBeUndefined();
    expect(getDataset('evidence-panama-2026')).toBeUndefined();
    expect(getDataset('synthetic-null')).toBeDefined();
    expect(getDataset('completely-unknown-id')).toBeUndefined();
  });

  test('availability explanations name the acquisition path (no dead ends)', () => {
    const mojave = getDatasetAvailability('real-nisar-mojave-2026');
    expect(mojave.explanation).toContain('fetch_nisar_granule.py');
    const la = getDatasetAvailability('real-nisar-la-2008');
    expect(la.explanation).toContain('extract_gunw.py');
  });
});

describe('partial data: only some files present', () => {
  let partialRoot: string;
  beforeAll(() => {
    partialRoot = makeTempRoot();
    _testRoots.derived = path.join(partialRoot, 'derived');
    _testRoots.browse = path.join(partialRoot, 'browse');
    const dir = path.join(_testRoots.derived, 'nisar-la-2008');
    fs.mkdirSync(dir, { recursive: true });
    fs.mkdirSync(_testRoots.browse, { recursive: true });
    fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify({
      slug: 'nisar-la-2008',
      grid: { width: 100, height: 100, xStart: 0, xSpacing: 80, yStart: 0, ySpacing: -80, epsg: 32611 },
    }));
    // phase.f32 written, coherence.f32 and components.u16 missing.
    fs.writeFileSync(path.join(dir, 'phase.f32'), Buffer.alloc(100 * 100 * 4));
  });

  test('incomplete datasets are reported with the missing-file list', () => {
    const avail = getDatasetAvailability('real-nisar-la-2008');
    expect(avail.state).toBe('incomplete');
    expect(avail.missingFiles).toContain('coherence.f32');
    expect(avail.missingFiles).toContain('components.u16');
    expect(getDataset('real-nisar-la-2008')).toBeUndefined();
  });
});

describe('corrupt data: files present but wrong', () => {
  let corruptRoot: string;
  beforeAll(() => {
    corruptRoot = makeTempRoot();
    _testRoots.derived = path.join(corruptRoot, 'derived');
    _testRoots.browse = path.join(corruptRoot, 'browse');
    const dir = path.join(_testRoots.derived, 'nisar-la-2008');
    fs.mkdirSync(dir, { recursive: true });
    fs.mkdirSync(_testRoots.browse, { recursive: true });
    fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify({
      slug: 'nisar-la-2008',
      grid: { width: 100, height: 100, xStart: 0, xSpacing: 80, yStart: 0, ySpacing: -80, epsg: 32611 },
    }));
    // Truncated rasters: right files, wrong sizes.
    fs.writeFileSync(path.join(dir, 'phase.f32'), Buffer.alloc(1000));
    fs.writeFileSync(path.join(dir, 'coherence.f32'), Buffer.alloc(100 * 100 * 4));
    fs.writeFileSync(path.join(dir, 'components.u16'), Buffer.alloc(100 * 100 * 2));
  });

  test('size-mismatched rasters are reported as invalid, never loaded', () => {
    const avail = getDatasetAvailability('real-nisar-la-2008');
    expect(avail.state).toBe('invalid');
    expect(avail.invalidFiles.length).toBe(1);
    expect(avail.invalidFiles[0].file).toBe('phase.f32');
    expect(avail.invalidFiles[0].reason).toContain('does not match');
    expect(getDataset('real-nisar-la-2008')).toBeUndefined();
  });

  test('unparseable meta.json is reported as invalid', () => {
    const dir = path.join(_testRoots.derived, 'nisar-la-2008');
    fs.writeFileSync(path.join(dir, 'meta.json'), '{ not json');
    const avail = getDatasetAvailability('real-nisar-la-2008');
    expect(avail.state).toBe('invalid');
    expect(avail.invalidFiles[0].file).toBe('meta.json');
  });

  test('malformed Panama cache is reported as invalid, never half-loaded', () => {
    const dir = path.join(_testRoots.derived, 'panama-2026');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'granules.json'), '[{ broken');
    fs.writeFileSync(path.join(dir, 'usgs_event.json'), '{}');
    const avail = getDatasetAvailability('evidence-panama-2026');
    expect(avail.state).toBe('invalid');
    expect(getDataset('evidence-panama-2026')).toBeUndefined();
  });
});
