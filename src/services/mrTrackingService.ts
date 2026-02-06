import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { execSync } from 'node:child_process';

/**
 * Review event - each review or followup on a MR
 */
export interface ReviewEvent {
  type: 'review' | 'followup';
  timestamp: string;
  durationMs: number;
  score: number | null;
  blocking: number;
  warnings: number;
  suggestions: number;
  threadsClosed: number;
  threadsOpened: number;
}

/**
 * Assignment info - who assigned the review
 */
export interface AssignmentInfo {
  username: string;
  displayName?: string;
  assignedAt: string;
}

/**
 * Tracked MR with full history
 */
export interface TrackedMr {
  id: string;
  mrNumber: number;
  title: string;
  url: string;
  project: string;
  platform: 'gitlab' | 'github';
  sourceBranch: string;
  targetBranch: string;

  // Assignment tracking
  assignment: AssignmentInfo;

  // Current state
  state: 'pending-review' | 'pending-fix' | 'pending-approval' | 'approved' | 'merged' | 'closed';
  openThreads: number;
  totalThreads: number;

  // Timeline
  createdAt: string;
  lastReviewAt: string | null;
  lastPushAt: string | null;
  approvedAt: string | null;
  mergedAt: string | null;

  // Review history
  reviews: ReviewEvent[];

  // Aggregated stats
  totalReviews: number;
  totalFollowups: number;
  totalBlocking: number;
  totalWarnings: number;
  totalSuggestions: number;
  totalDurationMs: number;
  averageScore: number | null;
  latestScore: number | null;

  autoFollowup: boolean;
}

/**
 * Project MR tracking data
 */
export interface MrTrackingData {
  mrs: TrackedMr[];
  lastUpdated: string;

  // Global project stats (computed)
  stats: {
    totalMrs: number;
    totalReviews: number;
    totalFollowups: number;
    averageReviewsPerMr: number;
    averageTimeToApproval: number | null; // ms
    topAssigners: Array<{ username: string; count: number }>;
  };
}

function getTrackingPath(projectPath: string): string {
  return join(projectPath, '.claude', 'reviews', 'mr-tracking.json');
}

function createEmptyStats(): MrTrackingData['stats'] {
  return {
    totalMrs: 0,
    totalReviews: 0,
    totalFollowups: 0,
    averageReviewsPerMr: 0,
    averageTimeToApproval: null,
    topAssigners: [],
  };
}

