import { describe, it, expect } from 'vitest';

import type { WebhookEvent } from '@/modules/platform-integration/entities/webhookEvent/webhookEvent.js';
import {
  processWebhook,
  type ProcessWebhookDependencies,
} from '@/modules/platform-integration/usecases/processWebhook.usecase.js';
import type { TransitionStateResult } from '@/modules/tracking/usecases/tracking/transitionState.usecase.js';
import { TrackedMrFactory } from '@/tests/factories/trackedMr.factory.js';
import { createStubLogger } from '@/tests/stubs/logger.stub.js';

interface Harness {
  deps: ProcessWebhookDependencies;
  handleCloseCalls: Array<{ platform: string; mergeRequestNumber: number }>;
  transitionStateCalls: Array<{ mrId: string; targetState: string }>;
  recordPushCalls: Array<{ projectPath: string; mrNumber: number }>;
  checkFollowupNeededCalls: Array<{ mrNumber: number }>;
  removeWorktreeCalls: Array<{ platform: string }>;
}

function buildHarness(overrides?: Partial<ProcessWebhookDependencies>): Harness {
  const handleCloseCalls: Harness['handleCloseCalls'] = [];
  const transitionStateCalls: Harness['transitionStateCalls'] = [];
  const recordPushCalls: Harness['recordPushCalls'] = [];
  const checkFollowupNeededCalls: Harness['checkFollowupNeededCalls'] = [];
  const removeWorktreeCalls: Harness['removeWorktreeCalls'] = [];

  const deps: ProcessWebhookDependencies = {
    handleClose: async (input) => {
      handleCloseCalls.push({
        platform: input.platform,
        mergeRequestNumber: input.mergeRequestNumber,
      });
      return {
        status: 'cleaned',
        jobCancelled: true,
        trackingArchived: true,
        contextDeleted: true,
      };
    },
    transitionState: {
      execute: (input): TransitionStateResult => {
        transitionStateCalls.push({ mrId: input.mrId, targetState: input.targetState });
        return { ok: true };
      },
    },
    recordPush: {
      execute: (input) => {
        recordPushCalls.push({ projectPath: input.projectPath, mrNumber: input.mrNumber });
        return TrackedMrFactory.create({ mrNumber: input.mrNumber, autoFollowup: true });
      },
    },
    checkFollowupNeeded: {
      execute: (input) => {
        checkFollowupNeededCalls.push({ mrNumber: input.mrNumber });
        return true;
      },
    },
    removeWorktree: async ({ identity }) => {
      removeWorktreeCalls.push({ platform: identity.platform });
      return { status: 'removed' };
    },
    handlePlatformApproval: { execute: () => ({ kind: 'allowed' }) },
    getQualityThreshold: () => null,
    logger: createStubLogger(),
    ...overrides,
  };

  return {
    deps,
    handleCloseCalls,
    transitionStateCalls,
    recordPushCalls,
    checkFollowupNeededCalls,
    removeWorktreeCalls,
  };
}

const closeEvent: WebhookEvent = {
  type: 'close',
  platform: 'gitlab',
  projectPath: 'group/project',
  localPath: '/checkout/project',
  mergeRequestNumber: 42,
};

const mergeEvent: WebhookEvent = {
  type: 'merge',
  platform: 'gitlab',
  projectPath: 'group/project',
  localPath: '/checkout/project',
  mergeRequestNumber: 42,
};

const followupEvent: WebhookEvent = {
  type: 'followup-push',
  platform: 'gitlab',
  projectPath: 'group/project',
  localPath: '/checkout/project',
  mergeRequestNumber: 42,
  mergeRequestUrl: 'https://gitlab.com/group/project/-/merge_requests/42',
  sourceBranch: 'fix-bug',
  targetBranch: 'main',
};

describe('SPEC-073 Stage 3 — processWebhook (acceptance)', () => {
  describe('the orchestrator routes synchronous webhook events without any platform-specific type', () => {
    it('close: delegates to handleClose and returns a closed result', async () => {
      const harness = buildHarness();

      const result = await processWebhook(closeEvent, harness.deps);

      expect(result.type).toBe('closed');
      if (result.type !== 'closed') throw new Error('expected closed');
      expect(result.mergeRequestNumber).toBe(42);
      expect(result.jobCancelled).toBe(true);
      expect(result.trackingArchived).toBe(true);
      expect(harness.handleCloseCalls).toEqual([{ platform: 'gitlab', mergeRequestNumber: 42 }]);
    });

    it('merge: transitions state to merged and removes the worktree best-effort', async () => {
      const harness = buildHarness();

      const result = await processWebhook(mergeEvent, harness.deps);

      expect(result.type).toBe('merged');
      if (result.type !== 'merged') throw new Error('expected merged');
      expect(result.mergeRequestNumber).toBe(42);
      expect(harness.transitionStateCalls).toEqual([
        { mrId: 'gitlab-group/project-42', targetState: 'merged' },
      ]);
      expect(harness.removeWorktreeCalls).toEqual([{ platform: 'gitlab' }]);
    });

    it('merge: stays merged even when worktree removal reports failure', async () => {
      const harness = buildHarness({
        removeWorktree: async () => ({ status: 'failed', warning: 'boom' }),
      });

      const result = await processWebhook(mergeEvent, harness.deps);

      expect(result.type).toBe('merged');
    });
  });

  describe('followup eligibility is decided from tracking state alone', () => {
    it('eligible: records the push, confirms a followup is needed, returns followup-eligible', async () => {
      const harness = buildHarness();

      const result = await processWebhook(followupEvent, harness.deps);

      expect(result.type).toBe('followup-eligible');
      if (result.type !== 'followup-eligible') throw new Error('expected followup-eligible');
      expect(result.mergeRequestNumber).toBe(42);
      expect(harness.recordPushCalls).toEqual([{ projectPath: '/checkout/project', mrNumber: 42 }]);
      expect(harness.checkFollowupNeededCalls).toEqual([{ mrNumber: 42 }]);
    });

    it('skipped: the merge request is not tracked, so no followup is eligible', async () => {
      const harness = buildHarness({
        recordPush: { execute: () => null },
      });

      const result = await processWebhook(followupEvent, harness.deps);

      expect(result.type).toBe('followup-skipped');
    });

    it('skipped: there are no open threads, so checkFollowupNeeded returns false', async () => {
      const harness = buildHarness({
        checkFollowupNeeded: { execute: () => false },
      });

      const result = await processWebhook(followupEvent, harness.deps);

      expect(result.type).toBe('followup-skipped');
    });

    it('skipped: auto-followup is disabled on the tracked merge request', async () => {
      const harness = buildHarness({
        recordPush: {
          execute: () => TrackedMrFactory.create({ mrNumber: 42, autoFollowup: false }),
        },
      });

      const result = await processWebhook(followupEvent, harness.deps);

      expect(result.type).toBe('followup-skipped');
      if (result.type !== 'followup-skipped') throw new Error('expected followup-skipped');
      expect(result.reason).toBe('Auto-followup disabled');
    });
  });

  describe('events the controller still owns are acknowledged as ignored', () => {
    it('ignored: passes the reason straight through', async () => {
      const harness = buildHarness();

      const result = await processWebhook(
        { type: 'ignored', reason: 'Not a MR event' },
        harness.deps,
      );

      expect(result).toEqual({ type: 'ignored', reason: 'Not a MR event' });
    });
  });
});
