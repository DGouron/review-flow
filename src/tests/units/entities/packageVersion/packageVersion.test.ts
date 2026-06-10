import { describe, it, expect } from 'vitest';

import {
  parseNpmRegistryResponse,
  safeParseNpmRegistryResponse,
  isValidNpmRegistryResponse,
} from '@/modules/cli-configuration/entities/packageVersion/packageVersion.guard.js';
import type {
  VersionCheckResult,
  SelfUpdateResult,
  UpdateStatus,
} from '@/modules/cli-configuration/entities/packageVersion/packageVersion.js';
import {
  npmRegistryResponseSchema,
  versionCheckResultSchema,
} from '@/modules/cli-configuration/entities/packageVersion/packageVersion.schema.js';

describe('npmRegistryResponseSchema', () => {
  it('should validate a valid npm registry response', () => {
    const response = { version: '2.0.0' };

    const result = npmRegistryResponseSchema.safeParse(response);

    expect(result.success).toBe(true);
  });

  it('should reject a response without version field', () => {
    const response = { name: 'some-package' };

    const result = npmRegistryResponseSchema.safeParse(response);

    expect(result.success).toBe(false);
  });

  it('should reject a response with non-string version', () => {
    const response = { version: 123 };

    const result = npmRegistryResponseSchema.safeParse(response);

    expect(result.success).toBe(false);
  });

  it('should reject null input', () => {
    const result = npmRegistryResponseSchema.safeParse(null);

    expect(result.success).toBe(false);
  });
});

describe('versionCheckResultSchema', () => {
  it('should validate a complete version check result', () => {
    const checkResult = {
      currentVersion: '1.0.0',
      latestVersion: '2.0.0',
      updateAvailable: true,
      checkedAt: '2026-03-14T10:00:00Z',
      installType: 'global-npm',
    };

    const result = versionCheckResultSchema.safeParse(checkResult);

    expect(result.success).toBe(true);
  });

  it('should validate a result with null latestVersion', () => {
    const checkResult = {
      currentVersion: '1.0.0',
      latestVersion: null,
      updateAvailable: false,
      checkedAt: '2026-03-14T10:00:00Z',
      installType: 'source-checkout',
    };

    const result = versionCheckResultSchema.safeParse(checkResult);

    expect(result.success).toBe(true);
  });

  it('should reject a result with missing fields', () => {
    const checkResult = {
      currentVersion: '1.0.0',
    };

    const result = versionCheckResultSchema.safeParse(checkResult);

    expect(result.success).toBe(false);
  });

  it('should reject a result with non-boolean updateAvailable', () => {
    const checkResult = {
      currentVersion: '1.0.0',
      latestVersion: '2.0.0',
      updateAvailable: 'yes',
      checkedAt: '2026-03-14T10:00:00Z',
    };

    const result = versionCheckResultSchema.safeParse(checkResult);

    expect(result.success).toBe(false);
  });
});

describe('NpmRegistryResponse Guard', () => {
  describe('parseNpmRegistryResponse', () => {
    it('should parse a valid npm registry response', () => {
      const response = { version: '2.0.0' };

      const result = parseNpmRegistryResponse(response);

      expect(result.version).toBe('2.0.0');
    });

    it('should throw on invalid npm registry response', () => {
      expect(() => parseNpmRegistryResponse({ invalid: true })).toThrow();
    });
  });

  describe('safeParseNpmRegistryResponse', () => {
    it('should return success true for valid response', () => {
      const response = { version: '1.5.0' };

      const result = safeParseNpmRegistryResponse(response);

      expect(result.success).toBe(true);
    });

    it('should return success false for invalid response', () => {
      const result = safeParseNpmRegistryResponse({ version: 42 });

      expect(result.success).toBe(false);
    });
  });

  describe('isValidNpmRegistryResponse', () => {
    it('should return true for valid response', () => {
      expect(isValidNpmRegistryResponse({ version: '3.0.0' })).toBe(true);
    });

    it('should return false for invalid response', () => {
      expect(isValidNpmRegistryResponse(null)).toBe(false);
      expect(isValidNpmRegistryResponse({ name: 'pkg' })).toBe(false);
    });
  });
});

describe('VersionCheckResult type', () => {
  it('should allow creating a VersionCheckResult with all fields', () => {
    const result: VersionCheckResult = {
      currentVersion: '1.0.0',
      latestVersion: '2.0.0',
      updateAvailable: true,
      checkedAt: '2026-03-14T10:00:00Z',
      installType: 'global-npm',
    };

    expect(result.currentVersion).toBe('1.0.0');
    expect(result.latestVersion).toBe('2.0.0');
    expect(result.updateAvailable).toBe(true);
    expect(result.checkedAt).toBe('2026-03-14T10:00:00Z');
    expect(result.installType).toBe('global-npm');
  });

  it('should allow null latestVersion', () => {
    const result: VersionCheckResult = {
      currentVersion: '1.0.0',
      latestVersion: null,
      updateAvailable: false,
      checkedAt: '2026-03-14T10:00:00Z',
      installType: 'source-checkout',
    };

    expect(result.latestVersion).toBeNull();
    expect(result.installType).toBe('source-checkout');
  });
});

describe('SelfUpdateResult type', () => {
  it('should represent a started status', () => {
    const result: SelfUpdateResult = { status: 'started' };

    expect(result.status).toBe('started');
  });

  it('should represent an updated status with version info', () => {
    const result: SelfUpdateResult = {
      status: 'updated',
      previousVersion: '1.0.0',
      newVersion: '2.0.0',
    };

    expect(result.status).toBe('updated');
    expect(result.previousVersion).toBe('1.0.0');
    expect(result.newVersion).toBe('2.0.0');
  });

  it('should represent a failed status with error message', () => {
    const result: SelfUpdateResult = {
      status: 'failed',
      error: 'Permission denied',
    };

    expect(result.status).toBe('failed');
    expect(result.error).toBe('Permission denied');
  });
});

describe('UpdateStatus type', () => {
  it('should accept all valid status values', () => {
    const statuses: UpdateStatus[] = ['idle', 'checking', 'updating', 'restarting', 'failed'];

    expect(statuses).toHaveLength(5);
    expect(statuses).toContain('idle');
    expect(statuses).toContain('checking');
    expect(statuses).toContain('updating');
    expect(statuses).toContain('restarting');
    expect(statuses).toContain('failed');
  });
});
