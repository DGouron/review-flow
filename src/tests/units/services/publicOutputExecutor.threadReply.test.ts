import { describe, it, expect } from 'vitest';

import { createEgressScanner } from '@/modules/platform-integration/entities/egressScan/egressScan.scanner.js';
import type { EgressScanConfig } from '@/modules/platform-integration/entities/egressScan/egressScan.scanner.js';
import { EgressScannedNoteCommentPostGateway } from '@/modules/platform-integration/interface-adapters/gateways/egressScanned.noteCommentPost.gateway.js';
import { executePublicOutput } from '@/modules/review-execution/services/publicOutputExecutor.js';
import type { PublicOutputAction } from '@/modules/review-execution/services/publicOutputExecutor.js';
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

function buildDecoratedGateway() {
  const sink = new StubNoteCommentPostGateway();
  const trace = new StubEgressTraceGateway();
  const scanner = createEgressScanner(redactConfig);
  const gateway = new EgressScannedNoteCommentPostGateway(sink, scanner, trace);
  return { sink, trace, gateway };
}

const context = { projectPath: 'owner/repo', mrNumber: 42 };

describe('executePublicOutput — THREAD_REPLY lands in its thread', () => {
  it('routes a THREAD_REPLY to the thread-reply sink carrying its threadId', async () => {
    const { sink, gateway } = buildDecoratedGateway();
    const actions: PublicOutputAction[] = [
      { type: 'THREAD_REPLY', threadId: 'PRRT_kwDOabc', message: 'Still open — code unchanged.' },
    ];

    await executePublicOutput(actions, context, gateway);

    expect(sink.calls).toHaveLength(0);
    expect(sink.threadReplies).toEqual([
      {
        projectPath: 'owner/repo',
        mrNumber: 42,
        threadId: 'PRRT_kwDOabc',
        body: 'Still open — code unchanged.',
      },
    ]);
  });

  it('still scans the reply body before it leaves the system', async () => {
    const { sink, trace, gateway } = buildDecoratedGateway();
    const actions: PublicOutputAction[] = [
      { type: 'THREAD_REPLY', threadId: 'PRRT_kwDOabc', message: `fixed, token ${SECRET}` },
    ];

    await executePublicOutput(actions, context, gateway);

    expect(sink.threadReplies[0].body).toContain('[REDACTED]');
    expect(sink.threadReplies[0].body).not.toContain(SECRET);
    expect(trace.traces.map((entry) => entry.channel)).toContain('THREAD_REPLY');
  });

  it('keeps POST_COMMENT on the top-level note sink', async () => {
    const { sink, gateway } = buildDecoratedGateway();
    const actions: PublicOutputAction[] = [{ type: 'POST_COMMENT', body: 'followup report' }];

    await executePublicOutput(actions, context, gateway);

    expect(sink.threadReplies).toHaveLength(0);
    expect(sink.calls).toHaveLength(1);
  });
});
