/**
 * Dashboard module — pull request detail in the side panel (SPEC-230).
 *
 * The panel helps to understand a pull request (verdict, counts, next step);
 * the queue row carries the main gesture.
 */

import { escapeHtml, sanitizeHttpUrl } from './html.js';
import { icon } from './icons.js';
import { formatIdleAge } from './reviewQueueView.js';

function nextKeyOf(row, mergeRequest) {
  if (row.lane === 'review') return 'panel.next.review';
  if (row.lane === 'dormant') return 'panel.next.dormant';
  if (row.lane === 'fix') {
    return mergeRequest?.autoFollowup === false ? 'panel.next.fixManual' : 'panel.next.fix';
  }
  return Number(mergeRequest?.totalWarnings) > 0
    ? 'panel.next.approveWarnings'
    : 'panel.next.approve';
}

function countOf(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/**
 * @param {Record<string, any>} row a row of the review queue model
 * @param {Record<string, any> | null} mergeRequest the tracked merge request, when tracked
 */
export function buildPrDetailModel(row, mergeRequest) {
  const isTracked = mergeRequest !== null;
  return {
    id: row.id,
    lane: row.lane,
    isTracked,
    mrNumber: row.mrNumber,
    prefix: row.prefix,
    subject: row.subject,
    scope: row.scope ?? null,
    url: row.url,
    author: row.author,
    idleDays: row.idleDays,
    grade: row.outcome.grade,
    verdict: row.outcome.verdict,
    reviews: countOf(mergeRequest?.totalReviews),
    followups: countOf(mergeRequest?.totalFollowups),
    blocking: countOf(mergeRequest?.totalBlocking),
    warnings: countOf(mergeRequest?.totalWarnings),
    openThreads: row.threads.open,
    totalThreads: row.threads.total,
    nextKey: nextKeyOf(row, mergeRequest),
    requestedBy:
      mergeRequest?.assignment?.displayName || mergeRequest?.assignment?.username || null,
    branches: isTracked
      ? {
          source: String(mergeRequest.sourceBranch ?? ''),
          target: String(mergeRequest.targetBranch ?? ''),
        }
      : null,
    autoFollowup: mergeRequest?.autoFollowup !== false,
    jobId: row.jobId ?? null,
  };
}

function renderVerdict(model, t) {
  const verdictLabel =
    model.verdict === null ? t('panel.noVerdict') : t(`verdict.${model.verdict}`);
  return `<div class="verdict-card">
    <span class="grade grade-lg grade-${model.grade ?? 'none'}">${escapeHtml(model.grade ?? '—')}</span>
    <div><div class="verdict-title">${escapeHtml(verdictLabel)}</div><div class="verdict-sub">${escapeHtml(t('panel.passes', { reviews: model.reviews, followups: model.followups }))}</div></div>
  </div>`;
}

function renderStats(model, t) {
  const stats = [
    ['panel.stat.blocking', model.blocking],
    ['panel.stat.warnings', model.warnings],
    ['panel.stat.openThreads', model.openThreads],
    ['panel.stat.totalThreads', model.totalThreads],
  ];
  const cells = stats
    .map(
      ([key, value]) =>
        `<div class="stat"><div class="stat-label">${escapeHtml(t(key))}</div><div class="stat-value mono">${value}</div></div>`,
    )
    .join('');
  return `<div class="stats-grid">${cells}</div>`;
}

function renderActions(model, t) {
  const mrId = escapeHtml(model.id);
  const actions = [];
  if (model.lane === 'fix' || (model.lane === 'approve' && model.warnings > 0)) {
    actions.push(
      `<button type="button" class="btn" data-action="followup" data-mr-id="${mrId}">${escapeHtml(t('queue.action.followup'))}</button>`,
    );
  }
  if (model.isTracked) {
    actions.push(
      `<button type="button" class="btn btn-ghost" data-action="mark-merged" data-mr-id="${mrId}" data-mr-number="${model.mrNumber}">${escapeHtml(t('panel.markMerged'))}</button>`,
    );
    actions.push(
      `<button type="button" class="btn btn-ghost" data-action="open-history" data-mr-id="${mrId}">${icon('history')}${escapeHtml(t('panel.history'))}</button>`,
    );
  }
  actions.push(
    `<a class="btn btn-ghost" href="${sanitizeHttpUrl(model.url)}" target="_blank" rel="noopener noreferrer">${icon('external-link')}${escapeHtml(t('queue.action.open'))}</a>`,
  );
  const toggle = model.isTracked
    ? `<label class="toggle"><input type="checkbox" data-action="toggle-auto-followup" data-mr-id="${mrId}"${model.autoFollowup ? ' checked' : ''}> ${escapeHtml(t('panel.autoFollowup'))}</label>`
    : '';
  return `<div class="panel-actions">${actions.join('')}</div>${toggle}`;
}

function renderMeta(model, t) {
  const author = model.author
    ? `<span class="meta-item"><span class="avatar avatar-lg" aria-hidden="true">${escapeHtml(model.author.initials)}</span>${escapeHtml(model.author.label)}</span>`
    : `<span class="meta-item tone-none">${escapeHtml(t('queue.author.unknown'))}</span>`;
  const scope = model.scope ? `<span class="chip chip-mono">${escapeHtml(model.scope)}</span>` : '';
  const activity =
    model.lane === 'review'
      ? ''
      : `<span class="meta-item">${escapeHtml(t('panel.lastActivity', { age: formatIdleAge(model.idleDays, t) }))}</span>`;
  const branches = model.branches
    ? `<span class="meta-item mono">${escapeHtml(t('panel.branches', model.branches))}</span>`
    : '';
  const requestedBy = model.requestedBy
    ? `<span class="meta-item">${escapeHtml(t('panel.requestedBy', { name: model.requestedBy }))}</span>`
    : '';
  return `<div class="queue-meta">${author}${scope}${activity}</div><div class="queue-meta">${branches}${requestedBy}</div>`;
}

/**
 * @param {ReturnType<typeof buildPrDetailModel> | null} model
 * @param {(key: string, params?: Record<string, string | number>) => string} t
 * @returns {string}
 */
export function renderPrDetailHtml(model, t) {
  if (model === null) return `<div class="panel-empty">${escapeHtml(t('panel.empty'))}</div>`;
  return `<div class="panel-body">
  <div class="panel-head"><div class="panel-title"><span class="mr-number">${escapeHtml(model.prefix)}${model.mrNumber}</span>${escapeHtml(model.subject)}</div><button type="button" class="btn btn-ghost btn-icon" data-action="close-detail" aria-label="${escapeHtml(t('panel.close'))}">${icon('x')}</button></div>
  ${renderMeta(model, t)}
  <div id="pr-brief-slot" class="pr-brief-slot"></div>
  ${renderVerdict(model, t)}
  ${renderStats(model, t)}
  <div class="next-step"><div class="next-step-label">${escapeHtml(t('panel.next'))}</div><div class="next-step-value">${escapeHtml(t(model.nextKey))}</div></div>
  ${renderActions(model, t)}
</div>`;
}

/**
 * @param {{ activeTab: 'pr' | 'ember', selection: { prefix: string, mrNumber: number } | null }} state
 * @param {(key: string, params?: Record<string, string | number>) => string} t
 * @returns {string}
 */
export function renderPanelTabsHtml(state, t) {
  const hasSelection = state.selection !== null;
  const prLabel = hasSelection
    ? t('panel.tab.prNumber', { prefix: state.selection.prefix, number: state.selection.mrNumber })
    : t('panel.tab.pr');
  const prActive = state.activeTab === 'pr' && hasSelection;
  return `<button type="button" role="tab" class="segment${prActive ? ' is-active' : ''}" data-action="panel-tab" data-tab="pr" aria-selected="${prActive ? 'true' : 'false'}"${hasSelection ? '' : ' disabled'}>${escapeHtml(prLabel)}</button><button type="button" role="tab" class="segment${prActive ? '' : ' is-active'}" data-action="panel-tab" data-tab="ember" aria-selected="${prActive ? 'false' : 'true'}">${icon('gem')}${escapeHtml(t('panel.tab.ember'))}</button>`;
}
