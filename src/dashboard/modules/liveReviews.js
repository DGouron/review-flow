/**
 * Dashboard module — live review banners (SPEC-230).
 *
 * One compact banner per running or queued job: what Claude is doing, the
 * agent steps, the elapsed time and a cancel action.
 */

import { escapeHtml, sanitizeHttpUrl } from './html.js';
import { parseConventionalTitle } from './reviewQueue.js';

const STEP_STATE = { completed: 'done', running: 'now', failed: 'failed' };

/**
 * @param {number} milliseconds
 * @returns {string}
 */
export function formatElapsed(milliseconds) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours} h ${String(minutes).padStart(2, '0')} min`;
  if (minutes > 0) return `${minutes} min ${seconds} s`;
  return `${seconds} s`;
}

function kindKeyOf(job) {
  if (job.status === 'queued') return 'live.queued';
  return job.jobType === 'followup' ? 'live.followup' : 'live.review';
}

function stepsOf(job) {
  const agents = Array.isArray(job.progress?.agents) ? job.progress.agents : [];
  return agents.map((agent) => ({
    label: String(agent.displayName ?? agent.name ?? ''),
    state: STEP_STATE[agent.status] ?? 'pending',
  }));
}

/**
 * @param {Array<Record<string, any>>} activeJobs
 * @param {number} nowMs
 */
export function buildLiveReviewsModel(activeJobs, nowMs) {
  return [...activeJobs]
    .sort(
      (left, right) => (left.status === 'running' ? 0 : 1) - (right.status === 'running' ? 0 : 1),
    )
    .map((job) => {
      const startedAtMs =
        typeof job.startedAt === 'string' ? Date.parse(job.startedAt) : Number.NaN;
      return {
        jobId: String(job.id),
        jobType: job.jobType === 'followup' ? 'followup' : 'review',
        mrNumber: job.mrNumber,
        prefix: String(job.id).startsWith('gitlab') ? '!' : '#',
        subject: parseConventionalTitle(job.title ?? '').subject,
        project: String(job.project ?? ''),
        url: typeof job.mrUrl === 'string' ? job.mrUrl : '',
        kindKey: kindKeyOf(job),
        isRunning: job.status !== 'queued',
        steps: stepsOf(job),
        elapsed: Number.isNaN(startedAtMs) ? '' : formatElapsed(nowMs - startedAtMs),
      };
    });
}

function renderSteps(steps, t) {
  if (steps.length === 0) return '';
  const chips = steps
    .map((step) => `<span class="step is-${step.state}">${escapeHtml(step.label)}</span>`)
    .join('');
  return `<div class="live-steps" aria-label="${escapeHtml(t('live.steps'))}">${chips}</div>`;
}

/**
 * @param {ReturnType<typeof buildLiveReviewsModel>} model
 * @param {(key: string, params?: Record<string, string | number>) => string} t
 * @returns {string}
 */
export function renderLiveReviewsHtml(model, t) {
  return model
    .map(
      (
        banner,
      ) => `<section class="card live-review" aria-label="${escapeHtml(t('live.label'))}" data-job-id="${escapeHtml(banner.jobId)}">
  <span class="dot ${banner.isRunning ? 'dot-live' : 'dot-neutral'}" aria-hidden="true"></span>
  <div class="live-title">
    <span class="eyebrow">${escapeHtml(t(banner.kindKey))} · ${escapeHtml(banner.project)}</span>
    <a class="live-subject" href="${sanitizeHttpUrl(banner.url)}" target="_blank" rel="noopener noreferrer"><span class="mr-number">${escapeHtml(banner.prefix)}${banner.mrNumber}</span>${escapeHtml(banner.subject)}</a>
  </div>
  ${renderSteps(banner.steps, t)}
  <span class="live-elapsed mono" data-elapsed-for="${escapeHtml(banner.jobId)}">${escapeHtml(banner.elapsed)}</span>
  <button type="button" class="btn btn-ghost" data-action="cancel" data-job-id="${escapeHtml(banner.jobId)}" data-mr-number="${banner.mrNumber}" data-job-type="${banner.jobType}">${escapeHtml(t('live.cancel'))}</button>
</section>`,
    )
    .join('');
}
