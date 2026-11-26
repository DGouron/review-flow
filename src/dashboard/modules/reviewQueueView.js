/**
 * Dashboard module — review queue rendering (SPEC-230).
 *
 * Humble rendering of the model built by reviewQueue.js: lane tabs, author
 * filter and one row per merge request with its action on the row. Clicks are
 * delegated through `data-action` attributes; no inline handlers.
 */

import { escapeHtml, sanitizeHttpUrl } from './html.js';
import { icon } from './icons.js';
import { DORMANT_AFTER_DAYS } from './reviewQueue.js';

/** @typedef {(key: string, params?: Record<string, string | number>) => string} Translate */

const LANE_ACTOR_KEY = {
  approve: 'queue.lane.approve.actor',
  fix: 'queue.lane.fix.actor',
  review: 'queue.lane.review.actor',
  dormant: 'queue.lane.dormant.actor',
};

/**
 * @param {number} idleDays
 * @param {Translate} t
 * @returns {string}
 */
export function formatIdleAge(idleDays, t) {
  if (idleDays <= 0) return t('queue.age.today');
  if (idleDays === 1) return t('queue.age.yesterday');
  if (idleDays <= DORMANT_AFTER_DAYS) return t('queue.age.days', { count: idleDays });
  return t('queue.age.months', { count: Math.max(1, Math.round(idleDays / 30)) });
}

/**
 * @param {string} url
 * @param {string} prefix
 * @returns {string}
 */
export function approvalUrlOf(url, prefix) {
  const safeUrl = sanitizeHttpUrl(url);
  if (safeUrl === '#' || prefix !== '#') return safeUrl;
  return `${safeUrl.replace(/\/$/, '')}/files`;
}

function renderLaneTabs(model, t) {
  const tabs = model.lanes
    .map((lane) => {
      const isActive = lane.key === model.activeLane;
      return `<button type="button" class="queue-tab${isActive ? ' is-active' : ''}" data-action="lane" data-lane="${lane.key}" aria-current="${isActive ? 'page' : 'false'}">${escapeHtml(t(`queue.lane.${lane.key}`))}<span class="count">${lane.count}</span><span class="queue-tab-actor">${escapeHtml(t(LANE_ACTOR_KEY[lane.key], { days: DORMANT_AFTER_DAYS }))}</span></button>`;
    })
    .join('');
  return `<nav class="queue-tabs" aria-label="${escapeHtml(t('queue.lanesLabel'))}">${tabs}</nav>`;
}

function renderLaneContext(model, t, options) {
  const isDormant = model.activeLane === 'dormant' && model.dormantIds.length > 0;
  const nudgeLabel =
    options.armedNudge === 'all'
      ? t('queue.action.confirmNudgeAll', { count: model.dormantIds.length })
      : t('queue.action.nudgeAll');
  const nudgeButton = isDormant
    ? `<button type="button" class="btn${options.armedNudge === 'all' ? ' btn-primary' : ''}" data-action="nudge-all">${escapeHtml(nudgeLabel)}</button>`
    : '';
  const syncLabel = t('queue.action.syncThreads');
  const syncButton = `<button type="button" class="btn btn-ghost btn-icon" data-action="sync-threads" aria-label="${escapeHtml(syncLabel)}" title="${escapeHtml(syncLabel)}">${icon('refresh-cw')}</button>`;
  return `<div class="queue-context"><span class="queue-context-text">${escapeHtml(t(`queue.context.${model.activeLane}`, { days: DORMANT_AFTER_DAYS }))}</span>${nudgeButton}${syncButton}</div>`;
}

function renderAuthorChip(author, isActive) {
  const avatar = author.initials
    ? `<span class="avatar" aria-hidden="true">${escapeHtml(author.initials)}</span>`
    : '';
  return `<button type="button" class="filter-chip${isActive ? ' is-active' : ''}" data-action="author" data-author="${escapeHtml(author.username)}" aria-pressed="${isActive ? 'true' : 'false'}">${avatar}${escapeHtml(author.label)}</button>`;
}

function renderAuthorFilter(model, t) {
  if (model.authors.length === 0) return '';
  const everyone = renderAuthorChip(
    { username: '', label: t('queue.filter.everyone'), initials: '' },
    model.authorFilter === null,
  );
  const chips = model.authors
    .map((author) => renderAuthorChip(author, author.username === model.authorFilter))
    .join('');
  return `<div class="queue-context queue-filter"><span class="queue-filter-label">${escapeHtml(t('queue.filter.author'))}</span><div class="filter-chips">${everyone}${chips}</div></div>`;
}

function renderGrade(row, t) {
  const grade = row.outcome.grade;
  const title =
    row.outcome.verdict === null
      ? t('queue.grade.none')
      : t('queue.grade.title', {
          grade: grade ?? '—',
          verdict: t(`verdict.${row.outcome.verdict}`),
        });
  return `<span class="grade grade-${grade ?? 'none'}" title="${escapeHtml(title)}">${escapeHtml(grade ?? '—')}</span>`;
}

