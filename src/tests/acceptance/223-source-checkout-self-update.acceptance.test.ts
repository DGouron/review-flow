import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { describe, it, expect } from 'vitest';

import type { SelfUpdateRefusalMotive } from '@/modules/cli-configuration/entities/selfUpdateSequence/selfUpdateRefusalMotive.js';
import { versionRoutes } from '@/modules/cli-configuration/interface-adapters/controllers/http/version.routes.js';
import { checkVersion } from '@/modules/cli-configuration/usecases/version/checkVersion.usecase.js';
import { runSourceCheckoutSelfUpdate } from '@/modules/cli-configuration/usecases/version/runSourceCheckoutSelfUpdate.usecase.js';
import { triggerSelfUpdate } from '@/modules/cli-configuration/usecases/version/triggerSelfUpdate.usecase.js';
import { StubInstallTypeDetector } from '@/tests/stubs/installTypeDetector.stub.js';
import { StubPackageVersionGateway } from '@/tests/stubs/packageVersion.stub.js';
import { StubQueueActivity } from '@/tests/stubs/queueActivity.stub.js';
import { StubSelfUpdateCommand } from '@/tests/stubs/selfUpdate.stub.js';
import { StubSourceCheckoutUpdate } from '@/tests/stubs/sourceCheckoutUpdate.stub.js';
import { StubVersionCache } from '@/tests/stubs/versionCache.stub.js';

const LOCAL_ORIGIN = '127.0.0.1';
const REMOTE_ORIGIN = '203.0.113.5';

async function buildVersionRoutesApplication(): Promise<FastifyInstance> {
  const application = Fastify();
  await application.register(versionRoutes, {
    checkVersion,
    triggerSelfUpdate,
    currentVersion: '1.0.0',
    packageVersionGateway: new StubPackageVersionGateway('2.0.0'),
    versionCache: new StubVersionCache(null, true),
    selfUpdateCommand: new StubSelfUpdateCommand(true),
    installTypeDetector: new StubInstallTypeDetector('source-checkout'),
    serverPort: 3000,
    queueActivityGateway: new StubQueueActivity(0),
    sourceCheckoutUpdateGateway: new StubSourceCheckoutUpdate(),
  });
  await application.ready();
  return application;
}

