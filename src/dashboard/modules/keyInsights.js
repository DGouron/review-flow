/**
 * Dashboard module — key insight cards humble object (SPEC-205).
 * Pure functions, no global state, no DOM access, no fetch. All gating,
 * ranking and text generation live server-side in the deriver / presenter;
 * this module only renders the provided view-model as HTML.
 *
 * Visual DNA: "Agentic OS" — see project_agentic_os_design_dna.md.
 */

import { escapeHtml } from './html.js';

const EMPTY_MESSAGE = 'Aucun insight disponible pour le moment';

/**
 * @typedef {Object} KeyInsightCard
 * @property {string} title
 * @property {string} body
 */

/**
 * @typedef {Object} KeyInsightsViewModel
 * @property {KeyInsightCard[]} cards
 * @property {boolean} isEmpty
 * @property {string} emptyMessage
 */

/**
 * @param {KeyInsightCard} card
 * @returns {string}
 */
function renderCard(card) {
  return `
    <div class="key-insight-card">
      <div class="key-insight-card-title">${escapeHtml(card.title)}</div>
      <div class="key-insight-card-body">${escapeHtml(card.body)}</div>
    </div>
  `.trim();
}

/**
 * Renders the key insights panel from a server-provided view-model. Tolerates a
 * missing or malformed payload by falling back to the French empty state — the
 * server is a boundary, so this guards against partial fetches or stale deploys.
 *
 * @param {unknown} viewModel
 * @returns {string}
 */
export function renderKeyInsightsHtml(viewModel) {
  const source =
    viewModel && typeof viewModel === 'object'
      ? /** @type {Record<string, unknown>} */ (viewModel)
      : {};
  const cards = Array.isArray(source.cards) ? source.cards : [];
  const emptyMessage =
    typeof source.emptyMessage === 'string' ? source.emptyMessage : EMPTY_MESSAGE;

  const body =
    cards.length === 0
      ? `<div class="key-insights-empty">${escapeHtml(emptyMessage)}</div>`
      : cards.map((card) => renderCard(/** @type {KeyInsightCard} */ (card))).join('');

  return `
    <section class="key-insights-panel" data-section="key-insights">
      <div class="key-insights-title">// KEY INSIGHTS</div>
      ${body}
    </section>
  `.trim();
}
