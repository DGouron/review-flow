/**
 * SPEC-209 — Guard oversized merge requests (outer-loop acceptance test, SDD)
 *
 * Exercises the size guard end-to-end at the controller-helper seam: the real
 * GuardDiffSizeUseCase resolving a per-project budget, fetching per-file changes
 * through a stub gateway, running the pure gate, and the applyDiffSizeGuard
 * helper acting on the verdict (skip enqueue / revoke + FR comment). Covers both
 * GitLab and GitHub.
 *
 * Scenarios from docs/specs/209-mr-size-guard.md:
 *   - under budget gitlab: not oversized → allowed, no comment
 *   - over budget gitlab review: oversized → blocked + FR split comment, no revoke
 *   - over budget gitlab approve: oversized → blocked + revoke + FR split comment
 *   - over budget followup: oversized → blocked, no comment (anti-spam)
 *   - lockfiles/package.json excluded: not oversized
 *   - fetch failure: fail-open → allowed, no comment
 */

import { beforeEach, describe, expect, it } from 'vitest';

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

const BUDGET = 2000;

describe('Acceptance — SPEC-209: Guard oversized merge requests', () => {
  let harness: Harness;

  beforeEach(() => {
    harness = buildHarness();
  });

  describe('Rule: a non-oversized MR is processed exactly as before', () => {
    it('under budget gitlab review → not blocked, no comment, no revocation', async () => {
      harness.changedFilesGateway.setResponse(
        42,
        ChangedFilesFactory.list([{ path: 'src/a.ts', additions: 50, deletions: 10 }]),
      );

      const result = await applyDiffSizeGuard({
        projectIdentifier: 'group/project',
        localPath: '/repo/project',
        mergeRequestNumber: 42,
        mode: 'review',
        deps: {
          guardDiffSize: harness.guardDiffSize,
          getMaxDiffLines: () => BUDGET,
          noteCommentPostGateway: harness.noteCommentPostGateway,
          approvalRevocationGateway: harness.approvalRevocationGateway,
        },
        logger: silentLogger,
      });

      expect(result.blocked).toBe(false);
      expect(harness.noteCommentPostGateway.calls).toHaveLength(0);
      expect(harness.approvalRevocationGateway.calls).toHaveLength(0);
    });

    it('lockfiles and package.json are excluded from the counted size', async () => {
      harness.changedFilesGateway.setResponse(
        7,
        ChangedFilesFactory.list([
          { path: 'yarn.lock', additions: 5000, deletions: 0 },
          { path: 'package.json', additions: 3000, deletions: 0 },
          { path: 'src/a.ts', additions: 30, deletions: 0 },
        ]),
      );

      const result = await applyDiffSizeGuard({
        projectIdentifier: 'group/project',
        localPath: '/repo/project',
        mergeRequestNumber: 7,
        mode: 'review',
        deps: {
          guardDiffSize: harness.guardDiffSize,
          getMaxDiffLines: () => BUDGET,
          noteCommentPostGateway: harness.noteCommentPostGateway,
          approvalRevocationGateway: harness.approvalRevocationGateway,
        },
        logger: silentLogger,
      });

      expect(result.blocked).toBe(false);
      expect(harness.noteCommentPostGateway.calls).toHaveLength(0);
    });
  });

  describe('Rule: an oversized MR requesting a review is blocked with a FR split comment', () => {
    it('over budget gitlab review → blocked, FR comment posted, no revocation', async () => {
      harness.changedFilesGateway.setResponse(
        42,
        ChangedFilesFactory.list([{ path: 'src/big.ts', additions: 2000, deletions: 500 }]),
      );

      const result = await applyDiffSizeGuard({
        projectIdentifier: 'group/project',
        localPath: '/repo/project',
        mergeRequestNumber: 42,
        mode: 'review',
        deps: {
          guardDiffSize: harness.guardDiffSize,
          getMaxDiffLines: () => BUDGET,
          noteCommentPostGateway: harness.noteCommentPostGateway,
          approvalRevocationGateway: harness.approvalRevocationGateway,
        },
        logger: silentLogger,
      });

      expect(result.blocked).toBe(true);
      expect(harness.approvalRevocationGateway.calls).toHaveLength(0);
      expect(harness.noteCommentPostGateway.calls).toHaveLength(1);
      const comment = harness.noteCommentPostGateway.calls[0];
      expect(comment?.projectPath).toBe('group/project');
      expect(comment?.mrNumber).toBe(42);
      expect(comment?.body).toContain('2500');
      expect(comment?.body).toContain('2000');
    });
  });

  describe('Rule: an oversized MR approval is revoked with a FR split comment', () => {
    it('over budget github approve → blocked, revocation + FR comment', async () => {
      harness.changedFilesGateway.setResponse(
        99,
        ChangedFilesFactory.list([{ path: 'src/huge.ts', additions: 2400, deletions: 100 }]),
      );

      const result = await applyDiffSizeGuard({
        projectIdentifier: 'owner/repo',
        localPath: '/repo/project',
        mergeRequestNumber: 99,
        mode: 'approve',
        revokeArgs: { reviewId: 555, dismissalMessage: 'oversized' },
        deps: {
          guardDiffSize: harness.guardDiffSize,
          getMaxDiffLines: () => BUDGET,
          noteCommentPostGateway: harness.noteCommentPostGateway,
          approvalRevocationGateway: harness.approvalRevocationGateway,
        },
        logger: silentLogger,
      });

      expect(result.blocked).toBe(true);
      expect(harness.approvalRevocationGateway.calls).toHaveLength(1);
      expect(harness.approvalRevocationGateway.calls[0]?.projectPath).toBe('owner/repo');
      expect(harness.approvalRevocationGateway.calls[0]?.reviewId).toBe(555);
      expect(harness.noteCommentPostGateway.calls).toHaveLength(1);
      expect(harness.noteCommentPostGateway.calls[0]?.body).toContain('2500');
    });
  });

  describe('Rule: an oversized follow-up push is blocked silently (anti-spam)', () => {
    it('over budget followup → blocked, no comment, no revocation', async () => {
      harness.changedFilesGateway.setResponse(
        42,
        ChangedFilesFactory.list([{ path: 'src/big.ts', additions: 2400, deletions: 200 }]),
      );

      const result = await applyDiffSizeGuard({
        projectIdentifier: 'group/project',
        localPath: '/repo/project',
        mergeRequestNumber: 42,
        mode: 'followup',
        deps: {
          guardDiffSize: harness.guardDiffSize,
          getMaxDiffLines: () => BUDGET,
          noteCommentPostGateway: harness.noteCommentPostGateway,
          approvalRevocationGateway: harness.approvalRevocationGateway,
        },
        logger: silentLogger,
      });

      expect(result.blocked).toBe(true);
      expect(harness.noteCommentPostGateway.calls).toHaveLength(0);
      expect(harness.approvalRevocationGateway.calls).toHaveLength(0);
    });
  });

  describe('Rule: the guard is fail-open when changed files cannot be fetched', () => {
    it('fetch failure → not blocked, no comment (processed normally)', async () => {
      harness.changedFilesGateway.setFailure(42);

      const result = await applyDiffSizeGuard({
        projectIdentifier: 'group/project',
        localPath: '/repo/project',
        mergeRequestNumber: 42,
        mode: 'review',
        deps: {
          guardDiffSize: harness.guardDiffSize,
          getMaxDiffLines: () => BUDGET,
          noteCommentPostGateway: harness.noteCommentPostGateway,
          approvalRevocationGateway: harness.approvalRevocationGateway,
        },
        logger: silentLogger,
      });

      expect(result.blocked).toBe(false);
      expect(harness.noteCommentPostGateway.calls).toHaveLength(0);
    });
  });
});
