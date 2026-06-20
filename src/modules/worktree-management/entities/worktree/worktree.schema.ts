import { z } from 'zod';

export const worktreePlatformSchema = z.enum(['gitlab', 'github']);
export type WorktreePlatform = z.infer<typeof worktreePlatformSchema>;

export const worktreeIdentitySchema = z.object({
  platform: worktreePlatformSchema,
  projectPath: z.string().min(1),
  mrNumber: z.number().int().positive(),
});
export type WorktreeIdentity = z.infer<typeof worktreeIdentitySchema>;

export type WorktreePath = string & { readonly __brand: 'WorktreePath' };

export type MrSource = { kind: 'origin' } | { kind: 'fork'; cloneUrl: string };

export interface FetchRef {
  remote: string;
  refspec: string;
  worktreeRef: string;
}

export interface WorktreeEntry {
  identity: WorktreeIdentity;
  path: WorktreePath;
  mtime: Date;
}

export type EnsureResult =
  | { status: 'created'; path: WorktreePath; settingsWarning: string | null }
  | { status: 'reused'; path: WorktreePath }
  | { status: 'failed'; reason: string };

export type RemoveResult =
  | { status: 'removed' }
  | { status: 'absent' }
  | { status: 'failed'; warning: string };

export type RemoveWorktreeAction = (input: {
  identity: WorktreeIdentity;
  sourceCheckoutPath: string;
}) => Promise<RemoveResult>;
