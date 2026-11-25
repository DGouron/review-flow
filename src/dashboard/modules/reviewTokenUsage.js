/**
 * Dashboard module — the "Usage" tab of a review report: one row per Claude session.
 * Humble object: pure functions, no global state, no direct DOM access.
 */

import { escapeHtml } from './html.js';
import { formatTokenCount } from './tokenUsage.js';

const REVIEW_TABS = ['report', 'usage'];

/**
 * @param {string} domId
 * @param {'report' | 'usage'} activeTab
 * @param {(key: string, params?: Record<string, string | number>) => string} t
 * @returns {string}
 */
export function renderReviewTabs(domId, activeTab, t) {
  const buttons = REVIEW_TABS.map((tab) => {
    const isActive = tab === activeTab;
    return `<button type="button" class="review-tab${isActive ? ' is-active' : ''}" data-review-tab="${tab}" data-review-dom-id="${escapeHtml(domId)}" onclick="switchReviewTab(this)" role="tab" aria-selected="${isActive}">${escapeHtml(t(`reviewTab.${tab}`))}</button>`;
  }).join('');
  return `<nav class="review-tab-bar" role="tablist">${buttons}</nav>`;
}

const minutesCell = (minutes) => (minutes === null ? '—' : `${minutes} min`);
const countCell = (count) => (count === null ? '—' : String(count));

function renderRow(row, label) {
  return `
    <tr>
      <td>${escapeHtml(label)}</td>
      <td>${minutesCell(row.durationMinutes)}</td>
      <td>${countCell(row.turns)}</td>
      <td>${formatTokenCount(row.cacheReadTokens)}</td>
      <td>${formatTokenCount(row.cacheWriteTokens)}</td>
      <td>${formatTokenCount(row.outputTokens)}</td>
      <td>${formatTokenCount(row.inputTokens)}</td>
      <td>${escapeHtml(row.costUsd)}</td>
    </tr>`;
}

function renderSignals(viewModel, t) {
  const signals = [];
  if (viewModel.cacheReadSharePercent !== null) {
    signals.push(t('reviewUsage.signal.cacheRead', { percent: viewModel.cacheReadSharePercent }));
  }
  if (viewModel.costVsProjectMedian !== null) {
    signals.push(t('reviewUsage.signal.projectMedian', { ratio: viewModel.costVsProjectMedian }));
  }
  if (signals.length === 0) return '';
  return `<ul class="review-usage-signals">${signals.map((signal) => `<li>${escapeHtml(signal)}</li>`).join('')}</ul>`;
}

/**
 * @param {import('../../modules/token-accounting/interface-adapters/presenters/reviewTokenUsage.presenter.js').ReviewTokenUsageViewModel} viewModel
 * @param {(key: string, params?: Record<string, string | number>) => string} t
 * @returns {string}
 */
export function renderReviewTokenUsage(viewModel, t) {
  if (viewModel.isEmpty) {
    return `<div class="empty-state">${escapeHtml(t('reviewUsage.empty'))}</div>`;
  }

  const headers = [
    'session',
    'duration',
    'turns',
    'cacheRead',
    'cacheWrite',
    'output',
    'input',
    'cost',
  ]
    .map((column) => `<th>${escapeHtml(t(`reviewUsage.column.${column}`))}</th>`)
    .join('');
  const rows = viewModel.sessions.map((row) => renderRow(row, row.model)).join('');

  return `
    <div class="review-usage">
      <table class="review-usage-table">
        <thead><tr>${headers}</tr></thead>
        <tbody>${rows}</tbody>
        <tfoot>${renderRow(viewModel.total, t('reviewUsage.total'))}</tfoot>
      </table>
      ${renderSignals(viewModel, t)}
    </div>`;
}

/**
 * @param {string} filename
 * @param {typeof fetch} [fetchImpl]  injectable for tests
 */
export async function fetchReviewTokenUsage(filename, fetchImpl = fetch) {
  const response = await fetchImpl(`/api/token-usage/review/${encodeURIComponent(filename)}`);
  if (!response.ok) {
    throw new Error(`Review token usage request failed: ${response.status}`);
  }
  return response.json();
}
