export type HookRangesFetchResult =
  | { kind: 'fetched'; ranges: string[] }
  | { kind: 'failed'; reason: string };

/** Reads the source ranges GitHub sends webhooks from (`hooks` in GitHub meta). */
export interface GitHubHookRangesGateway {
  fetchHookRanges(): Promise<HookRangesFetchResult>;
}