describe('SPEC-223 source-checkout self-update (acceptance)', () => {
  describe('usecase-level — trigger and gating', () => {
    it('scenario: nominal — fetches, rebuilds and starts on a clean checkout with new commits', async () => {
      const result = await triggerSelfUpdate(
        { requestOrigin: LOCAL_ORIGIN },
        {
          selfUpdateCommand: new StubSelfUpdateCommand(true),
          installTypeDetector: new StubInstallTypeDetector('source-checkout'),
          queueActivityGateway: new StubQueueActivity(0),
          sourceCheckoutUpdateGateway: new StubSourceCheckoutUpdate(),
        },
      );

      expect(result).toEqual({ status: 'started' });
    });

    it('scenario: already current — fetching without new commits still rebuilds and restarts', async () => {
      const sourceCheckoutUpdateGateway = new StubSourceCheckoutUpdate({
        fetchResult: { success: true, error: null },
      });

      const result = await runSourceCheckoutSelfUpdate({ sourceCheckoutUpdateGateway });

      expect(result).toEqual({ status: 'started' });
      expect(sourceCheckoutUpdateGateway.calls).toContain('rebuild');
    });

    it('scenario: remote request — refuses "local machine only" and executes nothing', async () => {
      const queueActivityGateway = new StubQueueActivity(0);
      const installTypeDetector = new StubInstallTypeDetector('source-checkout');

      const result = await triggerSelfUpdate(
        { requestOrigin: REMOTE_ORIGIN },
        {
          selfUpdateCommand: new StubSelfUpdateCommand(true),
          installTypeDetector,
          queueActivityGateway,
          sourceCheckoutUpdateGateway: new StubSourceCheckoutUpdate(),
        },
      );

      expect(result).toEqual({ status: 'refused', motive: { kind: 'local-only' } });
      expect(queueActivityGateway.calls).toBe(0);
      expect(installTypeDetector.calls).toBe(0);
    });

    it('scenario: review running — refuses with the total count of running and waiting reviews', async () => {
      const result = await triggerSelfUpdate(
        { requestOrigin: LOCAL_ORIGIN },
        {
          selfUpdateCommand: new StubSelfUpdateCommand(true),
          installTypeDetector: new StubInstallTypeDetector('source-checkout'),
          queueActivityGateway: new StubQueueActivity(2),
          sourceCheckoutUpdateGateway: new StubSourceCheckoutUpdate(),
        },
      );

      expect(result).toEqual({
        status: 'refused',
        motive: { kind: 'reviews-in-progress', count: 2 },
      });
    });

    it('scenario: wrong branch — refuses when the checkout is not on master', async () => {
      const sourceCheckoutUpdateGateway = new StubSourceCheckoutUpdate({
        currentBranch: 'feat/223-source-checkout-self-update',
      });

      const result = await runSourceCheckoutSelfUpdate({ sourceCheckoutUpdateGateway });

      expect(result).toEqual({ status: 'refused', motive: { kind: 'wrong-branch' } });
    });

    it('scenario: dirty checkout — refuses when there are uncommitted local changes', async () => {
      const sourceCheckoutUpdateGateway = new StubSourceCheckoutUpdate({
        hasUncommittedChanges: true,
      });

      const result = await runSourceCheckoutSelfUpdate({ sourceCheckoutUpdateGateway });

      expect(result).toEqual({ status: 'refused', motive: { kind: 'dirty-checkout' } });
    });

    it('scenario: missing tool — refuses naming the tool that could not be resolved', async () => {
      const sourceCheckoutUpdateGateway = new StubSourceCheckoutUpdate({
        toolPaths: { git: '/usr/bin/git', yarn: null },
      });

      const result = await runSourceCheckoutSelfUpdate({ sourceCheckoutUpdateGateway });

      expect(result).toEqual({ status: 'refused', motive: { kind: 'missing-tool', tool: 'yarn' } });
    });
  });

  describe('usecase-level — executing the sequence', () => {
    it('scenario: fetch conflict — stops before rebuild and reports the conflict detail', async () => {
      const sourceCheckoutUpdateGateway = new StubSourceCheckoutUpdate({
        fetchResult: {
          success: false,
          error: 'CONFLICT (content): Merge conflict in src/index.ts',
        },
      });

      const result = await runSourceCheckoutSelfUpdate({ sourceCheckoutUpdateGateway });

      expect(result).toEqual({
        status: 'refused',
        motive: {
          kind: 'fetch-failed',
          detail: 'CONFLICT (content): Merge conflict in src/index.ts',
        },
      });
      expect(sourceCheckoutUpdateGateway.calls).not.toContain('rebuild');
    });

    it('scenario: no remote branch — stops before rebuild and reports the detail', async () => {
      const sourceCheckoutUpdateGateway = new StubSourceCheckoutUpdate({
        fetchResult: {
          success: false,
          error: 'There is no tracking information for the current branch',
        },
      });

      const result = await runSourceCheckoutSelfUpdate({ sourceCheckoutUpdateGateway });

      expect(result).toEqual({
        status: 'refused',
        motive: {
          kind: 'fetch-failed',
          detail: 'There is no tracking information for the current branch',
        },
      });
      expect(sourceCheckoutUpdateGateway.calls).not.toContain('rebuild');
    });

    it('scenario: rebuild fails — never restarts, server keeps its previous build', async () => {
      const sourceCheckoutUpdateGateway = new StubSourceCheckoutUpdate({
        rebuildResult: { success: false, error: 'error TS2322: Type mismatch' },
      });

      const result = await runSourceCheckoutSelfUpdate({ sourceCheckoutUpdateGateway });

      expect(result).toEqual({ status: 'refused', motive: { kind: 'rebuild-failed' } });
    });
  });

  describe('usecase-level — global-install path shares the two preconditions', () => {
    it('scenario: global install, nothing running — existing update path runs unchanged', async () => {
      const result = await triggerSelfUpdate(
        { requestOrigin: LOCAL_ORIGIN },
        {
          selfUpdateCommand: new StubSelfUpdateCommand(true),
          installTypeDetector: new StubInstallTypeDetector('global-npm'),
          queueActivityGateway: new StubQueueActivity(0),
          sourceCheckoutUpdateGateway: new StubSourceCheckoutUpdate(),
        },
      );

      expect(result).toEqual({ status: 'started' });
    });

    it('scenario: global install, review running — refuses without reinstalling', async () => {
      const selfUpdateCommand = new StubSelfUpdateCommand(true);

      const result = await triggerSelfUpdate(
        { requestOrigin: LOCAL_ORIGIN },
        {
          selfUpdateCommand,
          installTypeDetector: new StubInstallTypeDetector('global-npm'),
          queueActivityGateway: new StubQueueActivity(1),
          sourceCheckoutUpdateGateway: new StubSourceCheckoutUpdate(),
        },
      );

      expect(result).toEqual({
        status: 'refused',
        motive: { kind: 'reviews-in-progress', count: 1 },
      });
    });

    it('scenario: global install, remote request — refuses "local machine only"', async () => {
      const result = await triggerSelfUpdate(
        { requestOrigin: REMOTE_ORIGIN },
        {
          selfUpdateCommand: new StubSelfUpdateCommand(true),
          installTypeDetector: new StubInstallTypeDetector('global-npm'),
          queueActivityGateway: new StubQueueActivity(0),
          sourceCheckoutUpdateGateway: new StubSourceCheckoutUpdate(),
        },
      );

      expect(result).toEqual({ status: 'refused', motive: { kind: 'local-only' } });
    });
  });

  describe('route-level — request.ip gates the sequence', () => {
    it('scenario: nominal — a local request reaches the update sequence and starts it', async () => {
      const application = await buildVersionRoutesApplication();

      const response = await application.inject({
        method: 'POST',
        url: '/api/version/update',
        remoteAddress: LOCAL_ORIGIN,
      });

      const body: { status: string } = JSON.parse(response.body);
      expect(body.status).toBe('started');
    });

    it('scenario: remote request — a request from another machine never reaches any gateway', async () => {
      const application = await buildVersionRoutesApplication();

      const response = await application.inject({
        method: 'POST',
        url: '/api/version/update',
        remoteAddress: REMOTE_ORIGIN,
      });

      const body: { status: string; motive?: { kind: string } } = JSON.parse(response.body);
      expect(response.statusCode).toBe(200);
      expect(body.status).toBe('refused');
      expect(body.motive).toEqual({ kind: 'local-only' });
    });
  });

  describe('dashboard-level — bilingual refusal wording (iteration 3, not yet implemented)', () => {
    it('scenario: refusal wording in English — the same motive is worded in English', async () => {
      const dashboardModule: {
        resolveRefusalWording: (
          motive: SelfUpdateRefusalMotive,
          translate: (key: string, params?: Record<string, string | number>) => string,
        ) => string;
      } = await import('@/dashboard/modules/versionUpdate.js');

      const french = dashboardModule.resolveRefusalWording(
        { kind: 'reviews-in-progress', count: 1 },
        (key: string) => key,
      );
      const english = dashboardModule.resolveRefusalWording(
        { kind: 'reviews-in-progress', count: 1 },
        (key: string) => `en:${key}`,
      );

      expect(english).not.toBe(french);
      expect(english).toContain('1');
    });
  });
});
