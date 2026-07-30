import { describe, it, expect } from 'vitest';

import { createEgressScanner } from '@/modules/platform-integration/entities/egressScan/egressScan.scanner.js';
import type { EgressScanConfig } from '@/modules/platform-integration/entities/egressScan/egressScan.scanner.js';
import { EgressScannedNoteCommentPostGateway } from '@/modules/platform-integration/interface-adapters/gateways/egressScanned.noteCommentPost.gateway.js';
import type { ReviewContext } from '@/modules/review-execution/entities/reviewContext/reviewContext.js';
import { executeActionsFromContext } from '@/modules/review-execution/services/contextActionsExecutor.js';
import type { CommandExecutor } from '@/shared/foundation/executionGateway.base.js';
import { StubEgressTraceGateway } from '@/tests/stubs/egressScan.stub.js';
import { StubNoteCommentPostGateway } from '@/tests/stubs/noteCommentPost.stub.js';

const SECRET = 'glpat-abcdefghij1234567890';

const redactConfig: EgressScanConfig = {
  secretShapeMode: 'redact',
  lengthMode: 'redact',
  outOfScopeMode: 'redact',
  maxBodyLength: 10000,
  redactionMarker: '[REDACTED]',
  truncationMarker: '…[TRUNCATED]',
};

const silentLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
};

function buildDecoratedSink() {
  const sink = new StubNoteCommentPostGateway();
  const trace = new StubEgressTraceGateway();
  const scanner = createEgressScanner(redactConfig);
  const gateway = new EgressScannedNoteCommentPostGateway(sink, scanner, trace);
  return { sink, gateway };
}

const baseContext: ReviewContext = {
  version: '1.0',
  mergeRequestId: 'gitlab-group/app-7',
  platform: 'gitlab',
  projectPath: 'group/app',
  mergeRequestNumber: 7,
  createdAt: '2026-02-02T10:00:00Z',
  threads: [],
  actions: [],
  progress: { phase: 'completed', currentStep: null },
};

describe('executeActionsFromContext — egress routing (pentest amendment AC7/AC9)', () => {
  it('routes a POST_COMMENT body through the decorated sink, never the raw CLI primitive', async () => {
    const { sink, gateway } = buildDecoratedSink();
    const rawCalls: string[][] = [];
    const recordingExecutor: CommandExecutor = (_command, args) => {
      rawCalls.push(args);
    };
    const context: ReviewContext = {
      ...baseContext,
      actions: [{ type: 'POST_COMMENT', body: `## Review\ntoken ${SECRET}` }],
    };

    await executeActionsFromContext(
      context,
      '/tmp/repo',
      silentLogger,
      recordingExecutor,
      null,
      gateway,
    );

    expect(sink.calls).toHaveLength(1);
    expect(sink.calls[0].body).toContain('[REDACTED]');
    expect(sink.calls[0].body).not.toContain(SECRET);

    const rawSecretCalls = rawCalls.filter((args) => args.some((arg) => arg.includes(SECRET)));
    expect(rawSecretCalls).toHaveLength(0);
  });

  it('routes a THREAD_REPLY body through the decorated thread-reply sink, never the raw CLI primitive', async () => {
    const { sink, gateway } = buildDecoratedSink();
    const rawCalls: string[][] = [];
    const recordingExecutor: CommandExecutor = (_command, args) => {
      rawCalls.push(args);
    };
    const context: ReviewContext = {
      ...baseContext,
      actions: [{ type: 'THREAD_REPLY', threadId: 'abc', message: `fixed ${SECRET}` }],
    };

    await executeActionsFromContext(
      context,
      '/tmp/repo',
      silentLogger,
      recordingExecutor,
      null,
      gateway,
    );

    expect(sink.calls).toHaveLength(0);
    expect(sink.threadReplies).toHaveLength(1);
    expect(sink.threadReplies[0].threadId).toBe('abc');
    expect(sink.threadReplies[0].body).not.toContain(SECRET);

    const rawSecretCalls = rawCalls.filter((args) => args.some((arg) => arg.includes(SECRET)));
    expect(rawSecretCalls).toHaveLength(0);
  });

  it('AC9 — public-output verbs reach the decorated sink while other allowed verbs use the CLI primitive', async () => {
    const { sink, gateway } = buildDecoratedSink();
    const rawCalls: string[][] = [];
    const recordingExecutor: CommandExecutor = (_command, args) => {
      rawCalls.push(args);
    };
    const context: ReviewContext = {
      ...baseContext,
      diffMetadata: { baseSha: 'base', headSha: 'head', startSha: 'start' },
      actions: [
        { type: 'POST_COMMENT', body: `comment ${SECRET}` },
        { type: 'THREAD_REPLY', threadId: 't1', message: `reply ${SECRET}` },
        { type: 'POST_INLINE_COMMENT', filePath: 'src/a.ts', line: 3, body: 'inline note' },
      ],
    };

    await executeActionsFromContext(
      context,
      '/tmp/repo',
      silentLogger,
      recordingExecutor,
      null,
      gateway,
    );

    const sinkedBodies = [...sink.calls, ...sink.threadReplies].map((call) => call.body);
    expect(sinkedBodies).toHaveLength(2);
    for (const body of sinkedBodies) {
      expect(body).not.toContain(SECRET);
    }
    const rawSecretCalls = rawCalls.filter((args) => args.some((arg) => arg.includes(SECRET)));
    expect(rawSecretCalls).toHaveLength(0);
    expect(rawCalls.some((args) => args.some((arg) => arg.includes('/discussions')))).toBe(true);
  });

  it('SPEC-196 unwire: THREAD_RESOLVE / ADD_LABEL are dropped from the sinked auto path', async () => {
    const { sink, gateway } = buildDecoratedSink();
    const rawCalls: string[][] = [];
    const recordingExecutor: CommandExecutor = (_command, args) => {
      rawCalls.push(args);
    };
    const context: ReviewContext = {
      ...baseContext,
      actions: [
        { type: 'POST_COMMENT', body: 'comment' },
        { type: 'THREAD_RESOLVE', threadId: 't1' },
        { type: 'ADD_LABEL', label: 'approved' },
      ],
    };

    await executeActionsFromContext(
      context,
      '/tmp/repo',
      silentLogger,
      recordingExecutor,
      null,
      gateway,
    );

    expect(sink.calls).toHaveLength(1);
    expect(rawCalls.some((args) => args.includes('resolved=true'))).toBe(false);
  });
});