function recalculateStats(data: MrTrackingData): void {
  const mrs = data.mrs;

  data.stats.totalMrs = mrs.length;
  data.stats.totalReviews = mrs.reduce((sum, mr) => sum + mr.totalReviews, 0);
  data.stats.totalFollowups = mrs.reduce((sum, mr) => sum + mr.totalFollowups, 0);

  if (mrs.length > 0) {
    data.stats.averageReviewsPerMr = (data.stats.totalReviews + data.stats.totalFollowups) / mrs.length;
  }

  // Calculate average time to approval
  const approvedMrs = mrs.filter((mr) => mr.approvedAt && mr.createdAt);
  if (approvedMrs.length > 0) {
    const totalTime = approvedMrs.reduce((sum, mr) => {
      const created = new Date(mr.createdAt).getTime();
      const approved = new Date(mr.approvedAt!).getTime();
      return sum + (approved - created);
    }, 0);
    data.stats.averageTimeToApproval = totalTime / approvedMrs.length;
  }

  // Top assigners
  const assignerCounts = new Map<string, number>();
  for (const mr of mrs) {
    const username = mr.assignment.username;
    assignerCounts.set(username, (assignerCounts.get(username) || 0) + 1);
  }
  data.stats.topAssigners = Array.from(assignerCounts.entries())
    .map(([username, count]) => ({ username, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

export function loadMrTracking(projectPath: string): MrTrackingData {
  const trackingPath = getTrackingPath(projectPath);

  if (!existsSync(trackingPath)) {
    return { mrs: [], lastUpdated: new Date().toISOString(), stats: createEmptyStats() };
  }

  try {
    const content = readFileSync(trackingPath, 'utf-8');
    const data = JSON.parse(content) as MrTrackingData;

    // Ensure arrays and stats exist
    if (!Array.isArray(data.mrs)) {
      data.mrs = [];
    }
    if (!data.stats) {
      data.stats = createEmptyStats();
    }

    for (const mr of data.mrs) {
      if (mr.autoFollowup === undefined) {
        mr.autoFollowup = true;
      }
    }

    return data;
  } catch {
    return { mrs: [], lastUpdated: new Date().toISOString(), stats: createEmptyStats() };
  }
}

export function saveMrTracking(projectPath: string, data: MrTrackingData): void {
  const trackingPath = getTrackingPath(projectPath);

  const dir = dirname(trackingPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  // Recalculate stats before saving
  recalculateStats(data);
  data.lastUpdated = new Date().toISOString();

  writeFileSync(trackingPath, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * Create or update a tracked MR when assigned for review
 */
export function trackMrAssignment(
  projectPath: string,
  mrInfo: {
    mrNumber: number;
    title: string;
    url: string;
    project: string;
    platform: 'gitlab' | 'github';
    sourceBranch: string;
    targetBranch: string;
  },
  assignedBy: { username: string; displayName?: string }
): TrackedMr {
  const data = loadMrTracking(projectPath);
  const mrId = `${mrInfo.platform}-${mrInfo.project}-${mrInfo.mrNumber}`;
  const existingIndex = data.mrs.findIndex((mr) => mr.id === mrId);

  if (existingIndex >= 0) {
    // MR already tracked, update assignment info but KEEP existing state
    // Don't reset state - the MR might be in pending-fix waiting for followup
    const existing = data.mrs[existingIndex];
    existing.title = mrInfo.title;
    existing.assignment = {
      username: assignedBy.username,
      displayName: assignedBy.displayName,
      assignedAt: new Date().toISOString(),
    };
    // Only set to pending-review if it's a new MR or was merged/closed
    if (['merged', 'closed'].includes(existing.state)) {
      existing.state = 'pending-review';
    }
    saveMrTracking(projectPath, data);
    return existing;
  }

  // Create new tracked MR
  const now = new Date().toISOString();
  const trackedMr: TrackedMr = {
    id: mrId,
    mrNumber: mrInfo.mrNumber,
    title: mrInfo.title,
    url: mrInfo.url,
    project: mrInfo.project,
    platform: mrInfo.platform,
    sourceBranch: mrInfo.sourceBranch,
    targetBranch: mrInfo.targetBranch,

    assignment: {
      username: assignedBy.username,
      displayName: assignedBy.displayName,
      assignedAt: now,
    },

    state: 'pending-review',
    openThreads: 0,
    totalThreads: 0,

    createdAt: now,
    lastReviewAt: null,
    lastPushAt: null,
    approvedAt: null,
    mergedAt: null,

    reviews: [],

    totalReviews: 0,
    totalFollowups: 0,
    totalBlocking: 0,
    totalWarnings: 0,
    totalSuggestions: 0,
    totalDurationMs: 0,
    averageScore: null,
    latestScore: null,
    autoFollowup: true,
  };

  data.mrs.push(trackedMr);
  saveMrTracking(projectPath, data);
  return trackedMr;
}

/**
 * Record a review completion on a MR
 */
export function recordReviewCompletion(
  projectPath: string,
  mrId: string,
  reviewData: {
    type: 'review' | 'followup';
    durationMs: number;
    score: number | null;
    blocking: number;
    warnings: number;
    suggestions?: number;
    threadsOpened?: number;
    threadsClosed?: number;
  }
): TrackedMr | undefined {
  const data = loadMrTracking(projectPath);
  const mr = data.mrs.find((m) => m.id === mrId);

  if (!mr) return undefined;

  const now = new Date().toISOString();

  // Add review event
  const event: ReviewEvent = {
    type: reviewData.type,
    timestamp: now,
    durationMs: reviewData.durationMs,
    score: reviewData.score,
    blocking: reviewData.blocking,
    warnings: reviewData.warnings,
    suggestions: reviewData.suggestions ?? 0,
    threadsOpened: reviewData.threadsOpened ?? 0,
    threadsClosed: reviewData.threadsClosed ?? 0,
  };
  mr.reviews.push(event);

  // Update aggregates
  mr.lastReviewAt = now;
  if (reviewData.type === 'review') {
    mr.totalReviews++;
  } else {
    mr.totalFollowups++;
  }
  mr.totalBlocking += reviewData.blocking;
  mr.totalWarnings += reviewData.warnings;
  mr.totalSuggestions += reviewData.suggestions ?? 0;
  mr.totalDurationMs += reviewData.durationMs;

  // Update thread counts
  mr.openThreads = Math.max(0, mr.openThreads + (reviewData.threadsOpened ?? 0) - (reviewData.threadsClosed ?? 0));
  mr.totalThreads += reviewData.threadsOpened ?? 0;

  // Update latest score (current state of the MR)
  if (reviewData.score !== null) {
    mr.latestScore = reviewData.score;
  }

  // Recalculate average score (historical metric)
  const reviewsWithScore = mr.reviews.filter((r) => r.score !== null);
  if (reviewsWithScore.length > 0) {
    mr.averageScore = reviewsWithScore.reduce((sum, r) => sum + (r.score ?? 0), 0) / reviewsWithScore.length;
  }

  // Update state based on blocking issues
  if (reviewData.blocking > 0 || mr.openThreads > 0) {
    mr.state = 'pending-fix';
  } else {
    mr.state = 'pending-approval';
  }

  saveMrTracking(projectPath, data);
  return mr;
}

/**
 * Record a push event on a MR
 */
export function recordMrPush(
  projectPath: string,
  mrNumber: number,
  platform: 'gitlab' | 'github'
): TrackedMr | undefined {
  const data = loadMrTracking(projectPath);
  const mr = data.mrs.find((m) => m.mrNumber === mrNumber && m.platform === platform);

  if (!mr) return undefined;

  mr.lastPushAt = new Date().toISOString();
  saveMrTracking(projectPath, data);
  return mr;
}

/**
 * Update thread counts for a MR (from GitLab/GitHub API)
 */
export function updateMrThreads(
  projectPath: string,
  mrId: string,
  openThreads: number,
  totalThreads: number
): TrackedMr | undefined {
  const data = loadMrTracking(projectPath);
  const mr = data.mrs.find((m) => m.id === mrId);

  if (!mr) return undefined;

  mr.openThreads = openThreads;
  mr.totalThreads = totalThreads;

  // Update state based on threads
  if (openThreads > 0) {
    mr.state = 'pending-fix';
  } else if (mr.state === 'pending-fix') {
    mr.state = 'pending-approval';
  }

  saveMrTracking(projectPath, data);
  return mr;
}

/**
 * Mark MR as approved
 */
export function approveMr(projectPath: string, mrId: string): boolean {
  const data = loadMrTracking(projectPath);
  const mr = data.mrs.find((m) => m.id === mrId);

  if (!mr) return false;

  mr.state = 'approved';
  mr.approvedAt = new Date().toISOString();
  saveMrTracking(projectPath, data);
  return true;
}

/**
 * Mark MR as merged and archive it
 */
export function markMrMerged(projectPath: string, mrId: string): boolean {
  const data = loadMrTracking(projectPath);
  const mr = data.mrs.find((m) => m.id === mrId);

  if (!mr) return false;

  mr.state = 'merged';
  mr.mergedAt = new Date().toISOString();
  saveMrTracking(projectPath, data);
  return true;
}

/**
 * Mark MR as closed (abandoned)
 */
export function markMrClosed(projectPath: string, mrId: string): boolean {
  const data = loadMrTracking(projectPath);
  const mr = data.mrs.find((m) => m.id === mrId);

  if (!mr) return false;

  mr.state = 'closed';
  saveMrTracking(projectPath, data);
  return true;
}

/**
 * Remove MR from tracking completely (no history kept)
 */
export function removeMrFromTracking(projectPath: string, mrId: string): boolean {
  const data = loadMrTracking(projectPath);

  if (data.mrs.length === 0) return false;

  const index = data.mrs.findIndex((mr) => mr.id === mrId);

  if (index < 0) return false;

  data.mrs.splice(index, 1);
  saveMrTracking(projectPath, data);
  return true;
}

/**
 * Recompute project stats from current MR data
 */
export function recomputeProjectStats(projectPath: string): void {
  const data = loadMrTracking(projectPath);
  recalculateStats(data);
  data.lastUpdated = new Date().toISOString();

  const trackingPath = getTrackingPath(projectPath);
  const dir = dirname(trackingPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(trackingPath, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * Remove MR from active tracking (keeps in history)
 */
export function archiveMr(projectPath: string, mrId: string): boolean {
  const data = loadMrTracking(projectPath);
  const index = data.mrs.findIndex((m) => m.id === mrId);

  if (index < 0) return false;

  data.mrs.splice(index, 1);
  saveMrTracking(projectPath, data);
  return true;
}

/**
 * Toggle auto-followup for a specific MR
 */
export function setAutoFollowup(
  projectPath: string,
  mrId: string,
  enabled: boolean
): TrackedMr | null {
  const data = loadMrTracking(projectPath);
  const mr = data.mrs.find((m) => m.id === mrId);

  if (!mr) return null;

  mr.autoFollowup = enabled;
  saveMrTracking(projectPath, data);
  return mr;
}

/**
 * Get MRs pending fix (with open threads or blocking issues)
 */
export function getPendingFixMrs(projectPath: string): TrackedMr[] {
  const data = loadMrTracking(projectPath);
  return data.mrs.filter((mr) => mr.state === 'pending-fix');
}

/**
 * Get MRs pending approval (all threads resolved)
 */
export function getPendingApprovalMrs(projectPath: string): TrackedMr[] {
  const data = loadMrTracking(projectPath);
  return data.mrs.filter((mr) => mr.state === 'pending-approval');
}

/**
 * Get MRs pending initial review
 */
export function getPendingReviewMrs(projectPath: string): TrackedMr[] {
  const data = loadMrTracking(projectPath);
  return data.mrs.filter((mr) => mr.state === 'pending-review');
}

/**
 * Check if a MR needs a followup review
 */
export function needsFollowupReview(
  projectPath: string,
  mrNumber: number,
  platform: 'gitlab' | 'github'
): boolean {
  const data = loadMrTracking(projectPath);
  const mr = data.mrs.find((m) => m.mrNumber === mrNumber && m.platform === platform);

  if (!mr) return false;
  if (mr.state !== 'pending-fix') return false;
  if (!mr.lastPushAt || !mr.lastReviewAt) return false;

  const pushTime = new Date(mr.lastPushAt).getTime();
  const reviewTime = new Date(mr.lastReviewAt).getTime();

  return pushTime > reviewTime;
}

/**
 * Get tracking stats for a project
 */
export function getTrackingStats(projectPath: string): MrTrackingData['stats'] {
  const data = loadMrTracking(projectPath);
  return data.stats;
}

/**
 * Get detailed stats for a specific MR
 */
export function getMrDetails(projectPath: string, mrId: string): TrackedMr | undefined {
  const data = loadMrTracking(projectPath);
  return data.mrs.find((m) => m.id === mrId);
}

/**
 * Get all active MRs (not merged/closed)
 */
export function getActiveMrs(projectPath: string): TrackedMr[] {
  const data = loadMrTracking(projectPath);
  return data.mrs.filter((mr) => !['merged', 'closed'].includes(mr.state));
}

/**
 * Legacy compatibility - track MR after review (calls new functions)
 */
export function trackMrAfterReview(
  projectPath: string,
  mrInfo: {
    mrNumber: number;
    title: string;
    url: string;
    project: string;
    platform: 'gitlab' | 'github';
  },
  threadCount: { open: number; total: number }
): TrackedMr {
  const mrId = `${mrInfo.platform}-${mrInfo.project}-${mrInfo.mrNumber}`;
  const data = loadMrTracking(projectPath);
  let mr = data.mrs.find((m) => m.id === mrId);

  if (!mr) {
    // Create with minimal info if not exists
    mr = trackMrAssignment(
      projectPath,
      {
        ...mrInfo,
        sourceBranch: 'unknown',
        targetBranch: 'unknown',
      },
      { username: 'unknown' }
    );
  }

  // Update thread counts
  updateMrThreads(projectPath, mrId, threadCount.open, threadCount.total);

  return loadMrTracking(projectPath).mrs.find((m) => m.id === mrId)!;
}

/**
 * Sync thread counts from GitLab API for all active MRs
 */
export async function syncGitLabThreads(projectPath: string): Promise<void> {
  const data = loadMrTracking(projectPath);
  const gitlabMrs = data.mrs.filter(
    (mr) => mr.platform === 'gitlab' && !['merged', 'closed'].includes(mr.state)
  );

  for (const mr of gitlabMrs) {
    try {
      const threads = fetchGitLabThreads(mr.project, mr.mrNumber);
      if (threads) {
        updateMrThreads(projectPath, mr.id, threads.open, threads.total);
      }
    } catch {
      // Silently ignore individual MR sync failures
    }
  }
}

/**
 * Fetch thread counts from GitLab API using glab CLI
 */
function fetchGitLabThreads(
  project: string,
  mrNumber: number
): { open: number; total: number; resolvable: number } | null {
  try {
    // URL-encode the project path
    const encodedProject = encodeURIComponent(project);

    // Fetch discussions from GitLab API
    const result = execSync(
      `glab api "projects/${encodedProject}/merge_requests/${mrNumber}/discussions"`,
      { encoding: 'utf-8', timeout: 10000 }
    );

    const discussions = JSON.parse(result);

    let total = 0;
    let open = 0;
    let resolvable = 0;

    for (const discussion of discussions) {
      // Skip system notes (not real discussions)
      if (discussion.individual_note) continue;

      // Count resolvable threads (code review comments)
      const notes = discussion.notes || [];
      const firstNote = notes[0];

      if (firstNote?.resolvable) {
        resolvable++;
        total++;

        // Check if thread is unresolved
        if (!firstNote.resolved) {
          open++;
        }
      }
    }

    return { open, total, resolvable };
  } catch {
    return null;
  }
}

/**
 * Sync a single MR's threads from GitLab or GitHub
 */
export function syncSingleMrThreads(
  projectPath: string,
  mrId: string
): TrackedMr | null {
  const data = loadMrTracking(projectPath);
  const mr = data.mrs.find((m) => m.id === mrId);

  if (!mr) {
    return null;
  }

  let threads: { open: number; total: number } | null = null;

  if (mr.platform === 'gitlab') {
    threads = fetchGitLabThreads(mr.project, mr.mrNumber);
  } else if (mr.platform === 'github') {
    threads = fetchGitHubThreads(mr.project, mr.mrNumber);
  }

  if (threads) {
    return updateMrThreads(projectPath, mr.id, threads.open, threads.total) || null;
  }

  return null;
}

/**
 * Sync thread counts from GitHub API for all active PRs
 */
export async function syncGitHubThreads(projectPath: string): Promise<void> {
  const data = loadMrTracking(projectPath);
  const githubPrs = data.mrs.filter(
    (mr) => mr.platform === 'github' && !['merged', 'closed'].includes(mr.state)
  );

  for (const pr of githubPrs) {
    try {
      const threads = fetchGitHubThreads(pr.project, pr.mrNumber);
      if (threads) {
        updateMrThreads(projectPath, pr.id, threads.open, threads.total);
      }
    } catch {
      // Silently ignore individual PR sync failures
    }
  }
}

/**
 * Fetch thread counts from GitHub API using gh CLI
 */
function fetchGitHubThreads(
  repo: string,
  prNumber: number
): { open: number; total: number } | null {
  try {
    // Fetch review threads from GitHub API
    const result = execSync(
      `gh api "repos/${repo}/pulls/${prNumber}/comments"`,
      { encoding: 'utf-8', timeout: 10000 }
    );

    const comments = JSON.parse(result);

    // Group comments by thread (in_reply_to_id)
    const threadIds = new Set<number>();
    const resolvedThreads = new Set<number>();

    for (const comment of comments) {
      // Each top-level comment starts a thread
      if (!comment.in_reply_to_id) {
        threadIds.add(comment.id);
      }
    }

    // Check review state (approved/changes_requested)
    try {
      const reviewsResult = execSync(
        `gh api "repos/${repo}/pulls/${prNumber}/reviews"`,
        { encoding: 'utf-8', timeout: 10000 }
      );
      const reviews = JSON.parse(reviewsResult);

      // Count pending review threads (not approved yet)
      let _pendingReviews = 0;
      for (const review of reviews) {
        if (review.state === 'CHANGES_REQUESTED' || review.state === 'COMMENTED') {
          _pendingReviews++;
        }
      }
    } catch {
      // Ignore review fetch errors
    }

    const total = threadIds.size;
    const open = total - resolvedThreads.size;

    return { open, total };
  } catch {
    return null;
  }
}

/**
 * Sync all platforms' threads
 */
export async function syncAllThreads(projectPath: string): Promise<void> {
  await syncGitLabThreads(projectPath);
  await syncGitHubThreads(projectPath);
}
