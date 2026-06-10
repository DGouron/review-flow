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
  return { sink, gateway };
}

const context = { projectPath: 'group/project', mrNumber: 42 };

describe('executePublicOutput', () => {
  describe('AC7 — THREAD_REPLY egress is scanned', () => {
    it('routes a THREAD_REPLY body through the decorated sink with redaction', async () => {
      const { sink, gateway } = buildDecoratedGateway();
      const actions: PublicOutputAction[] = [
        { type: 'THREAD_REPLY', threadId: 'abc', message: `fixed, token ${SECRET}` },
      ];

      await executePublicOutput(actions, context, gateway);

      expect(sink.calls).toHaveLength(1);
      expect(sink.calls[0].body).toContain('[REDACTED]');
      expect(sink.calls[0].body).not.toContain(SECRET);
    });
  });

  describe('AC9 — channel exhaustiveness', () => {
    const verbCases: { label: string; action: PublicOutputAction }[] = [
      {
        label: 'THREAD_REPLY',
        action: { type: 'THREAD_REPLY', threadId: 'abc', message: `m ${SECRET}` },
      },
      { label: 'POST_COMMENT', action: { type: 'POST_COMMENT', body: `c ${SECRET}` } },
    ];

    it.each(verbCases)('routes %s through the same decorated sink', async ({ action }) => {
      const { sink, gateway } = buildDecoratedGateway();

      await executePublicOutput([action], context, gateway);

      expect(sink.calls).toHaveLength(1);
      expect(sink.calls[0].body).not.toContain(SECRET);
      expect(sink.calls[0].body).toContain('[REDACTED]');
    });

    it('every auto-path public-output verb resolves to one shared decorated sink', async () => {
      const { sink, gateway } = buildDecoratedGateway();
      const actions: PublicOutputAction[] = [
        { type: 'POST_COMMENT', body: `comment ${SECRET}` },
        { type: 'THREAD_REPLY', threadId: 't1', message: `reply ${SECRET}` },
      ];

      await executePublicOutput(actions, context, gateway);

      expect(sink.calls).toHaveLength(2);
      for (const call of sink.calls) {
        expect(call.body).not.toContain(SECRET);
        expect(call.body).toContain('[REDACTED]');
      }
    });

    it('ignores non-public-output verbs (no body leaves the system)', async () => {
      const { sink, gateway } = buildDecoratedGateway();
      const actions: PublicOutputAction[] = [
        { type: 'THREAD_RESOLVE', threadId: 't1' },
        { type: 'FETCH_THREADS' },
      ];

      await executePublicOutput(actions, context, gateway);

      expect(sink.calls).toHaveLength(0);
    });
  });
});
