/**
 * SPEC-225 — Carry the whole thread conversation into the review context
 *
 * Outer-loop acceptance test (SDD): drives the REAL thread-fetch gateways through a fake
 * argv executor, persists what they return with the REAL ReviewContextFileSystemGateway,
 * and reads it back through the REAL getThreads use case — the path an MCP consumer takes.
 *
 * Scenarios from docs/specs/225-carry-thread-conversation.md:
 *   1. multi-comment GitHub thread   → body is the opener, comments ordered oldest first
 *   2. GitHub thread, deleted author → author null, conversation intact
 *   3. multi-note GitLab discussion  → every note becomes a comment
 *   4. injected project path         → value stays one argv element, no shell
 *   5. older context file            → parses, threads readable
 *   6. MCP consumer                  → get_threads returns the conversation untouched
 */

import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

import { GitHubThreadFetchGateway } from '@/modules/platform-integration/interface-adapters/gateways/threadFetch.github.gateway.js';
import { GitLabThreadFetchGateway } from '@/modules/platform-integration/interface-adapters/gateways/threadFetch.gitlab.gateway.js';
import { JobContextMemoryGateway } from '@/modules/review-execution/interface-adapters/gateways/jobContext.memory.gateway.js';
import { ReviewContextFileSystemGateway } from '@/modules/review-execution/interface-adapters/gateways/reviewContext.fileSystem.gateway.js';
import { getThreads } from '@/modules/review-execution/usecases/mcp/getThreads.usecase.js';

import { GitHubApiResponseFactory } from '../factories/githubApiResponse.factory.js';
import { GitLabApiResponseFactory } from '../factories/gitlabApiResponse.factory.js';

