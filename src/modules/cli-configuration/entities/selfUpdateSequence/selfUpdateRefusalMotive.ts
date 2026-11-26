export type SelfUpdateRefusalMotive =
  | { kind: 'reviews-in-progress'; count: number }
  | { kind: 'wrong-branch' }
  | { kind: 'dirty-checkout' }
  | { kind: 'missing-tool'; tool: 'git' | 'yarn' }
  | { kind: 'fetch-failed'; detail: string }
  | { kind: 'rebuild-failed' };
