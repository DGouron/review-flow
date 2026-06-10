import { describe, it, expect } from 'vitest';

import {
  versionCheckResultSchema,
  npmRegistryResponseSchema,
} from '@/modules/cli-configuration/entities/packageVersion/packageVersion.schema.js';
import { PackageVersionFactory } from '@/tests/factories/packageVersion.factory.js';

describe('PackageVersionFactory', () => {
  describe('createVersionCheckResult', () => {
    it('should create a valid VersionCheckResult with defaults', () => {
      const result = PackageVersionFactory.createVersionCheckResult();

      expect(result.currentVersion).toBeDefined();
      expect(result.latestVersion).toBeDefined();
      expect(result.updateAvailable).toBeDefined();
      expect(result.checkedAt).toBeDefined();
      expect(versionCheckResultSchema.safeParse(result).success).toBe(true);
    });

    it('should allow overriding fields', () => {
      const result = PackageVersionFactory.createVersionCheckResult({
        currentVersion: '3.0.0',
        latestVersion: null,
        updateAvailable: false,
      });

      expect(result.currentVersion).toBe('3.0.0');
      expect(result.latestVersion).toBeNull();
      expect(result.updateAvailable).toBe(false);
    });
  });

  describe('createNpmRegistryResponse', () => {
    it('should create a valid npm registry response with defaults', () => {
      const response = PackageVersionFactory.createNpmRegistryResponse();

      expect(response.version).toBeDefined();
      expect(npmRegistryResponseSchema.safeParse(response).success).toBe(true);
    });

    it('should allow overriding version', () => {
      const response = PackageVersionFactory.createNpmRegistryResponse({ version: '5.0.0' });

      expect(response.version).toBe('5.0.0');
    });
  });
});
