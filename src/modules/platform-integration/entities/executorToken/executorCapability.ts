export type ExecutorCapability = 'readMr' | 'postComment' | 'threadResolve' | 'revoke';

export type GitLabRole = 'reporter' | 'developer';

export interface CapabilityDeclaration {
  readonly minRole: GitLabRole;
  readonly autoPath: boolean;
}

export const EXECUTOR_CAPABILITY_TABLE: Readonly<
  Record<ExecutorCapability, CapabilityDeclaration>
> = {
  readMr: { minRole: 'reporter', autoPath: true },
  postComment: { minRole: 'reporter', autoPath: true },
  threadResolve: { minRole: 'developer', autoPath: false },
  revoke: { minRole: 'developer', autoPath: false },
};

const ALL_EXECUTOR_CAPABILITIES: readonly ExecutorCapability[] = [
  'readMr',
  'postComment',
  'threadResolve',
  'revoke',
];

export const AUTO_EXECUTOR_CAPABILITIES: ReadonlySet<ExecutorCapability> = new Set(
  ALL_EXECUTOR_CAPABILITIES.filter((capability) => EXECUTOR_CAPABILITY_TABLE[capability].autoPath),
);