describe('Acceptance — SPEC-225: Carry the whole thread conversation', () => {
  let localPath: string;
  let jobContextGateway: JobContextMemoryGateway;
  let reviewContextGateway: ReviewContextFileSystemGateway;

  beforeEach(() => {
    localPath = mkdtempSync(join(tmpdir(), 'spec-225-'));
    jobContextGateway = new JobContextMemoryGateway();
    reviewContextGateway = new ReviewContextFileSystemGateway();
  });

  describe('Rule: a thread carries its ordered conversation, opener first', () => {
    it('multi-comment GitHub thread: the review agent reads the author replies through get_threads', () => {
      const githubResponse = GitHubApiResponseFactory.createReviewThreadsResponse([
        {
          id: 'PRRT_1',
          isResolved: false,
          path: 'src/gateway.ts',
          line: 88,
          body: 'Nullable access not guarded',
          comments: [
            {
              author: 'maintainer',
              body: 'Nullable access not guarded',
              createdAt: '2026-08-01T10:00:00Z',
            },
            {
              author: 'maintainer',
              body: 'Intentional, the gateway already guarantees non-null',
              createdAt: '2026-08-01T11:00:00Z',
            },
          ],
        },
      ]);

      const gateway = new GitHubThreadFetchGateway(() => githubResponse);
      const threads = gateway.fetchThreads('owner/repo', 1421);

      const mergeRequestId = 'github-owner-repo-1421';
      reviewContextGateway.create({
        localPath,
        mergeRequestId,
        platform: 'github',
        projectPath: 'owner/repo',
        mergeRequestNumber: 1421,
        threads,
      });

      const jobId = 'github:owner/repo:1421';
      jobContextGateway.register(jobId, { localPath, mergeRequestId });

      const result = getThreads(jobId, { jobContextGateway, reviewContextGateway });

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.threads[0].body).toBe('Nullable access not guarded');
      expect(result.threads[0].comments).toEqual([
        {
          author: 'maintainer',
          body: 'Nullable access not guarded',
          createdAt: '2026-08-01T10:00:00Z',
        },
        {
          author: 'maintainer',
          body: 'Intentional, the gateway already guarantees non-null',
          createdAt: '2026-08-01T11:00:00Z',
        },
      ]);
    });

    it('multi-note GitLab discussion: every note becomes a comment with its username and date', () => {
      const gitlabResponse = GitLabApiResponseFactory.createDiscussionsResponse([
        {
          id: 'discussion1',
          notes: [
            {
              resolvable: true,
              resolved: false,
              body: 'Missing validation',
              position: { new_path: 'src/service.ts', new_line: 42 },
              author: { username: 'maintainer' },
              created_at: '2026-08-01T10:00:00Z',
            },
            {
              resolvable: true,
              resolved: false,
              body: 'Validated upstream by the guard',
              position: null,
              author: { username: 'author' },
              created_at: '2026-08-01T11:00:00Z',
            },
          ],
        },
      ]);

      const gateway = new GitLabThreadFetchGateway(() => gitlabResponse);
      const threads = gateway.fetchThreads('group/project', 99);

      expect(threads[0].body).toBe('Missing validation');
      expect(threads[0].comments).toEqual([
        { author: 'maintainer', body: 'Missing validation', createdAt: '2026-08-01T10:00:00Z' },
        {
          author: 'author',
          body: 'Validated upstream by the guard',
          createdAt: '2026-08-01T11:00:00Z',
        },
      ]);
    });
  });

  describe('Rule: author is nullable', () => {
    it('GitHub thread with a deleted author: the comment keeps a null author', () => {
      const githubResponse = GitHubApiResponseFactory.createReviewThreadsResponse([
        {
          id: 'PRRT_2',
          isResolved: false,
          path: 'src/file.ts',
          line: 3,
          body: 'Finding',
          comments: [
            { author: 'maintainer', body: 'Finding', createdAt: '2026-08-01T10:00:00Z' },
            { author: null, body: 'Reply from a gone account', createdAt: '2026-08-01T12:00:00Z' },
          ],
        },
      ]);

      const gateway = new GitHubThreadFetchGateway(() => githubResponse);
      const threads = gateway.fetchThreads('owner/repo', 7);

      expect(threads[0].comments?.[1].author).toBeNull();
      expect(threads[0].comments?.[1].body).toBe('Reply from a gone account');
    });
  });

  describe('Rule: no value reaches a shell', () => {
    it('injected project path: the value stays one argv element on both platforms', () => {
      const githubCalls: Array<{ command: string; args: string[] }> = [];
      new GitHubThreadFetchGateway((command, args) => {
        githubCalls.push({ command, args });
        return GitHubApiResponseFactory.createReviewThreadsResponse([]);
      }).fetchThreads("owner'; touch pwned; #/repo", 42);

      expect(githubCalls[0].command).toBe('gh');
      expect(githubCalls[0].args).toContain("owner=owner'; touch pwned; #");
      expect(githubCalls[0].args.join(' ')).not.toContain("'owner");

      const gitlabCalls: Array<{ command: string; args: string[] }> = [];
      new GitLabThreadFetchGateway((command, args) => {
        gitlabCalls.push({ command, args });
        return GitLabApiResponseFactory.createDiscussionsResponse([]);
      }).fetchThreads("group/proj'; touch pwned; #", 42);

      expect(gitlabCalls[0].command).toBe('glab');
      expect(gitlabCalls[0].args).toEqual([
        'api',
        "projects/group%2Fproj'; touch pwned; #/merge_requests/42/discussions",
      ]);
    });
  });

  describe('Rule: the conversation field is optional on a persisted context', () => {
    it('older context file: a context written without comments still parses', () => {
      const mergeRequestId = 'github-owner-repo-100';
      const filePath = reviewContextGateway.getFilePath(localPath, mergeRequestId);
      mkdirSync(join(localPath, '.claude', 'reviews', 'logs'), { recursive: true });
      writeFileSync(
        filePath,
        JSON.stringify({
          version: '1.0',
          mergeRequestId,
          platform: 'github',
          projectPath: 'owner/repo',
          mergeRequestNumber: 100,
          createdAt: '2026-07-01T10:00:00Z',
          threads: [
            { id: 'PRRT_old', file: 'src/file.ts', line: 1, status: 'open', body: 'Old finding' },
          ],
          actions: [],
          progress: { phase: 'completed', currentStep: null },
        }),
      );

      const jobId = 'github:owner/repo:100';
      jobContextGateway.register(jobId, { localPath, mergeRequestId });

      const result = getThreads(jobId, { jobContextGateway, reviewContextGateway });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.threads[0].body).toBe('Old finding');
      expect(result.threads[0].comments).toBeUndefined();
    });
  });
});
