import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { InMemoryBillingStateGateway } from '@/modules/claude-invocation/interface-adapters/gateways/billingState.memory.gateway.js';
import { ClaudeSessionCliGateway } from '@/modules/claude-invocation/interface-adapters/gateways/claudeSession.cli.gateway.js';
import type { ClaudeProcessRunner } from '@/modules/claude-invocation/interface-adapters/gateways/claudeSession.cli.gateway.js';
import { ProcessEnvironmentGateway } from '@/modules/claude-invocation/interface-adapters/gateways/environment.process.gateway.js';
import { FileSystemMcpCompletionBridge } from '@/modules/claude-invocation/interface-adapters/gateways/mcpCompletion.fileSystem.gateway.js';
import { ReviewReportFileSystemGateway } from '@/modules/claude-invocation/interface-adapters/gateways/reviewReport.fileSystem.gateway.js';
import { runClaudeReviewJob } from '@/modules/claude-invocation/usecases/runClaudeReviewJob.usecase.js';

// Integration scope:
//
// This test exercises the SAME object graph the production composition root
// builds — ClaudeSessionCliGateway, FileSystemMcpCompletionBridge, the real
// ReviewReportFileSystemGateway, InMemoryBillingStateGateway, ProcessEnvironment
// Gateway, and runClaudeReviewJob. The ONE seam replaced by a fake is the
// `ClaudeProcessRunner` port that wraps `node:child_process.spawn` — the
// boundary to the `claude` binary. Everything else is the real wiring.
//
// This catches the original SPEC-169 regression class (orphan use cases not
// reached by the production path) because if any wire breaks, the chain
// stops; the test fails loudly. Pure unit tests with stubbed gateways
// missed this entirely.

interface FakeRunnerCall {
  args: string[];
  cwd?: string;
  env?: Record<string, string>;
}

interface FakeRunnerResponse {
  stdout: string;
  stderr: string;
  exitCode: number;
}

function makeFakeRunner(): {
  runner: ClaudeProcessRunner;
  responses: Map<string, FakeRunnerResponse>;
  calls: FakeRunnerCall[];
} {
  const responses = new Map<string, FakeRunnerResponse>();
  const calls: FakeRunnerCall[] = [];
  const runner: ClaudeProcessRunner = async (request) => {
    calls.push({ args: request.args, cwd: request.cwd, env: request.env });
    const subcommand = request.args[0] ?? '';
    const response = responses.get(subcommand);
    if (!response) {
      return { stdout: '', stderr: `no fake configured for ${subcommand}`, exitCode: 1 };
    }
    return response;
  };
  return { runner, responses, calls };
}

