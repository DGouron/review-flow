import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import type { ServerConfigEntry } from '@/modules/setup-wizard/entities/serverConfig/serverConfig.gateway.js';
import { ServerConfigFileSystemGateway } from '@/modules/setup-wizard/interface-adapters/gateways/serverConfig.fileSystem.gateway.js';

const makeEntry = (overrides: Partial<ServerConfigEntry> = {}): ServerConfigEntry => ({
  name: 'main-app',
  localPath: '/repos/main-app',
  enabled: true,
  ...overrides,
});

describe('ServerConfigFileSystemGateway (integration with real filesystem)', () => {
  let baseDir: string;
  let configPath: string;

  beforeEach(() => {
    baseDir = mkdtempSync(join(tmpdir(), 'server-config-'));
    configPath = join(baseDir, 'config', 'config.json');
  });

  afterEach(() => {
    rmSync(baseDir, { recursive: true, force: true });
  });

  describe('hasProject', () => {
    it('returns false when the config file is missing', () => {
      const gateway = new ServerConfigFileSystemGateway({ configPath });

      expect(gateway.hasProject('/repos/main-app')).toBe(false);
    });

    it('returns false when the config content is malformed JSON', () => {
      writeFileSync(configPath.replace('/config/config.json', '/malformed.json'), 'not json');
      const malformedPath = join(baseDir, 'malformed.json');
      const gateway = new ServerConfigFileSystemGateway({ configPath: malformedPath });

      expect(gateway.hasProject('/repos/main-app')).toBe(false);
    });

    it('returns false when repositories is not an array', () => {
      const path = join(baseDir, 'shape.json');
      writeFileSync(path, JSON.stringify({ repositories: 'oops' }));
      const gateway = new ServerConfigFileSystemGateway({ configPath: path });

      expect(gateway.hasProject('/repos/main-app')).toBe(false);
    });

    it('returns true when a repository with the given localPath exists', () => {
      const path = join(baseDir, 'valid.json');
      writeFileSync(
        path,
        JSON.stringify({
          repositories: [{ name: 'main-app', localPath: '/repos/main-app', enabled: true }],
        }),
      );
      const gateway = new ServerConfigFileSystemGateway({ configPath: path });

      expect(gateway.hasProject('/repos/main-app')).toBe(true);
      expect(gateway.hasProject('/repos/other')).toBe(false);
    });
  });

  describe('addProject', () => {
    it('creates the config file and directory when none exists', () => {
      const gateway = new ServerConfigFileSystemGateway({ configPath });
      const entry = makeEntry();

      gateway.addProject(entry);

      expect(existsSync(configPath)).toBe(true);
      const written: unknown = JSON.parse(readFileSync(configPath, 'utf-8'));
      expect(written).toEqual({
        repositories: [{ name: 'main-app', localPath: '/repos/main-app', enabled: true }],
      });
      expect(gateway.hasProject('/repos/main-app')).toBe(true);
    });

    it('appends to existing repositories on a valid round-trip', () => {
      const gateway = new ServerConfigFileSystemGateway({ configPath });
      gateway.addProject(makeEntry({ name: 'first', localPath: '/repos/first' }));
      gateway.addProject(makeEntry({ name: 'second', localPath: '/repos/second', enabled: false }));

      expect(gateway.hasProject('/repos/first')).toBe(true);
      expect(gateway.hasProject('/repos/second')).toBe(true);
      const written: unknown = JSON.parse(readFileSync(configPath, 'utf-8'));
      expect(written).toEqual({
        repositories: [
          { name: 'first', localPath: '/repos/first', enabled: true },
          { name: 'second', localPath: '/repos/second', enabled: false },
        ],
      });
    });

    it('is idempotent and does not duplicate an existing localPath', () => {
      const gateway = new ServerConfigFileSystemGateway({ configPath });
      const entry = makeEntry();

      gateway.addProject(entry);
      gateway.addProject(makeEntry({ name: 'renamed' }));

      const written = readFileSync(configPath, 'utf-8');
      const parsed: unknown = JSON.parse(written);
      expect(parsed).toEqual({
        repositories: [{ name: 'main-app', localPath: '/repos/main-app', enabled: true }],
      });
    });

    it('preserves unknown top-level keys from an existing loose config', () => {
      const path = join(baseDir, 'loose.json');
      writeFileSync(path, JSON.stringify({ repositories: [], version: 2, custom: { a: 1 } }));
      const gateway = new ServerConfigFileSystemGateway({ configPath: path });

      gateway.addProject(makeEntry());

      const parsed: unknown = JSON.parse(readFileSync(path, 'utf-8'));
      expect(parsed).toEqual({
        repositories: [{ name: 'main-app', localPath: '/repos/main-app', enabled: true }],
        version: 2,
        custom: { a: 1 },
      });
    });
  });
});
