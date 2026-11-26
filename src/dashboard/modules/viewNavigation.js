/**
 * Dashboard module — the three top-level views (SPEC-230).
 */

import { escapeHtml } from './html.js';

export const DASHBOARD_VIEWS = ['queue', 'team', 'worktrees'];
const STORAGE_KEY_ACTIVE_VIEW = 'review-flow-active-view';

/**
 * @param {string | null | undefined} view
 * @returns {'queue' | 'team' | 'worktrees'}
 */
export function normalizeView(view) {
  return DASHBOARD_VIEWS.includes(view) ? view : 'queue';
}

/**
 * @param {string} activeView
 * @param {{ queue?: number, team?: number, worktrees?: number }} badges
 * @param {(key: string, params?: Record<string, string | number>) => string} t
 * @returns {string}
 */
export function renderViewNavHtml(activeView, badges, t) {
  return DASHBOARD_VIEWS.map((view) => {
    const isActive = view === activeView;
    const badge = badges[view] ? `<span class="count">${badges[view]}</span>` : '';
    return `<button type="button" class="nav-button${isActive ? ' is-active' : ''}" data-action="view" data-view="${view}" aria-current="${isActive ? 'page' : 'false'}">${escapeHtml(t(`shell.view.${view}`))}${badge}</button>`;
  }).join('');
}

/** @returns {'queue' | 'team' | 'worktrees'} */
export function readActiveView() {
  try {
    return normalizeView(localStorage.getItem(STORAGE_KEY_ACTIVE_VIEW));
  } catch {
    return 'queue';
  }
}

/** @param {string} view */
export function writeActiveView(view) {
  try {
    localStorage.setItem(STORAGE_KEY_ACTIVE_VIEW, normalizeView(view));
  } catch {
    // Storage may be unavailable (private mode); the view simply is not remembered.
  }
}
