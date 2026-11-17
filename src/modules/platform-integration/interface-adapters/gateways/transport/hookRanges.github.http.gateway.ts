import type {
  GitHubHookRangesGateway,
  HookRangesFetchResult,
} from '@/modules/platform-integration/entities/transport/githubHookRanges.gateway.js';
import { safeParseGitHubMetaResponse } from '@/modules/platform-integration/entities/transport/githubHookRanges.guard.js';

const GITHUB_META_URL = 'https://api.github.com/meta';
const REQUEST_TIMEOUT_MILLISECONDS = 10_000;
const MAXIMUM_BODY_BYTES = 2_000_000;
const BODY_TOO_LARGE_REASON = `GitHub meta body too large: more than ${MAXIMUM_BODY_BYTES} bytes`;

type FetchFunction = (url: string, init: RequestInit) => Promise<Response>;

async function readBodyWithinLimit(response: Response): Promise<string | null> {
  if (response.body === null) {
    return '';
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let receivedBytes = 0;
  for (let read = await reader.read(); !read.done; read = await reader.read()) {
    receivedBytes += read.value.byteLength;
    if (receivedBytes > MAXIMUM_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(read.value);
  }
  return Buffer.concat(chunks).toString('utf-8');
}

export interface GitHubHookRangesHttpGatewayOptions {
  fetchFunction?: FetchFunction;
}

export class GitHubHookRangesHttpGateway implements GitHubHookRangesGateway {
  private readonly fetchFunction: FetchFunction;

  constructor(options: GitHubHookRangesHttpGatewayOptions = {}) {
    this.fetchFunction = options.fetchFunction ?? fetch;
  }

  async fetchHookRanges(): Promise<HookRangesFetchResult> {
    try {
      const response = await this.fetchFunction(GITHUB_META_URL, {
        headers: { 'User-Agent': 'reviewflow', Accept: 'application/vnd.github+json' },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MILLISECONDS),
        redirect: 'error',
      });
      if (!response.ok) {
        return { kind: 'failed', reason: `GitHub meta answered HTTP ${response.status}` };
      }

      const declaredLength = Number(response.headers.get('content-length') ?? 0);
      if (declaredLength > MAXIMUM_BODY_BYTES) {
        return { kind: 'failed', reason: `GitHub meta body too large: ${declaredLength} bytes` };
      }
      const body = await readBodyWithinLimit(response);
      if (body === null) {
        return { kind: 'failed', reason: BODY_TOO_LARGE_REASON };
      }

      const parsed = safeParseGitHubMetaResponse(JSON.parse(body));
      if (!parsed.success) {
        const issues = parsed.error.issues.map((issue) => issue.message).join('; ');
        return { kind: 'failed', reason: `GitHub meta payload rejected: ${issues}` };
      }
      return { kind: 'fetched', ranges: parsed.data.hooks };
    } catch (error) {
      return { kind: 'failed', reason: error instanceof Error ? error.message : String(error) };
    }
  }
}
