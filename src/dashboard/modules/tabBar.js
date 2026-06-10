/**
 * Dashboard module — tab bar humble object (SPEC-91).
 * Pure functions, no global state, no DOM access in render helpers.
 * localStorage is touched only by readActiveTab / writeActiveTab.
 *
 * Visual DNA: "Agentic OS" — see project_agentic_os_design_dna.md.
 */

import { STORAGE_KEY_ACTIVE_TAB } from './constants.js';
import { escapeHtml } from './html.js';

const OVERVIEW_TAB_ID = 'overview';
const OVERVIEW_TAB_LABEL = 'Overview';

/**
 * @typedef {Object} TabBarRepositoryInput
 * @property {string} name
 * @property {string} localPath
 * @property {boolean} enabled
 */

/**
 * @typedef {Object} TabBarBuildInput
 * @property {TabBarRepositoryInput[]} repositories
 * @property {string | null} activeTabId
 */

/**
 * @typedef {Object} TabBarTabViewModel
 * @property {string} id
 * @property {string} label
 * @property {boolean} isActive
 * @property {boolean} enabled
 */

/**
 * @typedef {Object} TabBarViewModel
 * @property {TabBarTabViewModel[]} tabs
 */

/**
 * @param {TabBarBuildInput} input
 * @returns {TabBarViewModel}
 */
export function buildTabBarModel(input) {
  const repositories = Array.isArray(input.repositories) ? input.repositories : [];
  const projectTabIds = new Set(repositories.map((repository) => repository.localPath));
  const activeTabIdMatchesProject =
    input.activeTabId !== null && projectTabIds.has(input.activeTabId);
  const effectiveActiveId = activeTabIdMatchesProject ? input.activeTabId : OVERVIEW_TAB_ID;

  const overviewTab = {
    id: OVERVIEW_TAB_ID,
    label: OVERVIEW_TAB_LABEL,
    isActive: effectiveActiveId === OVERVIEW_TAB_ID,
    enabled: true,
  };
  const projectTabs = repositories.map((repository) => ({
    id: repository.localPath,
    label: repository.name,
    isActive: effectiveActiveId === repository.localPath,
    enabled: repository.enabled !== false,
  }));

  return { tabs: [overviewTab, ...projectTabs] };
}

/**
 * @param {TabBarViewModel} viewModel
 * @returns {string}
 */
export function renderTabBarHtml(viewModel) {
  const buttons = viewModel.tabs
    .map((tab) => {
      const activeClass = tab.isActive ? ' is-active' : '';
      const enabledAttribute = tab.enabled ? 'true' : 'false';
      return `<button type="button" class="dashboard-tab${activeClass}" data-tab-id="${escapeHtml(tab.id)}" data-enabled="${enabledAttribute}" role="tab" aria-selected="${tab.isActive ? 'true' : 'false'}">${escapeHtml(tab.label)}</button>`;
    })
    .join('');
  return `<nav class="dashboard-tab-bar" role="tablist">${buttons}</nav>`;
}

/**
 * @returns {string | null}
 */
export function readActiveTab() {
  try {
    return localStorage.getItem(STORAGE_KEY_ACTIVE_TAB);
  } catch {
    return null;
  }
}

/**
 * @param {string} tabId
 * @returns {void}
 */
export function writeActiveTab(tabId) {
  try {
    localStorage.setItem(STORAGE_KEY_ACTIVE_TAB, tabId);
  } catch {
    // localStorage may be unavailable (private mode, server-side rendering); ignore.
  }
}