function renderRowAction(row, t, options) {
  const mrId = escapeHtml(row.id);
  if (row.lane === 'approve') {
    return `<a class="btn btn-primary" href="${approvalUrlOf(row.url, row.prefix)}" target="_blank" rel="noopener noreferrer" data-action="approve" title="${escapeHtml(t('queue.action.approveTitle'))}">${escapeHtml(t('queue.action.approve'))}</a>`;
  }
  if (row.lane === 'fix') {
    return `<button type="button" class="btn" data-action="followup" data-mr-id="${mrId}">${escapeHtml(t('queue.action.followup'))}</button>`;
  }
  if (row.lane === 'review') {
    const status =
      row.jobStatus === 'queued' ? t('queue.status.queued') : t('queue.status.running');
    return `<span class="queue-running"><span class="dot dot-live" aria-hidden="true"></span>${escapeHtml(status)}</span><button type="button" class="btn btn-ghost" data-action="cancel" data-job-id="${escapeHtml(row.jobId ?? '')}" data-mr-number="${row.mrNumber}">${escapeHtml(t('queue.action.cancel'))}</button>`;
  }
  const armed = options.armedNudge === row.id;
  return `<button type="button" class="btn${armed ? ' btn-primary' : ''}" data-action="nudge" data-mr-id="${mrId}">${escapeHtml(armed ? t('queue.action.confirmNudge') : t('queue.action.nudge'))}</button>`;
}

function renderRowMeta(row, t) {
  const reason = `<span class="queue-reason tone-${row.reason.tone}">${escapeHtml(t(row.reason.key, row.reason.params))}</span>`;
  const scope = row.scope ? `<span class="chip chip-mono">${escapeHtml(row.scope)}</span>` : '';
  const breaking = row.breaking
    ? `<span class="chip chip-danger">${escapeHtml(t('queue.chip.breaking'))}</span>`
    : '';
  const author = row.author
    ? `<span class="meta-item"><span class="avatar" aria-hidden="true">${escapeHtml(row.author.initials)}</span>${escapeHtml(row.author.label)}</span>`
    : `<span class="meta-item tone-none">${escapeHtml(t('queue.author.unknown'))}</span>`;
  const threadsLabel =
    row.threads.total === 0
      ? t('queue.threads.none')
      : row.threads.open === 0
        ? t('queue.threads.resolved', { total: row.threads.total })
        : t('queue.threads.open', { open: row.threads.open, total: row.threads.total });
  const threads = `<span class="meta-item tone-${row.threads.tone}">${icon('message-square')}${escapeHtml(threadsLabel)}</span>`;
  const age =
    row.lane === 'review'
      ? ''
      : `<span class="meta-item${row.idleDays > DORMANT_AFTER_DAYS ? ' tone-warn' : ''}" title="${escapeHtml(t('queue.age.title'))}">${icon('clock')}${escapeHtml(formatIdleAge(row.idleDays, t))}</span>`;
  return `<div class="queue-meta">${reason}${scope}${breaking}${author}${threads}${age}</div>`;
}

function renderExplainButton(row, t, options) {
  const isLoading = options.briefStatusById?.[row.id] === 'loading';
  const label = t('brief.explainRow', { number: `${row.prefix}${row.mrNumber}` });
  return `<button type="button" class="btn btn-ask" data-action="explain" data-mr-id="${escapeHtml(row.id)}" aria-label="${escapeHtml(label)}"${isLoading ? ' aria-busy="true"' : ''}>${icon(isLoading ? 'loader-circle' : 'circle-help', isLoading ? 'spinning' : '')}${escapeHtml(t('brief.explain'))}</button>`;
}

function renderRow(row, t, options) {
  const isSelected = row.id === options.selectedId;
  const openLabel = t('queue.action.open');
  return `<div class="queue-row${isSelected ? ' is-selected' : ''}" data-mr-id="${escapeHtml(row.id)}">
    <div class="queue-row-main">
      <button type="button" class="queue-row-title" data-action="select" data-mr-id="${escapeHtml(row.id)}"><span class="mr-number">${escapeHtml(row.prefix)}${row.mrNumber}</span>${escapeHtml(row.subject)}</button>
      ${renderRowMeta(row, t)}
    </div>
    <div class="queue-row-side">
      ${renderGrade(row, t)}
      ${renderExplainButton(row, t, options)}
      ${renderRowAction(row, t, options)}
      <a class="btn btn-ghost btn-icon" href="${sanitizeHttpUrl(row.url)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(openLabel)}" title="${escapeHtml(openLabel)}">${icon('external-link')}</a>
    </div>
  </div>`;
}

/**
 * @param {ReturnType<typeof import('./reviewQueue.js').buildReviewQueueModel>} model
 * @param {Translate} t
 * @param {{ selectedId?: string | null, armedNudge?: string | null, isLoading?: boolean, briefStatusById?: Record<string, string> }} [options]
 * @returns {string}
 */
export function renderReviewQueueHtml(model, t, options = {}) {
  const safeOptions = {
    selectedId: null,
    armedNudge: null,
    isLoading: false,
    briefStatusById: {},
    ...options,
  };
  const emptyKey = safeOptions.isLoading ? 'queue.loading' : 'queue.empty';
  const rows =
    model.rows.length === 0
      ? `<div class="queue-empty">${escapeHtml(t(emptyKey))}</div>`
      : model.rows.map((row) => renderRow(row, t, safeOptions)).join('');
  return `${renderLaneTabs(model, t)}${renderLaneContext(model, t, safeOptions)}${renderAuthorFilter(model, t)}<div class="queue-rows">${rows}</div>`;
}
