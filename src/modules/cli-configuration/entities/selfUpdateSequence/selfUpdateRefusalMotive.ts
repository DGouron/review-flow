export type SelfUpdateRefusalMotive =
  | { kind: 'reviews-in-progress'; count: number }
  | { kind: 'wrong-branch' }
  | { kind: 'dirty-checkout' }
  | { kind: 'missing-tool'; tool: 'git' | 'yarn' }
  | { kind: 'fetch-failed'; detail: string }
  | { kind: 'rebuild-failed' }
  | { kind: 'latest-version-unavailable' }
  | { kind: 'version-not-on-registry'; version: string }
  | { kind: 'install-not-applied'; expectedVersion: string; installedVersion: string | null };
