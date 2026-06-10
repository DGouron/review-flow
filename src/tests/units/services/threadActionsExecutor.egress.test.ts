import { describe, it, expect } from 'vitest';

import { createEgressScanner } from '@/modules/platform-integration/entities/egressScan/egressScan.scanner.js';
import type { EgressScanConfig } from '@/modules/platform-integration/entities/egressScan/egressScan.scanner.js';
import { EgressScannedNoteCommentPostGateway } from '@/modules/platform-integration/interface-adapters/gateways/egressScanned.noteCommentPost.gateway.js';
import {
  executeThreadActions,
  type ExecutionContext,
  type CommandExecutor,
} from '@/modules/review-execution/services/threadActionsExecutor.js';
import type { ThreadAction } from '@/modules/review-execution/services/threadActionsParser.js';
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

const gitlabContext: ExecutionContext = {
  platform: 'gitlab',
  projectPath: 'group/app',
  mrNumber: 7,
  localPath: '/tmp/repo',
};

describe('executeThreadActions — egress routing (pentest amendment AC7/AC9)', () => {
  it('routes a THREAD_REPLY body through the decorated sink, never the raw CLI primitive', async () => {
    const { sink, gateway } = buildDecoratedSink();
    const rawCalls: string[][] = [];
    const recordingExecutor: CommandExecutor = (_command, args) => {
      rawCalls.push(args);
    };
    const actions: ThreadAction[] = [
      { type: 'THREAD_REPLY', threadId: 'abc', message: `fixed, token ${SECRET}` },
    ];

    await executeThreadActions(actions, gitlabContext, silentLogger, recordingExecutor, gateway);

    expect(sink.calls).toHaveLength(1);
    expect(sink.calls[0].body).toContain('[REDACTED]');
    expect(sink.calls[0].body).not.toContain(SECRET);

    const reachedRawNotePrimitive = rawCalls.some((args) =>
      args.some((arg) => arg.includes(SECRET) || arg.includes('/notes')),
    );
    expect(reachedRawNotePrimitive).toBe(false);
  });

  it('routes a POST_COMMENT body through the decorated sink, never the raw CLI primitive', async () => {
    const { sink, gateway } = buildDecoratedSink();
    const rawCalls: string[][] = [];
    const recordingExecutor: CommandExecutor = (_command, args) => {
      rawCalls.push(args);
    };
    const actions: ThreadAction[] = [{ type: 'POST_COMMENT', body: `comment ${SECRET}` }];

    await executeThreadActions(actions, gitlabContext, silentLogger, recordingExecutor, gateway);

    expect(sink.calls).toHaveLength(1);
    expect(sink.calls[0].body).not.toContain(SECRET);

    const rawSecretCalls = rawCalls.filter((args) => args.some((arg) => arg.includes(SECRET)));
    expect(rawSecretCalls).toHaveLength(0);
  });

  it('routes non-public-output postComment verbs (POST_INLINE_COMMENT) through the CLI primitive', async () => {
    const { sink, gateway } = buildDecoratedSink();
    const rawCalls: string[][] = [];
    const recordingExecutor: CommandExecutor = (_command, args) => {
      rawCalls.push(args);
    };
    const actions: ThreadAction[] = [
      { type: 'POST_INLINE_COMMENT', filePath: 'src/a.ts', line: 3, body: 'inline note' },
    ];
    const inlineContext: ExecutionContext = {
      ...gitlabContext,
      diffMetadata: { baseSha: 'base', headSha: 'head', startSha: 'start' },
    };

    await executeThreadActions(actions, inlineContext, silentLogger, recordingExecutor, gateway);

    expect(sink.calls).toHaveLength(0);
    expect(rawCalls.some((args) => args.some((arg) => arg.includes('/discussions')))).toBe(true);
  });

  it('drops THREAD_RESOLVE from the auto path (SPEC-196 unwire): neither sink nor CLI write', async () => {
    const { sink, gateway } = buildDecoratedSink();
    const rawCalls: string[][] = [];
    const recordingExecutor: CommandExecutor = (_command, args) => {
      rawCalls.push(args);
    };
    const actions: ThreadAction[] = [{ type: 'THREAD_RESOLVE', threadId: 'abc' }];

    await executeThreadActions(actions, gitlabContext, silentLogger, recordingExecutor, gateway);

    expect(sink.calls).toHaveLength(0);
    expect(rawCalls.some((args) => args.includes('resolved=true'))).toBe(false);
  });

  it('AC9 — every auto-path public-output verb reaches only the decorated sink', async () => {
    const { sink, gateway } = buildDecoratedSink();
    const rawCalls: string[][] = [];
    const recordingExecutor: CommandExecutor = (_command, args) => {
      rawCalls.push(args);
    };
    const actions: ThreadAction[] = [
      { type: 'POST_COMMENT', body: `comment ${SECRET}` },
      { type: 'THREAD_REPLY', threadId: 't1', message: `reply ${SECRET}` },
      { type: 'THREAD_RESOLVE', threadId: 't1' },
    ];

    await executeThreadActions(actions, gitlabContext, silentLogger, recordingExecutor, gateway);

    expect(sink.calls).toHaveLength(2);
    for (const call of sink.calls) {
      expect(call.body).not.toContain(SECRET);
    }
    const rawSecretCalls = rawCalls.filter((args) => args.some((arg) => arg.includes(SECRET)));
    expect(rawSecretCalls).toHaveLength(0);
  });
});
