import { describe, it, expect, vi } from 'vitest';

import type { ReviewAction } from '@/modules/review-execution/entities/reviewAction/reviewAction.js';
import { GitHubReviewActionCliGateway } from '@/modules/review-execution/interface-adapters/gateways/cli/reviewAction.github.cli.gateway.js';

describe('GitHubReviewActionCliGateway', () => {
  it('should execute THREAD_RESOLVE action with gh graphql mutation', async () => {
    const executor = vi.fn();
    const gateway = new GitHubReviewActionCliGateway(executor);

    const actions: ReviewAction[] = [{ type: 'THREAD_RESOLVE', threadId: 'PRRT_abc123' }];
    const context = {
      projectPath: 'owner/repo',
      mrNumber: 42,
      localPath: '/tmp/repo',
      baseUrl: null as string | null,
    };

    const result = await gateway.execute(actions, context);

    expect(executor).toHaveBeenCalledWith(
      'gh',
      expect.arrayContaining(['graphql', '-f']),
      '/tmp/repo',
    );
    expect(result.succeeded).toBe(1);
  });

  it('should execute POST_COMMENT action with gh api', async () => {
    const executor = vi.fn();
    const gateway = new GitHubReviewActionCliGateway(executor);
    const actions: ReviewAction[] = [{ type: 'POST_COMMENT', body: '## Review complete' }];
    const context = {
      projectPath: 'owner/repo',
      mrNumber: 42,
      localPath: '/tmp',
      baseUrl: null as string | null,
    };

    const result = await gateway.execute(actions, context);

    expect(executor).toHaveBeenCalledWith(
      'gh',
      expect.arrayContaining(['repos/owner/repo/issues/42/comments', 'body=## Review complete']),
      '/tmp',
    );
    expect(result.succeeded).toBe(1);
  });

  it('should execute THREAD_REPLY action with the gh graphql addPullRequestReviewThreadReply mutation', async () => {
    const executor = vi.fn();
    const gateway = new GitHubReviewActionCliGateway(executor);
    const actions: ReviewAction[] = [
      { type: 'THREAD_REPLY', threadId: 'PRRT_node123', message: 'Done!' },
    ];
    const context = {
      projectPath: 'owner/repo',
      mrNumber: 42,
      localPath: '/tmp',
      baseUrl: null as string | null,
    };

    const result = await gateway.execute(actions, context);

    const call = executor.mock.calls[0];
    expect(call[0]).toBe('gh');
    const args: string[] = call[1];
    expect(args).toContain('graphql');
    expect(args.some((arg) => arg.includes('addPullRequestReviewThreadReply'))).toBe(true);
    expect(args).toContain('threadId=PRRT_node123');
    expect(args).toContain('body=Done!');
    expect(call[2]).toBe('/tmp');
    expect(result.succeeded).toBe(1);
  });

  it('should execute ADD_LABEL action with gh api', async () => {
    const executor = vi.fn();
    const gateway = new GitHubReviewActionCliGateway(executor);
    const actions: ReviewAction[] = [{ type: 'ADD_LABEL', label: 'reviewed' }];
    const context = {
      projectPath: 'owner/repo',
      mrNumber: 42,
      localPath: '/tmp',
      baseUrl: null as string | null,
    };

    const result = await gateway.execute(actions, context);

    expect(executor).toHaveBeenCalledWith(
      'gh',
      expect.arrayContaining(['repos/owner/repo/issues/42/labels', 'labels[]=reviewed']),
      '/tmp',
    );
    expect(result.succeeded).toBe(1);
  });

  it('should execute POST_INLINE_COMMENT action with correct gh command', async () => {
    const executor = vi.fn();
    const gateway = new GitHubReviewActionCliGateway(executor);
    const actions: ReviewAction[] = [
      {
        type: 'POST_INLINE_COMMENT',
        filePath: 'src/app.ts',
        line: 42,
        body: 'Extract this logic.',
      },
    ];
    const context = {
      projectPath: 'owner/repo',
      mrNumber: 42,
      localPath: '/tmp',
      diffMetadata: { baseSha: 'base111', headSha: 'head222', startSha: 'start333' },
      baseUrl: null as string | null,
    };

    const result = await gateway.execute(actions, context);

    expect(executor).toHaveBeenCalledWith(
      'gh',
      expect.arrayContaining([
        'repos/owner/repo/pulls/42/comments',
        'body=Extract this logic.',
        'commit_id=head222',
        'path=src/app.ts',
        'line=42',
      ]),
      '/tmp',
    );
    expect(result.succeeded).toBe(1);
  });

  it('should skip POST_INLINE_COMMENT when diffMetadata is missing', async () => {
    const executor = vi.fn();
    const gateway = new GitHubReviewActionCliGateway(executor);
    const actions: ReviewAction[] = [
      { type: 'POST_INLINE_COMMENT', filePath: 'src/app.ts', line: 42, body: 'Test' },
    ];
    const context = {
      projectPath: 'owner/repo',
      mrNumber: 42,
      localPath: '/tmp',
      baseUrl: null as string | null,
    };

    const result = await gateway.execute(actions, context);

    expect(executor).not.toHaveBeenCalled();
    expect(result.skipped).toBe(1);
  });

  it('should skip FETCH_THREADS action', async () => {
    const executor = vi.fn();
    const gateway = new GitHubReviewActionCliGateway(executor);
    const actions: ReviewAction[] = [{ type: 'FETCH_THREADS' }];
    const context = {
      projectPath: 'owner/repo',
      mrNumber: 42,
      localPath: '/tmp',
      baseUrl: null as string | null,
    };

    const result = await gateway.execute(actions, context);

    expect(executor).not.toHaveBeenCalled();
    expect(result.skipped).toBe(1);
  });
});
