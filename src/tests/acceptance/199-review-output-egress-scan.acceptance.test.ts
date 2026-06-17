import { describe, it, expect } from 'vitest';

import { buildRecoveryExecuteActions } from '@/main/server.js';
import { defaultEgressScanConfig } from '@/modules/platform-integration/entities/egressScan/egressScan.defaults.js';
import { createEgressScanner } from '@/modules/platform-integration/entities/egressScan/egressScan.scanner.js';
import type { EgressScanConfig } from '@/modules/platform-integration/entities/egressScan/egressScan.scanner.js';
import {
  EgressBlockedError,
  EgressScannedNoteCommentPostGateway,
} from '@/modules/platform-integration/interface-adapters/gateways/egressScanned.noteCommentPost.gateway.js';
import type { ReviewAction } from '@/modules/review-execution/entities/reviewAction/reviewAction.js';
import type { ReviewContext } from '@/modules/review-execution/entities/reviewContext/reviewContext.js';
import { executeActionsFromContext } from '@/modules/review-execution/services/contextActionsExecutor.js';
import {
  executeThreadActions,
  type ExecutionContext,
} from '@/modules/review-execution/services/threadActionsExecutor.js';
import type { CommandExecutor } from '@/shared/foundation/executionGateway.base.js';
import { StubEgressScanGateway, StubEgressTraceGateway } from '@/tests/stubs/egressScan.stub.js';
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

const blockConfig: EgressScanConfig = {
  ...redactConfig,
  secretShapeMode: 'block',
};

const silentLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
};

class RecordingExecutor {
  readonly calls: string[][] = [];
  run: CommandExecutor = (_command, args) => {
    this.calls.push(args);
  };

  secretBearingArgs(): string[][] {
    return this.calls.filter((args) => args.some((arg) => arg.includes(SECRET)));
  }
}

function buildDecoratedSink(config: EgressScanConfig = redactConfig) {
  const sink = new StubNoteCommentPostGateway();
  const trace = new StubEgressTraceGateway();
  const scanner = createEgressScanner(config);
  const gateway = new EgressScannedNoteCommentPostGateway(sink, scanner, trace);
  return { sink, trace, gateway };
}

const gitlabExecutionContext: ExecutionContext = {
  platform: 'gitlab',
  projectPath: 'group/app',
  mrNumber: 7,
  localPath: '/tmp/repo',
};

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

const publicOutputVerbs: Array<{ name: string; action: ReviewAction }> = [
  { name: 'POST_COMMENT', action: { type: 'POST_COMMENT', body: `## Review\ntoken ${SECRET}` } },
  {
    name: 'THREAD_REPLY',
    action: { type: 'THREAD_REPLY', threadId: 'abc', message: `fixed ${SECRET}` },
  },
];

