import { describe, it, expect } from 'vitest';

import { GitHubHookRangesHttpGateway } from '@/modules/platform-integration/interface-adapters/gateways/transport/hookRanges.github.http.gateway.js';
import { GITHUB_HOOK_RANGES_SAMPLE } from '@/tests/factories/hookRangesSnapshot.factory.js';

type FetchCall = { url: string; init: RequestInit | undefined };

function fakeFetch(respond: () => Promise<Response>) {
  const calls: FetchCall[] = [];
  const fetchFunction = async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return respond();
  };
  return { fetchFunction, calls };
}

const CHUNK_BYTES = 65_536;

function streamedBody(totalChunks: number) {
  let pulledChunks = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (pulledChunks >= totalChunks) {
        controller.close();
        return;
      }
      pulledChunks += 1;
      controller.enqueue(new Uint8Array(CHUNK_BYTES).fill(0x20));
    },
  });
  return { stream, pulledChunks: () => pulledChunks };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('GitHubHookRangesHttpGateway', () => {
  it('returns the hooks ranges of GitHub meta', async () => {
    const { fetchFunction, calls } = fakeFetch(async () =>
      jsonResponse({ hooks: GITHUB_HOOK_RANGES_SAMPLE, web: ['1.2.3.4/32'] }),
    );
    const gateway = new GitHubHookRangesHttpGateway({ fetchFunction });

    const result = await gateway.fetchHookRanges();

    expect(result).toEqual({ kind: 'fetched', ranges: GITHUB_HOOK_RANGES_SAMPLE });
    expect(calls[0].url).toBe('https://api.github.com/meta');
  });

  it('identifies itself and asks for the GitHub json media type', async () => {
    const { fetchFunction, calls } = fakeFetch(async () =>
      jsonResponse({ hooks: GITHUB_HOOK_RANGES_SAMPLE }),
    );
    const gateway = new GitHubHookRangesHttpGateway({ fetchFunction });

    await gateway.fetchHookRanges();

    const headers = new Headers(calls[0].init?.headers);
    expect(headers.get('user-agent')).toBe('reviewflow');
    expect(headers.get('accept')).toBe('application/vnd.github+json');
    expect(calls[0].init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('refuses to follow redirects', async () => {
    const { fetchFunction, calls } = fakeFetch(async () =>
      jsonResponse({ hooks: GITHUB_HOOK_RANGES_SAMPLE }),
    );
    const gateway = new GitHubHookRangesHttpGateway({ fetchFunction });

    await gateway.fetchHookRanges();

    expect(calls[0].init?.redirect).toBe('error');
  });

  it('fails without reading the body when the declared length exceeds 2 MB', async () => {
    const { fetchFunction } = fakeFetch(
      async () =>
        new Response(JSON.stringify({ hooks: GITHUB_HOOK_RANGES_SAMPLE }), {
          status: 200,
          headers: { 'content-length': '2000001' },
        }),
    );
    const gateway = new GitHubHookRangesHttpGateway({ fetchFunction });

    const result = await gateway.fetchHookRanges();

    expect(result).toEqual({
      kind: 'failed',
      reason: 'GitHub meta body too large: 2000001 bytes',
    });
  });

  it('fails when an undeclared body exceeds 2 MB', async () => {
    const oversizedBody = JSON.stringify({
      hooks: GITHUB_HOOK_RANGES_SAMPLE,
      padding: 'x'.repeat(2_000_000),
    });
    const { fetchFunction } = fakeFetch(async () => new Response(oversizedBody, { status: 200 }));
    const gateway = new GitHubHookRangesHttpGateway({ fetchFunction });

    const result = await gateway.fetchHookRanges();

    expect(result.kind).toBe('failed');
    expect(result.kind === 'failed' ? result.reason : '').toContain('too large');
  });

  it('stops reading an undeclared body as soon as it exceeds 2 MB', async () => {
    const tenMegabytes = streamedBody(160);
    const { fetchFunction } = fakeFetch(
      async () => new Response(tenMegabytes.stream, { status: 200 }),
    );
    const gateway = new GitHubHookRangesHttpGateway({ fetchFunction });

    const result = await gateway.fetchHookRanges();

    expect(result.kind === 'failed' ? result.reason : '').toContain('too large');
    expect(tenMegabytes.pulledChunks()).toBeLessThanOrEqual(Math.ceil(2_000_000 / CHUNK_BYTES) + 2);
  });

  it('fails with the http status when GitHub answers an error', async () => {
    const { fetchFunction } = fakeFetch(async () => jsonResponse({ message: 'rate limited' }, 403));
    const gateway = new GitHubHookRangesHttpGateway({ fetchFunction });

    const result = await gateway.fetchHookRanges();

    expect(result).toEqual({ kind: 'failed', reason: 'GitHub meta answered HTTP 403' });
  });

  it('fails when the payload has no hooks ranges', async () => {
    const { fetchFunction } = fakeFetch(async () => jsonResponse({ hooks: [] }));
    const gateway = new GitHubHookRangesHttpGateway({ fetchFunction });

    const result = await gateway.fetchHookRanges();

    expect(result.kind).toBe('failed');
  });

  it('fails with the offending range when one hooks entry is not a CIDR range', async () => {
    const { fetchFunction } = fakeFetch(async () =>
      jsonResponse({ hooks: [...GITHUB_HOOK_RANGES_SAMPLE, 'oops'] }),
    );
    const gateway = new GitHubHookRangesHttpGateway({ fetchFunction });

    const result = await gateway.fetchHookRanges();

    expect(result.kind).toBe('failed');
    expect(result.kind === 'failed' ? result.reason : '').toContain('not a CIDR range: "oops"');
  });

  it('fails with the offending range when one hooks entry is too broad', async () => {
    const { fetchFunction } = fakeFetch(async () =>
      jsonResponse({ hooks: ['192.30.252.0/22', '0.0.0.0/0'] }),
    );
    const gateway = new GitHubHookRangesHttpGateway({ fetchFunction });

    const result = await gateway.fetchHookRanges();

    expect(result.kind).toBe('failed');
    expect(result.kind === 'failed' ? result.reason : '').toContain('too broad: "0.0.0.0/0"');
  });

  it('fails when the body is not json', async () => {
    const { fetchFunction } = fakeFetch(async () => new Response('<html>', { status: 200 }));
    const gateway = new GitHubHookRangesHttpGateway({ fetchFunction });

    const result = await gateway.fetchHookRanges();

    expect(result.kind).toBe('failed');
  });

  it('fails with the network error message when the request throws', async () => {
    const { fetchFunction } = fakeFetch(async () => {
      throw new Error('getaddrinfo ENOTFOUND api.github.com');
    });
    const gateway = new GitHubHookRangesHttpGateway({ fetchFunction });

    const result = await gateway.fetchHookRanges();

    expect(result).toEqual({ kind: 'failed', reason: 'getaddrinfo ENOTFOUND api.github.com' });
  });
});
