import assert from 'node:assert';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import {
  bootstrapLegacyStateIfNeeded,
  createStateStore,
} from '../../src/tdd/state-store.js';

describe('tdd/state-store mode contract', () => {
  let testDir = join(process.cwd(), '.test-state-store-mode');

  beforeEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('read mode does not create db and throws on write operations', () => {
    let readStore = createStateStore({ workingDir: testDir, mode: 'read' });
    try {
      assert.strictEqual(readStore.readReportData(), null);
      assert.strictEqual(readStore.getBaselineMetadata(), null);
      assert.strictEqual(
        existsSync(join(testDir, '.vizzly', 'state.db')),
        false
      );

      assert.throws(() => {
        readStore.replaceReportData({ comparisons: [] });
      }, /read-only/);
    } finally {
      readStore.close();
    }
  });

  it('write mode persists data and read mode can read it back', () => {
    let writeStore = createStateStore({ workingDir: testDir, mode: 'write' });
    try {
      writeStore.replaceReportData({
        comparisons: [{ id: 'a', name: 'home', status: 'passed' }],
      });
      writeStore.setBaselineMetadata({
        buildId: 'build-1',
        screenshots: [{ name: 'home' }],
      });
    } finally {
      writeStore.close();
    }

    let readStore = createStateStore({ workingDir: testDir, mode: 'read' });
    try {
      let reportData = readStore.readReportData();
      assert.strictEqual(reportData.comparisons.length, 1);
      assert.strictEqual(readStore.getBaselineMetadata().buildId, 'build-1');

      assert.throws(() => {
        readStore.setBaselineMetadata({ buildId: 'build-2' });
      }, /read-only/);
    } finally {
      readStore.close();
    }
  });

  it('runs legacy migration only when state.db is first created', () => {
    let vizzlyDir = join(testDir, '.vizzly');
    mkdirSync(vizzlyDir, { recursive: true });

    writeFileSync(
      join(vizzlyDir, 'report-data.json'),
      JSON.stringify({
        timestamp: 123,
        comparisons: [{ id: 'a', name: 'home', status: 'passed' }],
      })
    );

    let firstStore = createStateStore({ workingDir: testDir, mode: 'write' });
    try {
      let data = firstStore.readReportData();
      assert.strictEqual(data.comparisons.length, 1);
    } finally {
      firstStore.close();
    }

    let secondStore = createStateStore({ workingDir: testDir, mode: 'write' });
    try {
      secondStore.resetReportData();
    } finally {
      secondStore.close();
    }

    let thirdStore = createStateStore({ workingDir: testDir, mode: 'write' });
    try {
      let data = thirdStore.readReportData();
      assert.strictEqual(data.comparisons.length, 0);
    } finally {
      thirdStore.close();
    }
  });

  it('bootstraps legacy state when invoked before first writer command', () => {
    let vizzlyDir = join(testDir, '.vizzly');
    mkdirSync(vizzlyDir, { recursive: true });

    writeFileSync(
      join(vizzlyDir, 'report-data.json'),
      JSON.stringify({
        timestamp: 456,
        comparisons: [{ id: 'b', name: 'settings', status: 'failed' }],
      })
    );

    let migrated = bootstrapLegacyStateIfNeeded({
      workingDir: testDir,
      output: {},
    });

    assert.strictEqual(migrated, true);
    assert.strictEqual(existsSync(join(vizzlyDir, 'state.db')), true);

    let readStore = createStateStore({ workingDir: testDir, mode: 'read' });
    try {
      let data = readStore.readReportData();
      assert.strictEqual(data.comparisons.length, 1);
      assert.strictEqual(data.comparisons[0].id, 'b');
    } finally {
      readStore.close();
    }

    let migratedAgain = bootstrapLegacyStateIfNeeded({
      workingDir: testDir,
      output: {},
    });
    assert.strictEqual(migratedAgain, false);
  });
});
