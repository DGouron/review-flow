import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { FilesystemBudgetGateway } from '@/modules/token-accounting/interface-adapters/gateways/budget/budget.filesystem.gateway.js';

describe('FilesystemBudgetGateway', () => {
  let tempHome: string;
  let originalXdgConfigHome: string | undefined;
  let gateway: FilesystemBudgetGateway;

  beforeEach(() => {
    tempHome = mkdtempSync(join(tmpdir(), 'reviewflow-budget-'));
    originalXdgConfigHome = process.env.XDG_CONFIG_HOME;
    process.env.XDG_CONFIG_HOME = tempHome;
    gateway = new FilesystemBudgetGateway();
  });

  afterEach(() => {
    if (originalXdgConfigHome === undefined) {
      Reflect.deleteProperty(process.env, 'XDG_CONFIG_HOME');
    } else {
      process.env.XDG_CONFIG_HOME = originalXdgConfigHome;
    }
    rmSync(tempHome, { recursive: true, force: true });
  });

  it('returns null when the budget file does not exist', async () => {
    const config = await gateway.load();
    expect(config).toBeNull();
  });

  it('saves and reloads a config (roundtrip)', async () => {
    await gateway.save({ limitUsd: 350 });

    const reloaded = await gateway.load();
    expect(reloaded).toEqual({ limitUsd: 350 });
  });

  it('creates the reviewflow config directory when saving for the first time', async () => {
    await gateway.save({ limitUsd: 200 });

    const expectedFile = join(tempHome, 'reviewflow', 'budget.json');
    expect(existsSync(expectedFile)).toBe(true);
  });

  it('writes JSON in a pretty-printed form', async () => {
    await gateway.save({ limitUsd: 350 });

    const filePath = join(tempHome, 'reviewflow', 'budget.json');
    const raw = readFileSync(filePath, 'utf-8');
    expect(raw).toContain('\n');
    expect(raw).toMatch(/"limitUsd":\s*350/);
  });

  it('returns null when the file content fails validation', async () => {
    const dir = join(tempHome, 'reviewflow');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'budget.json'), JSON.stringify({ limitUsd: 9999 }));

    const reloaded = await gateway.load();
    expect(reloaded).toBeNull();
  });

  it('returns null when the file content is not valid JSON', async () => {
    const dir = join(tempHome, 'reviewflow');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'budget.json'), 'not json');

    const reloaded = await gateway.load();
    expect(reloaded).toBeNull();
  });
});
