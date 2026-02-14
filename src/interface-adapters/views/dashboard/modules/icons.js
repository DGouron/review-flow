const agentIconNames = {
  pending: 'clock',
  running: 'loader',
  completed: 'check',
  failed: 'x',
};

/**
 * @param {string} status
 * @returns {string}
 */
export function getAgentIcon(status) {
  return `<i data-lucide="${agentIconNames[status] || 'help-circle'}"></i>`;
}

/**
 * @param {string} name
 * @param {string} [className]
 * @returns {string}
 */
export function icon(name, className = '') {
  return `<i data-lucide="${name}" class="${className}"></i>`;
}

export function refreshIcons() {
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
}