describe('SPEC-169 — end-to-end integration: production wire-up reaches runClaudeReviewJob', () => {
  let scratchDir: string;
  let completionsDir: string;
  let reviewsDir: string;

  beforeEach(() => {
    scratchDir = mkdtempSync(join(tmpdir(), 'spec169-int-'));
    completionsDir = join(scratchDir, 'completions');
    reviewsDir = join(scratchDir, 'repo', '.claude', 'reviews');
    mkdirSync(reviewsDir, { recursive: true });
    mkdirSync(completionsDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(scratchDir, { recursive: true, force: true });
  });

  it('dispatches via --bg, observes MCP completion through the FS bridge, retrieves the report, and cleans up', async () => {
    const { runner, responses, calls } = makeFakeRunner();
    responses.set('--bg', {
      stdout: 'backgrounded · abc12345\n  claude attach abc12345    open in this terminal\n',
      stderr: '',
      exitCode: 0,
    });
    responses.set('stop', { stdout: '', stderr: '', exitCode: 0 });
    responses.set('rm', { stdout: '', stderr: '', exitCode: 0 });

    const sessionGateway = new ClaudeSessionCliGateway(runner);
    const completionBridge = new FileSystemMcpCompletionBridge({
      directory: completionsDir,
      pollIntervalMs: 5,
    });
    const reportGateway = new ReviewReportFileSystemGateway();
    const billingState = new InMemoryBillingStateGateway();
    const environment = new ProcessEnvironmentGateway(() => ({})); // no ANTHROPIC_API_KEY

    const today = new Date('2026-05-22T12:00:00Z');
    const repoPath = join(scratchDir, 'repo');
    const reportPath = join(reviewsDir, '2026-05-22-MR-42-review.md');
    writeFileSync(reportPath, '# Integration review content', 'utf-8');

    // Publish the MCP completion BEFORE invoking — the bridge buffers it and
    // delivers it as soon as runClaudeReviewJob subscribes. Models the
    // realistic case where MCP `set_phase("completed")` fires while the host
    // is still bootstrapping its listener.
    completionBridge.publish('job-int-1', { source: 'mcp', outcome: 'completed', reason: null });

    const result = await runClaudeReviewJob(
      {
        jobId: 'job-int-1',
        jobType: 'review',
        prompt: '/review 42',
        flags: {
          model: 'claude-opus-4-7',
          mcpConfigJson: '{}',
          systemPrompt: 'system',
          allowedTools: 'Read',
          disallowedTools: 'AskUserQuestion',
          permissionMode: 'auto',
        },
        localPath: repoPath,
        mergeRequestId: 'github-acme/repo-42',
        mergeRequestNumber: 42,
        attempt: 0,
      },
      {
        sessionGateway,
        completionBridge,
        reportGateway,
        billingState,
        environment,
        now: () => today,
        timeoutMs: 60_000,
        pollIntervalMs: 5_000,
      },
    );

    expect(result.status).toBe('completed');
    if (result.status === 'completed') {
      expect(result.content).toBe('# Integration review content');
      expect(result.reportPath).toBe(reportPath);
    }

    // The dispatch arguments must contain --bg and never -p / --print.
    const dispatchCall = calls.find((call) => call.args.includes('--bg'));
    expect(dispatchCall).toBeDefined();
    expect(dispatchCall?.args).not.toContain('-p');
    expect(dispatchCall?.args).not.toContain('--print');

    // Cleanup must have called both stop and rm on the captured session id.
    const stopCall = calls.find((call) => call.args[0] === 'stop');
    const rmCall = calls.find((call) => call.args[0] === 'rm');
    expect(stopCall?.args).toContain('abc12345');
    expect(rmCall?.args).toContain('abc12345');
  });

  it('rejects dispatch when ANTHROPIC_API_KEY is set in the host environment (FR-7 pre-check)', async () => {
    const { runner } = makeFakeRunner();
    const sessionGateway = new ClaudeSessionCliGateway(runner);
    const completionBridge = new FileSystemMcpCompletionBridge({
      directory: completionsDir,
      pollIntervalMs: 5,
    });
    const reportGateway = new ReviewReportFileSystemGateway();
    const billingState = new InMemoryBillingStateGateway();
    const environment = new ProcessEnvironmentGateway(() => ({
      ANTHROPIC_API_KEY: 'leaked-key',
    }));

    const result = await runClaudeReviewJob(
      {
        jobId: 'job-int-2',
        jobType: 'review',
        prompt: '/review 1',
        flags: {
          model: 'claude-opus-4-7',
          mcpConfigJson: '{}',
          systemPrompt: 'system',
          allowedTools: 'Read',
          disallowedTools: 'AskUserQuestion',
          permissionMode: 'auto',
        },
        localPath: scratchDir,
        mergeRequestId: 'github-acme/repo-1',
        mergeRequestNumber: 1,
        attempt: 0,
      },
      {
        sessionGateway,
        completionBridge,
        reportGateway,
        billingState,
        environment,
        now: () => new Date(),
        timeoutMs: 60_000,
        pollIntervalMs: 5_000,
      },
    );

    expect(result.status).toBe('failed');
    if (result.status === 'failed') {
      expect(result.reason).toBe('billing-regression-prevented');
    }
  });
});
