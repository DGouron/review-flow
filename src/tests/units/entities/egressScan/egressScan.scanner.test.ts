import { createEgressScanner } from '@/modules/platform-integration/entities/egressScan/egressScan.scanner.js';
import type { EgressScanConfig } from '@/modules/platform-integration/entities/egressScan/egressScan.scanner.js';

const baseConfig: EgressScanConfig = {
  secretShapeMode: 'redact',
  lengthMode: 'redact',
  outOfScopeMode: 'redact',
  maxBodyLength: 100,
  redactionMarker: '[REDACTED]',
  truncationMarker: '…[TRUNCATED]',
};

const SECRET = 'glpat-abcdefghij1234567890';

describe('createEgressScanner', () => {
  describe('secret-shape scan (AC2)', () => {
    it('passes a clean body unchanged in any mode', () => {
      const scanner = createEgressScanner(baseConfig);

      const result = scanner.scan({
        body: 'Looks good to me, nicely done.',
        channel: 'postComment',
        projectPath: 'group/project',
      });

      expect(result.decision).toBe('pass');
      if (result.decision === 'pass') {
        expect(result.body).toBe('Looks good to me, nicely done.');
      }
    });

    it('redacts a secret shape with the fixed marker in redact mode', () => {
      const scanner = createEgressScanner(baseConfig);

      const result = scanner.scan({
        body: `token is ${SECRET} here`,
        channel: 'postComment',
        projectPath: 'group/project',
      });

      expect(result.decision).toBe('redact');
      if (result.decision === 'redact') {
        expect(result.body).toBe('token is [REDACTED] here');
        expect(result.body).not.toContain(SECRET);
        expect(result.trace.matchCategoryCounts['secret-shape']).toBe(1);
      }
    });

    it('blocks a secret shape in block mode and emits no body', () => {
      const scanner = createEgressScanner({ ...baseConfig, secretShapeMode: 'block' });

      const result = scanner.scan({
        body: `token is ${SECRET} here`,
        channel: 'postComment',
        projectPath: 'group/project',
      });

      expect(result.decision).toBe('block');
      if (result.decision === 'block') {
        expect(result.trace.matchCategoryCounts['secret-shape']).toBe(1);
      }
    });

    it('passes a secret shape untouched in allow mode', () => {
      const scanner = createEgressScanner({ ...baseConfig, secretShapeMode: 'allow' });

      const result = scanner.scan({
        body: `token is ${SECRET} here`,
        channel: 'postComment',
        projectPath: 'group/project',
      });

      expect(result.decision).toBe('pass');
    });
  });

  describe('length cap (AC3)', () => {
    it('truncates a body over the cap with the truncation marker in redact mode', () => {
      const scanner = createEgressScanner({ ...baseConfig, maxBodyLength: 20 });

      const result = scanner.scan({
        body: 'x'.repeat(100),
        channel: 'postComment',
        projectPath: 'group/project',
      });

      expect(result.decision).toBe('redact');
      if (result.decision === 'redact') {
        expect(result.body.length).toBeLessThanOrEqual(20);
        expect(result.body.endsWith('…[TRUNCATED]')).toBe(true);
        expect(result.trace.matchCategoryCounts['length-cap']).toBe(1);
      }
    });

    it('blocks a body over the cap in block mode', () => {
      const scanner = createEgressScanner({
        ...baseConfig,
        lengthMode: 'block',
        maxBodyLength: 20,
      });

      const result = scanner.scan({
        body: 'x'.repeat(100),
        channel: 'postComment',
        projectPath: 'group/project',
      });

      expect(result.decision).toBe('block');
    });
  });

  describe('out-of-scope reference scan (AC4)', () => {
    it('passes an in-scope project reference', () => {
      const scanner = createEgressScanner(baseConfig);

      const result = scanner.scan({
        body: 'See group/project/src/index.ts for details',
        channel: 'postComment',
        projectPath: 'group/project',
      });

      expect(result.decision).toBe('pass');
    });

    it('redacts a foreign project reference in redact mode', () => {
      const scanner = createEgressScanner(baseConfig);

      const result = scanner.scan({
        body: 'Compare with foreign/secret-repo internals',
        channel: 'postComment',
        projectPath: 'group/project',
      });

      expect(result.decision).toBe('redact');
      if (result.decision === 'redact') {
        expect(result.body).not.toContain('foreign/secret-repo');
        expect(result.trace.matchCategoryCounts['out-of-scope']).toBe(1);
      }
    });

    it('blocks a foreign project reference in block mode', () => {
      const scanner = createEgressScanner({ ...baseConfig, outOfScopeMode: 'block' });

      const result = scanner.scan({
        body: 'Compare with foreign/secret-repo internals',
        channel: 'postComment',
        projectPath: 'group/project',
      });

      expect(result.decision).toBe('block');
    });
  });

  describe('trace metadata carries no secret (AC6)', () => {
    it('never embeds the matched secret value in the trace', () => {
      const scanner = createEgressScanner(baseConfig);

      const result = scanner.scan({
        body: `token ${SECRET}`,
        channel: 'THREAD_REPLY',
        projectPath: 'group/project',
      });

      expect(result.decision).toBe('redact');
      if (result.decision === 'redact') {
        expect(JSON.stringify(result.trace)).not.toContain(SECRET);
        expect(result.trace.channel).toBe('THREAD_REPLY');
        expect(result.trace.mode).toBe('redact');
      }
    });
  });
});
