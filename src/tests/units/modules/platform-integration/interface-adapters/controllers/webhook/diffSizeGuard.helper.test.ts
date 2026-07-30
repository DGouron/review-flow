import { describe, it, expect, beforeEach } from 'vitest';

import { applyDiffSizeGuard } from '@/modules/platform-integration/interface-adapters/controllers/webhook/diffSizeGuard.helper.js';
import { GuardDiffSizeUseCase } from '@/modules/platform-integration/usecases/guardDiffSize.usecase.js';
import { ChangedFilesFactory } from '@/tests/factories/changedFiles.factory.js';
import { StubApprovalRevocationGateway } from '@/tests/stubs/approvalRevocation.stub.js';
import { StubChangedFilesFetchGateway } from '@/tests/stubs/changedFilesFetch.stub.js';
import { StubNoteCommentPostGateway } from '@/tests/stubs/noteCommentPost.stub.js';

const silentLogger = {
  warn: () => undefined,
  info: () => undefined,
  debug: () => undefined,
};

interface Harness {
  changedFilesGateway: StubChangedFilesFetchGateway;
  guardDiffSize: GuardDiffSizeUseCase;
  noteCommentPostGateway: StubNoteCommentPostGateway;
  approvalRevocationGateway: StubApprovalRevocationGateway;
}

function buildHarness(): Harness {
  const changedFilesGateway = new StubChangedFilesFetchGateway();
  return {
    changedFilesGateway,
    guardDiffSize: new GuardDiffSizeUseCase({ changedFilesFetchGateway: changedFilesGateway }),
    noteCommentPostGateway: new StubNoteCommentPostGateway(),
    approvalRevocationGateway: new StubApprovalRevocationGateway(),
  };
}

const OVERSIZED = ChangedFilesFactory.list([
  { path: 'src/big.ts', additions: 2400, deletions: 200 },
]);
const UNDER_BUDGET = ChangedFilesFactory.list([{ path: 'src/a.ts', additions: 50, deletions: 10 }]);

function depsOf(harness: Harness) {
  return {
    guardDiffSize: harness.guardDiffSize,
    getMaxDiffLines: () => 2000,
    noteCommentPostGateway: harness.noteCommentPostGateway,
    approvalRevocationGateway: harness.approvalRevocationGateway,
  };
}

describe('applyDiffSizeGuard', () => {
  let harness: Harness;

  beforeEach(() => {
    harness = buildHarness();
  });

  it('review mode: blocked posts a comment and does not revoke', async () => {
    harness.changedFilesGateway.setResponse(42, OVERSIZED);

    const result = await applyDiffSizeGuard({
      projectIdentifier: 'group/project',
      localPath: '/repo',
      mergeRequestNumber: 42,
      mode: 'review',
      deps: depsOf(harness),
      logger: silentLogger,
    });

    expect(result.blocked).toBe(true);
    if (result.blocked) {
      expect(result.countedLines).toBe(2600);
      expect(result.budget).toBe(2000);
      expect(result.message).toContain('2600');
    }
    expect(harness.noteCommentPostGateway.calls).toHaveLength(1);
    expect(harness.noteCommentPostGateway.calls[0]?.projectPath).toBe('group/project');
    expect(harness.noteCommentPostGateway.calls[0]?.mrNumber).toBe(42);
    expect(harness.approvalRevocationGateway.calls).toHaveLength(0);
  });

  it('approve mode: blocked revokes and then posts a comment', async () => {
    harness.changedFilesGateway.setResponse(99, OVERSIZED);

    const result = await applyDiffSizeGuard({
      projectIdentifier: 'owner/repo',
      localPath: '/repo',
      mergeRequestNumber: 99,
      mode: 'approve',
      revokeArgs: { reviewId: 555, dismissalMessage: 'oversized' },
      deps: depsOf(harness),
      logger: silentLogger,
    });

    expect(result.blocked).toBe(true);
    expect(harness.approvalRevocationGateway.calls).toHaveLength(1);
    expect(harness.approvalRevocationGateway.calls[0]?.projectPath).toBe('owner/repo');
    expect(harness.approvalRevocationGateway.calls[0]?.mrNumber).toBe(99);
    expect(harness.approvalRevocationGateway.calls[0]?.reviewId).toBe(555);
    expect(harness.noteCommentPostGateway.calls).toHaveLength(1);
  });

  it('followup mode: blocked stays silent (no comment, no revoke)', async () => {
    harness.changedFilesGateway.setResponse(42, OVERSIZED);

    const result = await applyDiffSizeGuard({
      projectIdentifier: 'group/project',
      localPath: '/repo',
      mergeRequestNumber: 42,
      mode: 'followup',
      deps: depsOf(harness),
      logger: silentLogger,
    });

    expect(result.blocked).toBe(true);
    expect(harness.noteCommentPostGateway.calls).toHaveLength(0);
    expect(harness.approvalRevocationGateway.calls).toHaveLength(0);
  });

  it('not blocked when under budget (no comment, no revoke)', async () => {
    harness.changedFilesGateway.setResponse(42, UNDER_BUDGET);

    const result = await applyDiffSizeGuard({
      projectIdentifier: 'group/project',
      localPath: '/repo',
      mergeRequestNumber: 42,
      mode: 'review',
      deps: depsOf(harness),
      logger: silentLogger,
    });

    expect(result.blocked).toBe(false);
    expect(harness.noteCommentPostGateway.calls).toHaveLength(0);
    expect(harness.approvalRevocationGateway.calls).toHaveLength(0);
  });

  it('still reports blocked when the revocation gateway throws (best-effort)', async () => {
    harness.changedFilesGateway.setResponse(99, OVERSIZED);
    harness.approvalRevocationGateway.shouldThrow = true;

    const result = await applyDiffSizeGuard({
      projectIdentifier: 'owner/repo',
      localPath: '/repo',
      mergeRequestNumber: 99,
      mode: 'approve',
      revokeArgs: { reviewId: 555 },
      deps: depsOf(harness),
      logger: silentLogger,
    });

    expect(result.blocked).toBe(true);
    expect(harness.noteCommentPostGateway.calls).toHaveLength(1);
  });

  it('still reports blocked when the comment gateway throws (best-effort)', async () => {
    harness.changedFilesGateway.setResponse(42, OVERSIZED);
    const throwingComment = {
      calls: harness.noteCommentPostGateway.calls,
      postComment: async () => {
        throw new Error('comment failed');
      },
      postThreadReply: async () => {
        throw new Error('reply failed');
      },
    };

    const result = await applyDiffSizeGuard({
      projectIdentifier: 'group/project',
      localPath: '/repo',
      mergeRequestNumber: 42,
      mode: 'review',
      deps: { ...depsOf(harness), noteCommentPostGateway: throwingComment },
      logger: silentLogger,
    });

    expect(result.blocked).toBe(true);
  });

  it('fail-open: not blocked when the changed files fetch fails', async () => {
    harness.changedFilesGateway.setFailure(42);

    const result = await applyDiffSizeGuard({
      projectIdentifier: 'group/project',
      localPath: '/repo',
      mergeRequestNumber: 42,
      mode: 'review',
      deps: depsOf(harness),
      logger: silentLogger,
    });

    expect(result.blocked).toBe(false);
    expect(harness.noteCommentPostGateway.calls).toHaveLength(0);
  });
});
