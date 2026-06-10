import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { SetupStateFileSystemGateway } from '@/modules/setup-wizard/interface-adapters/gateways/setupState.fileSystem.gateway.js';
import { SetupStateFactory } from '@/tests/factories/setupState.factory.js';

describe('SetupStateFileSystemGateway', () => {
  let rootDir: string;
  let filePath: string;

  beforeEach(() => {
    rootDir = mkdtempSync(join(tmpdir(), 'reviewflow-state-fs-'));
    filePath = join(rootDir, 'setup-state.json');
  });

  afterEach(() => {
    rmSync(rootDir, { recursive: true, force: true });
  });

  it('returns null state and not corrupted when file is absent', () => {
    const gateway = new SetupStateFileSystemGateway({ filePath });
    const result = gateway.load();
    expect(result.state).toBeNull();
    expect(result.corrupted).toBe(false);
  });

  it('persists and reloads a state atomically', () => {
    const gateway = new SetupStateFileSystemGateway({ filePath });
    const state = SetupStateFactory.create();
    gateway.save(state);
    expect(existsSync(filePath)).toBe(true);
    const reloaded = gateway.load();
    expect(reloaded.state).toEqual(state);
  });

  it('returns corrupted=true on malformed JSON', () => {
    writeFileSync(filePath, '{ not valid', 'utf-8');
    const gateway = new SetupStateFileSystemGateway({ filePath });
    const result = gateway.load();
    expect(result.state).toBeNull();
    expect(result.corrupted).toBe(true);
  });

  it('returns corrupted=true when schema validation fails', () => {
    writeFileSync(filePath, JSON.stringify({ version: 99, garbage: true }), 'utf-8');
    const gateway = new SetupStateFileSystemGateway({ filePath });
    const result = gateway.load();
    expect(result.state).toBeNull();
    expect(result.corrupted).toBe(true);
  });

  it('reset removes the state file', () => {
    const gateway = new SetupStateFileSystemGateway({ filePath });
    gateway.save(SetupStateFactory.create());
    gateway.reset();
    expect(existsSync(filePath)).toBe(false);
  });

  it('save uses an atomic tmp+rename so the target never contains partial JSON', () => {
    const gateway = new SetupStateFileSystemGateway({ filePath });
    gateway.save(SetupStateFactory.create());
    const content = readFileSync(filePath, 'utf-8');
    expect(() => JSON.parse(content)).not.toThrow();
    expect(existsSync(`${filePath}.tmp`)).toBe(false);
  });
});
