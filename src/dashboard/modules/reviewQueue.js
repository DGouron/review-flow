/**
 * Dashboard module — review queue by actor (SPEC-230).
 *
 * Pure: sorts tracked merge requests and running jobs into the lane of whoever
 * must act next — you approve, the author fixes, Claude reviews — and sets apart
 * the ones idle for more than a month.
 */

import { latestOutcomeOf } from './quality.js';

export const DORMANT_AFTER_DAYS = 30;
export const QUEUE_LANES = ['approve', 'fix', 'review', 'dormant'];

const DAY_MS = 24 * 60 * 60 * 1000;
const ACTIVITY_FIELDS = ['createdAt', 'lastPushAt', 'lastReviewAt', 'approvedAt'];

/**
 * @param {Record<string, unknown>} mergeRequest
 * @returns {string | null}
 */
export function lastActivityOf(mergeRequest) {
  const timestamps = ACTIVITY_FIELDS.map((field) => mergeRequest[field])
    .filter((value) => typeof value === 'string' && !Number.isNaN(Date.parse(value)))
    .sort((left, right) => Date.parse(right) - Date.parse(left));
  return timestamps[0] ?? null;
}

/**
 * @param {string | null | undefined} remoteUrl
 * @returns {string | null}
 */
export function projectSlugOf(remoteUrl) {
  if (typeof remoteUrl !== 'string' || remoteUrl.trim() === '') return null;
  const withoutSuffix = remoteUrl
    .trim()
    .replace(/\.git$/, '')
    .replace(/\/$/, '');
  const sshMatch = withoutSuffix.match(/^[^@\s]+@[^:]+:(.+)$/);
  if (sshMatch) return sshMatch[1];
  const httpMatch = withoutSuffix.match(/^[a-z]+:\/\/[^/]+\/(.+)$/i);
  return httpMatch ? httpMatch[1] : null;
}

/**
 * @param {string} title
 * @returns {{ scope: string | null, breaking: boolean, subject: string }}
 */
export function parseConventionalTitle(title) {
  const text = String(title ?? '');
  const match = text.match(/^\w+(?:\(([^)]+)\))?(!)?:\s*(.+)$/);
  if (!match) return { scope: null, breaking: false, subject: text };
  const subject = match[3];
  return {
    scope: match[1] ?? null,
    breaking: match[2] === '!',
    subject: subject.charAt(0).toUpperCase() + subject.slice(1),
  };
}

/**
 * @param {string} label
 * @returns {string}
 */
function initialsOf(label) {
  const words = label.split(/[\s._-]+/).filter(Boolean);
  if (words.length >= 2) return (words[0].charAt(0) + words[1].charAt(0)).toUpperCase();
  return label.slice(0, 2).toUpperCase();
}

/**
 * @param {{ username?: string, displayName?: string | null } | null | undefined} author
 */
function toAuthor(author) {
  if (!author?.username) return null;
  const label = author.displayName || author.username;
  return { username: author.username, label, initials: initialsOf(label) };
}

function idleDaysOf(timestamp, nowMs) {
  if (timestamp === null) return 0;
  return Math.max(0, Math.floor((nowMs - Date.parse(timestamp)) / DAY_MS));
}

function threadsOf(mergeRequest) {
  const open = Number(mergeRequest.openThreads) || 0;
  const total = Number(mergeRequest.totalThreads) || 0;
  const tone = total === 0 ? 'none' : open === 0 ? 'ok' : 'warn';
  return { open, total, tone };
}

function trackedReason(mergeRequest, lane, sourceLane) {
  const openThreads = Number(mergeRequest.openThreads) || 0;
  const warnings = Number(mergeRequest.totalWarnings) || 0;
  if (lane === 'dormant') {
    const key = sourceLane === 'fix' ? 'queue.reason.dormantChanges' : 'queue.reason.dormantReady';
    return { key, params: {}, tone: 'warn' };
  }
  if (lane === 'fix' && openThreads > 0) {
    return { key: 'queue.reason.openThreads', params: { count: openThreads }, tone: 'warn' };
  }
  if (lane === 'fix') return { key: 'queue.reason.changesRequested', params: {}, tone: 'warn' };
  if (warnings > 0)
    return { key: 'queue.reason.warningsLeft', params: { count: warnings }, tone: 'warn' };
  const key =
    threadsOf(mergeRequest).total > 0 ? 'queue.reason.allResolved' : 'queue.reason.noFinding';
  return { key, params: {}, tone: 'ok' };
}

function jobReason(job) {
  if (job.status === 'queued') return { key: 'queue.reason.queued', params: {}, tone: 'neutral' };
  const key =
    job.jobType === 'followup' ? 'queue.reason.followupRunning' : 'queue.reason.reviewRunning';
  return { key, params: {}, tone: 'neutral' };
}

