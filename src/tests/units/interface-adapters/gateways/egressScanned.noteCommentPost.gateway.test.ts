import { EgressScannedNoteCommentPostGateway } from '@/modules/platform-integration/interface-adapters/gateways/egressScanned.noteCommentPost.gateway.js';
import { EgressBlockedError } from '@/modules/platform-integration/interface-adapters/gateways/egressScanned.noteCommentPost.gateway.js';
import { StubEgressScanGateway, StubEgressTraceGateway } from '@/tests/stubs/egressScan.stub.js';
import { StubNoteCommentPostGateway } from '@/tests/stubs/noteCommentPost.stub.js';

const SECRET = 'glpat-abcdefghij1234567890';

describe('EgressScannedNoteCommentPostGateway', () => {
  describe('AC1 — single enforcement point', () => {
    it('passes a clean scanned body to the underlying sink', async () => {
      const sink = new StubNoteCommentPostGateway();
      const scanner = new StubEgressScanGateway();
      const trace = new StubEgressTraceGateway();
      scanner.setResult({ decision: 'pass', body: 'clean body' });
      const gateway = new EgressScannedNoteCommentPostGateway(sink, scanner, trace);

      await gateway.postComment({ projectPath: 'group/project', mrNumber: 1, body: 'clean body' });

      expect(sink.calls).toHaveLength(1);
      expect(sink.calls[0].body).toBe('clean body');
      expect(scanner.calls).toHaveLength(1);
      expect(scanner.calls[0].channel).toBe('postComment');
    });

    it('sends the redacted body, never the raw secret, to the sink', async () => {
      const sink = new StubNoteCommentPostGateway();
      const scanner = new StubEgressScanGateway();
      const trace = new StubEgressTraceGateway();
      scanner.setResult({
        decision: 'redact',
        body: 'token is [REDACTED] here',
        trace: {
          channel: 'postComment',
          mode: 'redact',
          matchCategoryCounts: { 'secret-shape': 1, 'length-cap': 0, 'out-of-scope': 0 },
        },
      });
      const gateway = new EgressScannedNoteCommentPostGateway(sink, scanner, trace);

      await gateway.postComment({
        projectPath: 'group/project',
        mrNumber: 1,
        body: `token is ${SECRET} here`,
      });

      expect(sink.calls).toHaveLength(1);
      expect(sink.calls[0].body).toBe('token is [REDACTED] here');
      expect(sink.calls[0].body).not.toContain(SECRET);
    });

    it('never calls the sink when the scanner blocks, and raises EgressBlockedError', async () => {
      const sink = new StubNoteCommentPostGateway();
      const scanner = new StubEgressScanGateway();
      const trace = new StubEgressTraceGateway();
      scanner.setResult({
        decision: 'block',
        trace: {
          channel: 'postComment',
          mode: 'block',
          matchCategoryCounts: { 'secret-shape': 1, 'length-cap': 0, 'out-of-scope': 0 },
        },
      });
      const gateway = new EgressScannedNoteCommentPostGateway(sink, scanner, trace);

      await expect(
        gateway.postComment({ projectPath: 'group/project', mrNumber: 1, body: `token ${SECRET}` }),
      ).rejects.toBeInstanceOf(EgressBlockedError);
      expect(sink.calls).toHaveLength(0);
    });
  });

  describe('AC5 — fail-closed on scanner error', () => {
    it('never posts and raises when the scanner throws', async () => {
      const sink = new StubNoteCommentPostGateway();
      const scanner = new StubEgressScanGateway();
      const trace = new StubEgressTraceGateway();
      scanner.setShouldFail(true);
      const gateway = new EgressScannedNoteCommentPostGateway(sink, scanner, trace);

      await expect(
        gateway.postComment({ projectPath: 'group/project', mrNumber: 1, body: 'anything' }),
      ).rejects.toThrow();
      expect(sink.calls).toHaveLength(0);
    });
  });

  describe('AC6 — trace without secret', () => {
    it('records a trace on redact without the raw secret', async () => {
      const sink = new StubNoteCommentPostGateway();
      const scanner = new StubEgressScanGateway();
      const trace = new StubEgressTraceGateway();
      scanner.setResult({
        decision: 'redact',
        body: 'token is [REDACTED]',
        trace: {
          channel: 'postComment',
          mode: 'redact',
          matchCategoryCounts: { 'secret-shape': 1, 'length-cap': 0, 'out-of-scope': 0 },
        },
      });
      const gateway = new EgressScannedNoteCommentPostGateway(sink, scanner, trace);

      await gateway.postComment({
        projectPath: 'group/project',
        mrNumber: 1,
        body: `token is ${SECRET}`,
      });

      expect(trace.traces).toHaveLength(1);
      expect(trace.traces[0].mode).toBe('redact');
      expect(trace.traces[0].matchCategoryCounts['secret-shape']).toBe(1);
      expect(JSON.stringify(trace.traces[0])).not.toContain(SECRET);
    });

    it('records a trace on block', async () => {
      const sink = new StubNoteCommentPostGateway();
      const scanner = new StubEgressScanGateway();
      const trace = new StubEgressTraceGateway();
      scanner.setResult({
        decision: 'block',
        trace: {
          channel: 'postComment',
          mode: 'block',
          matchCategoryCounts: { 'secret-shape': 1, 'length-cap': 0, 'out-of-scope': 0 },
        },
      });
      const gateway = new EgressScannedNoteCommentPostGateway(sink, scanner, trace);

      await expect(
        gateway.postComment({ projectPath: 'group/project', mrNumber: 1, body: `token ${SECRET}` }),
      ).rejects.toBeInstanceOf(EgressBlockedError);

      expect(trace.traces).toHaveLength(1);
      expect(trace.traces[0].mode).toBe('block');
    });

    it('records no trace on a clean pass', async () => {
      const sink = new StubNoteCommentPostGateway();
      const scanner = new StubEgressScanGateway();
      const trace = new StubEgressTraceGateway();
      scanner.setResult({ decision: 'pass', body: 'clean' });
      const gateway = new EgressScannedNoteCommentPostGateway(sink, scanner, trace);

      await gateway.postComment({ projectPath: 'group/project', mrNumber: 1, body: 'clean' });

      expect(trace.traces).toHaveLength(0);
    });
  });
});
