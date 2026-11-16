import type {
  GitHubHookRangesGateway,
  HookRangesFetchResult,
} from '@/modules/platform-integration/entities/transport/githubHookRanges.gateway.js';

export class StubGitHubHookRangesGateway implements GitHubHookRangesGateway {
  fetchCount = 0;

  constructor(private nextResult: HookRangesFetchResult) {}

  static returning(ranges: string[]): StubGitHubHookRangesGateway {
    return new StubGitHubHookRangesGateway({ kind: 'fetched', ranges });
  }

  static failing(reason: string): StubGitHubHookRangesGateway {
    return new StubGitHubHookRangesGateway({ kind: 'failed', reason });
  }

  willReturn(result: HookRangesFetchResult): void {
    this.nextResult = result;
  }

  async fetchHookRanges(): Promise<HookRangesFetchResult> {
    this.fetchCount += 1;
    return this.nextResult;
  }
}