function baseRow(source, title, url) {
  const parsedTitle = parseConventionalTitle(title);
  return {
    mrNumber: source.mrNumber,
    prefix: source.platform === 'gitlab' || String(source.id).startsWith('gitlab') ? '!' : '#',
    subject: parsedTitle.subject,
    scope: parsedTitle.scope,
    breaking: parsedTitle.breaking,
    url: typeof url === 'string' ? url : '',
  };
}

function trackedRow(mergeRequest, sourceLane, nowMs) {
  const lastActivity = lastActivityOf(mergeRequest);
  const idleDays = idleDaysOf(lastActivity, nowMs);
  const lane = idleDays > DORMANT_AFTER_DAYS ? 'dormant' : sourceLane;
  return {
    ...baseRow(mergeRequest, mergeRequest.title, mergeRequest.url),
    id: String(mergeRequest.id),
    lane,
    sourceLane,
    author: toAuthor(mergeRequest.author),
    reason: trackedReason(mergeRequest, lane, sourceLane),
    threads: threadsOf(mergeRequest),
    lastActivity,
    idleDays,
    outcome: latestOutcomeOf(mergeRequest),
    jobId: null,
    jobStatus: null,
  };
}

function jobRow(job, tracked, nowMs) {
  const base = tracked ? trackedRow(tracked, tracked.sourceLane, nowMs) : null;
  const jobAuthor = String(job.id).startsWith('github') ? toAuthor(job.author) : null;
  return {
    ...baseRow(job, base ? tracked.title : job.title, job.mrUrl),
    id: base ? base.id : String(job.id),
    lane: 'review',
    sourceLane: base ? base.sourceLane : 'review',
    author: base ? base.author : jobAuthor,
    reason: jobReason(job),
    threads: base ? base.threads : { open: 0, total: 0, tone: 'none' },
    lastActivity: base ? base.lastActivity : null,
    idleDays: 0,
    outcome: base ? base.outcome : { verdict: null, grade: null },
    jobId: String(job.id),
    jobStatus: job.status === 'queued' ? 'queued' : 'running',
  };
}

function collectRows(input) {
  const tracked = [
    ...(input.pendingApproval ?? []).map((mergeRequest) => ({
      ...mergeRequest,
      sourceLane: 'approve',
    })),
    ...(input.pendingFix ?? []).map((mergeRequest) => ({ ...mergeRequest, sourceLane: 'fix' })),
  ];
  const aliases = new Set(input.projectAliases ?? []);
  const jobs = (input.activeJobs ?? []).filter((job) => aliases.has(job.project));
  const keyOf = (project, mrNumber) => `${project}#${mrNumber}`;
  const underReview = new Set(jobs.map((job) => keyOf(job.project, job.mrNumber)));
  const findTracked = (job) =>
    tracked.find(
      (mergeRequest) =>
        keyOf(mergeRequest.project, mergeRequest.mrNumber) === keyOf(job.project, job.mrNumber),
    );
  return [
    ...tracked
      .filter(
        (mergeRequest) => !underReview.has(keyOf(mergeRequest.project, mergeRequest.mrNumber)),
      )
      .map((mergeRequest) => trackedRow(mergeRequest, mergeRequest.sourceLane, input.nowMs)),
    ...jobs.map((job) => jobRow(job, findTracked(job), input.nowMs)),
  ];
}

function compareRows(lane) {
  if (lane === 'review') {
    return (left, right) =>
      (left.jobStatus === 'running' ? 0 : 1) - (right.jobStatus === 'running' ? 0 : 1);
  }
  return (left, right) => (right.idleDays ?? 0) - (left.idleDays ?? 0);
}

function authorsOf(rows) {
  const byUsername = new Map();
  for (const row of rows) {
    if (!row.author) continue;
    const existing = byUsername.get(row.author.username);
    byUsername.set(row.author.username, { ...row.author, count: (existing?.count ?? 0) + 1 });
  }
  return [...byUsername.values()].sort((left, right) => left.label.localeCompare(right.label));
}

/**
 * @param {{
 *   pendingFix: Array<Record<string, unknown>>,
 *   pendingApproval: Array<Record<string, unknown>>,
 *   activeJobs: Array<Record<string, unknown>>,
 *   projectAliases: string[],
 *   nowMs: number,
 *   activeLane: string,
 *   authorFilter: string | null,
 * }} input
 */
export function buildReviewQueueModel(input) {
  const activeLane = QUEUE_LANES.includes(input.activeLane) ? input.activeLane : 'approve';
  const allRows = collectRows(input);
  const visibleRows = input.authorFilter
    ? allRows.filter((row) => row.author?.username === input.authorFilter)
    : allRows;
  const rows = visibleRows.filter((row) => row.lane === activeLane).sort(compareRows(activeLane));
  return {
    activeLane,
    authorFilter: input.authorFilter ?? null,
    lanes: QUEUE_LANES.map((key) => ({
      key,
      count: visibleRows.filter((row) => row.lane === key).length,
    })),
    authors: authorsOf(allRows),
    rows,
    allRows,
    dormantIds: visibleRows.filter((row) => row.lane === 'dormant').map((row) => row.id),
  };
}