describe('SPEC-199 review output egress scan (acceptance — shared chokepoint across all callers)', () => {
  describe('AC9 — every auto-path public-output verb is scanned before reaching the sink', () => {
    for (const { name, action } of publicOutputVerbs) {
      it(`scans a ${name} body driven through executeThreadActions, never the raw note primitive`, async () => {
        const { sink, trace, gateway } = buildDecoratedSink();
        const executor = new RecordingExecutor();

        await executeThreadActions(
          [action],
          gitlabExecutionContext,
          silentLogger,
          executor.run,
          gateway,
        );

        expect(sink.calls).toHaveLength(1);
        expect(sink.calls[0].body).toContain('[REDACTED]');
        expect(sink.calls[0].body).not.toContain(SECRET);
        expect(executor.secretBearingArgs()).toHaveLength(0);
        expect(trace.traces).toHaveLength(1);
      });

      it(`scans a ${name} body persisted in a ReviewContext through executeActionsFromContext`, async () => {
        const { sink, trace, gateway } = buildDecoratedSink();
        const executor = new RecordingExecutor();
        const context: ReviewContext = { ...baseContext, actions: [action] };

        await executeActionsFromContext(
          context,
          '/tmp/repo',
          silentLogger,
          executor.run,
          null,
          gateway,
        );

        expect(sink.calls).toHaveLength(1);
        expect(sink.calls[0].body).toContain('[REDACTED]');
        expect(sink.calls[0].body).not.toContain(SECRET);
        expect(executor.secretBearingArgs()).toHaveLength(0);
        expect(trace.traces).toHaveLength(1);
      });
    }
  });

  describe('AC2 / AC5 — block and fail-closed end-to-end', () => {
    it('raises EgressBlockedError and never reaches the sink for a secret body in block mode', async () => {
      const { sink, gateway } = buildDecoratedSink(blockConfig);
      const executor = new RecordingExecutor();

      await expect(
        executeThreadActions(
          [{ type: 'POST_COMMENT', body: `summary ${SECRET}` }],
          gitlabExecutionContext,
          silentLogger,
          executor.run,
          gateway,
        ),
      ).rejects.toBeInstanceOf(EgressBlockedError);

      expect(sink.calls).toHaveLength(0);
      expect(executor.secretBearingArgs()).toHaveLength(0);
    });

    it('fails closed when the scanner throws — no post, error raised', async () => {
      const sink = new StubNoteCommentPostGateway();
      const trace = new StubEgressTraceGateway();
      const scanner = new StubEgressScanGateway();
      scanner.setShouldFail(true);
      const gateway = new EgressScannedNoteCommentPostGateway(sink, scanner, trace);
      const executor = new RecordingExecutor();

      await expect(
        executeThreadActions(
          [{ type: 'POST_COMMENT', body: `summary ${SECRET}` }],
          gitlabExecutionContext,
          silentLogger,
          executor.run,
          gateway,
        ),
      ).rejects.toThrow();

      expect(sink.calls).toHaveLength(0);
    });
  });

  describe('AC9 — the boot-time recovery path is scanned (GAP-1 close-loop)', () => {
    it('scans a recovered POST_COMMENT so the secret never reaches the raw CLI note primitive', async () => {
      const cliCalls: string[][] = [];
      const noteCommands: string[] = [];
      const trace = new StubEgressTraceGateway();
      const recoveredContext: ReviewContext = {
        ...baseContext,
        actions: [{ type: 'POST_COMMENT', body: `## Recovered review\ntoken ${SECRET}` }],
      };

      const executeActions = buildRecoveryExecuteActions(silentLogger, trace, {
        cliExecutor: (_command, args) => {
          cliCalls.push(args);
        },
        gitLabNoteExecutor: (command) => {
          noteCommands.push(command);
          return '';
        },
      });
      await executeActions(recoveredContext, '/tmp/repo');

      expect(noteCommands).toHaveLength(1);
      expect(noteCommands[0]).toContain('[redacted]');
      expect(noteCommands[0]).not.toContain(SECRET);
      expect(cliCalls.some((args) => args.some((arg) => arg.includes(SECRET)))).toBe(false);
      expect(trace.traces).toHaveLength(1);
    });
  });

  describe('AC8 — out-of-scope-by-design: no auto revoke whose comment could egress (SPEC-196 unwire)', () => {
    it('drops THREAD_RESOLVE / ADD_LABEL from the auto path, recording zero CLI writes for them', async () => {
      const { sink, gateway } = buildDecoratedSink();
      const executor = new RecordingExecutor();
      const context: ReviewContext = {
        ...baseContext,
        actions: [
          { type: 'POST_COMMENT', body: 'clean summary' },
          { type: 'THREAD_RESOLVE', threadId: 't1' },
          { type: 'ADD_LABEL', label: 'approved' },
        ],
      };

      await executeActionsFromContext(
        context,
        '/tmp/repo',
        silentLogger,
        executor.run,
        null,
        gateway,
      );

      expect(sink.calls).toHaveLength(1);
      expect(executor.calls.some((args) => args.includes('resolved=true'))).toBe(false);
      expect(defaultEgressScanConfig.secretShapeMode).toBe('redact');
    });
  });
});
