export type ReviewSession = {
  sessionId: string;
  worktree: string;
  mainPid: number;
  startedAt: string | null;
};

export interface ReviewSessionListingGateway {
  /** Claude sessions running in a review worktree, or `null` when the listing failed. */
  list(): Promise<ReviewSession[] | null>;
}
