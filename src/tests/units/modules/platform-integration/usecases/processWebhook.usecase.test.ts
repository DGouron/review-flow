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
  handleCloseCalls: Array<{ platform: string; mergeRequestNumber: number; localPath: string }>;
  transitionStateCalls: Array<{ projectPath: string; mrId: string; targetState: string }>;
  recordPushCalls: Array<{ projectPath: string; mrNumber: number; platform: string }>;
  checkFollowupNeededCalls: Array<{ projectPath: string; mrNumber: number; platform: string }>;
  removeWorktreeCalls: Array<{ platform: string; sourceCheckoutPath: string }>;
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
        localPath: input.localPath,
      });
      return {
        status: 'cleaned',
        jobCancelled: true,
        trackingArchived: false,
        contextDeleted: true,
      };
    },
    transitionState: {
      execute: (input): TransitionStateResult => {
        transitionStateCalls.push({
          projectPath: input.projectPath,
          mrId: input.mrId,
          targetState: input.targetState,
        });
        return { ok: true };
      },
    },
    recordPush: {
      execute: (input) => {
        recordPushCalls.push({
          projectPath: input.projectPath,
          mrNumber: input.mrNumber,
          platform: input.platform,
        });
        return TrackedMrFactory.create({ mrNumber: input.mrNumber, autoFollowup: true });
      },
    },
    checkFollowupNeeded: {
      execute: (input) => {
        checkFollowupNeededCalls.push({
          projectPath: input.projectPath,
          mrNumber: input.mrNumber,
          platform: input.platform,
        });
        return true;
      },
    },
    removeWorktree: async ({ identity, sourceCheckoutPath }) => {
      removeWorktreeCalls.push({ platform: identity.platform, sourceCheckoutPath });
      return { status: 'removed' };
    },
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

const baseClose: WebhookEvent = {
  type: 'close',
  platform: 'github',
  projectPath: 'org/repo',
  localPath: '/checkout/repo',
  mergeRequestNumber: 7,
};

const baseMerge: WebhookEvent = {
  type: 'merge',
  platform: 'gitlab',
  projectPath: 'group/project',
  localPath: '/checkout/project',
  mergeRequestNumber: 42,
};

function followupFor(mrNumber: number): WebhookEvent {
  return {
    type: 'followup-push',
    platform: 'gitlab',
    projectPath: 'group/project',
    localPath: '/checkout/project',
    mergeRequestNumber: mrNumber,
    mergeRequestUrl: `https://gitlab.com/group/project/-/merge_requests/${mrNumber}`,
    sourceBranch: 'fix-bug',
    targetBranch: 'main',
  };
}

describe('processWebhook', () => {
  describe('close', () => {
    it('delegates to handleClose with the platform-neutral identity', async () => {
      const harness = buildHarness();

      const result = await processWebhook(baseClose, harness.deps);

      expect(harness.handleCloseCalls).toEqual([
        { platform: 'github', mergeRequestNumber: 7, localPath: '/checkout/repo' },
      ]);
      expect(result).toEqual({
        type: 'closed',
        mergeRequestNumber: 7,
        jobCancelled: true,
        trackingArchived: false,
      });
    });
  });

  describe('merge', () => {
    it('transitions tracking state to merged using the platform-prefixed id', async () => {
      const harness = buildHarness();

      const result = await processWebhook(baseMerge, harness.deps);

      expect(harness.transitionStateCalls).toEqual([
        {
          projectPath: '/checkout/project',
          mrId: 'gitlab-group/project-42',
          targetState: 'merged',
        },
      ]);
      expect(result).toEqual({ type: 'merged', mergeRequestNumber: 42 });
    });

    it('removes the worktree best-effort with the source checkout path', async () => {
      const harness = buildHarness();

      await processWebhook(baseMerge, harness.deps);

      expect(harness.removeWorktreeCalls).toEqual([
        { platform: 'gitlab', sourceCheckoutPath: '/checkout/project' },
      ]);
    });

    it('returns merged even when worktree removal throws', async () => {
      const harness = buildHarness({
        removeWorktree: async () => {
          throw new Error('exploded');
        },
      });

      const result = await processWebhook(baseMerge, harness.deps);

      expect(result).toEqual({ type: 'merged', mergeRequestNumber: 42 });
    });
  });

  describe('followup-push', () => {
    it('records the push then checks followup eligibility', async () => {
      const harness = buildHarness();

      const result = await processWebhook(followupFor(42), harness.deps);

      expect(harness.recordPushCalls).toEqual([
        { projectPath: '/checkout/project', mrNumber: 42, platform: 'gitlab' },
      ]);
      expect(harness.checkFollowupNeededCalls).toEqual([
        { projectPath: '/checkout/project', mrNumber: 42, platform: 'gitlab' },
      ]);
      expect(result).toEqual({ type: 'followup-eligible', mergeRequestNumber: 42 });
    });

    it('skips when the merge request is not tracked', async () => {
      const harness = buildHarness({ recordPush: { execute: () => null } });

      const result = await processWebhook(followupFor(42), harness.deps);

      expect(harness.checkFollowupNeededCalls).toEqual([]);
      expect(result).toEqual({
        type: 'followup-skipped',
        mergeRequestNumber: 42,
        reason: 'Merge request not tracked',
      });
    });

    it('skips when no followup is needed', async () => {
      const harness = buildHarness({ checkFollowupNeeded: { execute: () => false } });

      const result = await processWebhook(followupFor(42), harness.deps);

      expect(result).toEqual({
        type: 'followup-skipped',
        mergeRequestNumber: 42,
        reason: 'No followup needed',
      });
    });

    it('skips when auto-followup is disabled on the tracked merge request', async () => {
      const harness = buildHarness({
        recordPush: {
          execute: () => TrackedMrFactory.create({ mrNumber: 42, autoFollowup: false }),
        },
      });

      const result = await processWebhook(followupFor(42), harness.deps);

      expect(result).toEqual({
        type: 'followup-skipped',
        mergeRequestNumber: 42,
        reason: 'Auto-followup disabled',
      });
    });
  });

  describe('events the controller still owns', () => {
    it('treats review-requested as handled by the controller', async () => {
      const harness = buildHarness();

      const result = await processWebhook(
        {
          type: 'review-requested',
          platform: 'gitlab',
          projectPath: 'group/project',
          localPath: '/checkout/project',
          mergeRequestNumber: 42,
          mergeRequestUrl: 'https://gitlab.com/group/project/-/merge_requests/42',
          sourceBranch: 'fix-bug',
          targetBranch: 'main',
          title: 'Fix bug',
          description: null,
          assignedBy: { username: 'alice', displayName: null },
          skill: 'review',
          language: null,
        },
        harness.deps,
      );

      expect(result).toEqual({
        type: 'ignored',
        reason: 'review-requested-handled-by-controller',
      });
    });

    it('treats approve as handled by the controller', async () => {
      const harness = buildHarness();

      const result = await processWebhook(
        {
          type: 'approve',
          platform: 'gitlab',
          projectPath: 'group/project',
          localPath: '/checkout/project',
          mergeRequestNumber: 42,
        },
        harness.deps,
      );

      expect(result).toEqual({ type: 'ignored', reason: 'approve-handled-by-controller' });
    });
  });

  describe('ignored', () => {
    it('passes the reason straight through', async () => {
      const harness = buildHarness();

      const result = await processWebhook(
        { type: 'ignored', reason: 'Not a MR event' },
        harness.deps,
      );

      expect(result).toEqual({ type: 'ignored', reason: 'Not a MR event' });
    });
  });
});
