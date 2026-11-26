import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import { EmberAnswerTransportClaudeGateway } from '@/modules/ember-chat/interface-adapters/gateways/emberAnswerTransport.claude.gateway.js';
import type { ReviewBriefModelRequest } from '@/modules/review-brief/entities/reviewBrief/reviewBriefModel.gateway.js';
import {
  REVIEW_BRIEF_SESSION,
  ReviewBriefModelEmberGateway,
} from '@/modules/review-brief/interface-adapters/gateways/reviewBriefModel.ember.gateway.js';
import { StubClaudeSessionGateway } from '@/tests/stubs/claudeSession.stub.js';
import { StubEmberAnswerTransportGateway } from '@/tests/stubs/emberAnswerTransport.stub.js';

function request(overrides: Partial<ReviewBriefModelRequest> = {}): ReviewBriefModelRequest {
  return {
    systemPrompt: 'Explain the request',
    material: '<<<TITLE>>>\nAdd VAT\n<<<END TITLE>>>',
    localPath: '/repos/sample-project',
    ...overrides,
  };
}

async function waitFor(milliseconds: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

describe('ReviewBriefModelEmberGateway', () => {
  it('returns the whole answer once the run is done', async () => {
    const transport = new StubEmberAnswerTransportGateway();
    transport.respondWith(async () => '{"what": "Adds VAT to every invoice line"}');
    const gateway = new ReviewBriefModelEmberGateway(transport);

    const result = await gateway.generate(request());

    expect(result).toEqual({
      status: 'completed',
      text: '{"what": "Adds VAT to every invoice line"}',
    });
  });

  it('sends the material as the question and the instructions as the system prompt', async () => {
    const transport = new StubEmberAnswerTransportGateway();
    const gateway = new ReviewBriefModelEmberGateway(transport);

    await gateway.generate(
      request({ systemPrompt: 'INSTRUCTIONS', material: 'MATERIAL', localPath: '/repos/x' }),
    );

    expect(transport.startedWith).toEqual([
      { question: 'MATERIAL', systemPrompt: 'INSTRUCTIONS', projectPath: '/repos/x' },
    ]);
  });

  it('fails with the transport reason when the run errors', async () => {
    const transport = new StubEmberAnswerTransportGateway();
    transport.failMidStream();
    const gateway = new ReviewBriefModelEmberGateway(transport);

    const result = await gateway.generate(request());

    expect(result).toEqual({ status: 'failed', reason: 'stub-mid-stream-failed' });
  });

  it('fails when the run cannot start', async () => {
    const transport = new StubEmberAnswerTransportGateway();
    transport.failStart();
    const gateway = new ReviewBriefModelEmberGateway(transport);

    const result = await gateway.generate(request());

    expect(result).toEqual({ status: 'failed', reason: 'stub-start-failed' });
  });

  it('cancels the run and fails when it does not finish in time', async () => {
    const transport = new StubEmberAnswerTransportGateway();
    transport.neverAnswer();
    const gateway = new ReviewBriefModelEmberGateway(transport, { timeoutMs: 10 });

    const result = await gateway.generate(request());

    expect(result).toEqual({ status: 'failed', reason: 'review-brief-timeout' });
    expect(transport.cancelCount).toBe(1);
  });

  it('does not cancel a run that finished in time', async () => {
    const transport = new StubEmberAnswerTransportGateway();
    const gateway = new ReviewBriefModelEmberGateway(transport, { timeoutMs: 10 });

    await gateway.generate(request());
    await waitFor(30);

    expect(transport.cancelCount).toBe(0);
  });
});

describe('ReviewBriefModelEmberGateway over the Claude transport', () => {
  it('dispatches the brief session under the review-brief job type and job id prefix', async () => {
    const sessionGateway = new StubClaudeSessionGateway();
    sessionGateway.setDispatchResult({ status: 'failed', rawStderr: 'not logged in' });
    const transport = new EmberAnswerTransportClaudeGateway(sessionGateway, {
      homeDir: tmpdir(),
      session: REVIEW_BRIEF_SESSION,
    });
    const gateway = new ReviewBriefModelEmberGateway(transport);

    await gateway.generate(request());

    expect(sessionGateway.dispatchCalls[0].jobType).toBe('review-brief');
    expect(sessionGateway.dispatchCalls[0].jobId).toMatch(/^review-brief-\d+$/);
  });
});
