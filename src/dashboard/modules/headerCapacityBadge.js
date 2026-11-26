/**
 * Dashboard module — Header capacity badge (SPEC-186).
 *
 * Pure functions, no global state, no DOM access. Builds a viewmodel for the
 * "running / total" reviews badge displayed in the dashboard header, and
 * renders the corresponding HTML snippet. The badge surfaces the total
 * parallelizable review capacity across all projects.
 */

import { escapeHtml } from './html.js';
import { t } from './i18n.js';

/**
 * @typedef {Object} HeaderCapacityInput
 * @property {number} running
 * @property {number} max
 */

/**
 * @typedef {Object} HeaderCapacityViewModel
 * @property {number} runningCount
 * @property {number} totalCapacity
 * @property {string} label
 * @property {boolean} isSaturated
 */

/**
 * @param {HeaderCapacityInput} input
 * @returns {HeaderCapacityViewModel}
 */
export function buildHeaderCapacityViewModel(input) {
  const running = Number.isFinite(input.running) ? input.running : 0;
  const max = Number.isFinite(input.max) ? input.max : 0;
  return {
    runningCount: running,
    totalCapacity: max,
    label: `${running} / ${max}`,
    isSaturated: max > 0 && running >= max,
  };
}

/**
 * @param {HeaderCapacityViewModel} viewModel
 * @returns {string}
 */
export function renderHeaderCapacityBadgeHtml(viewModel) {
  const saturatedClass = viewModel.isSaturated ? ' header-capacity-badge--saturated' : '';
  const titleText = viewModel.isSaturated
    ? t('shell.capacity.saturated')
    : t('shell.capacity.title');
  return `<span id="header-capacity-badge" class="pill pill-static header-capacity-badge${saturatedClass}" title="${escapeHtml(titleText)}"><span class="mono">${viewModel.runningCount}/${viewModel.totalCapacity}</span><span class="pill-hint">${escapeHtml(t('shell.capacity.parallel'))}</span></span>`;
}
