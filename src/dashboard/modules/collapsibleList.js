const DEFAULT_VISIBLE_COUNT = 5;

/** @type {Set<string>} */
const expandedLists = new Set();

/**
 * @param {string[]} renderedItems
 * @param {string} listId
 * @param {(key: string, params?: Record<string, string | number>) => string} translate
 * @param {number} [visibleCount]
 * @returns {string}
 */
export function renderCollapsibleList(
  renderedItems,
  listId,
  translate,
  visibleCount = DEFAULT_VISIBLE_COUNT,
) {
  if (renderedItems.length <= visibleCount) {
    return renderedItems.join('');
  }

  const isExpanded = expandedLists.has(listId);
  const hiddenCount = renderedItems.length - visibleCount;

  if (isExpanded) {
    const collapseLabel = translate('collapsible.showLess');
    return (
      renderedItems.join('') +
      '<button class="collapsible-toggle" onclick="toggleCollapsibleList(\'' +
      listId +
      '\')">' +
      '<i data-lucide="chevron-up"></i> ' +
      collapseLabel +
      '</button>'
    );
  }

  const visible = renderedItems.slice(0, visibleCount).join('');
  const hidden = renderedItems.slice(visibleCount).join('');
  const expandLabel = translate('collapsible.showMore', { count: hiddenCount });

  return (
    visible +
    '<div class="collapsible-hidden" id="collapsible-' +
    listId +
    '" style="display:none">' +
    hidden +
    '</div>' +
    '<button class="collapsible-toggle" onclick="toggleCollapsibleList(\'' +
    listId +
    '\')">' +
    '<i data-lucide="chevrons-down"></i> ' +
    expandLabel +
    '</button>'
  );
}

/**
 * @param {string} listId
 */
export function toggleCollapsibleList(listId) {
  const hiddenSection = document.getElementById(`collapsible-${listId}`);

  if (expandedLists.has(listId)) {
    expandedLists.delete(listId);
    if (hiddenSection) {
      hiddenSection.style.display = 'none';
    }
  } else {
    expandedLists.add(listId);
    if (hiddenSection) {
      hiddenSection.style.display = '';
    }
  }

  const button = hiddenSection
    ? hiddenSection.nextElementSibling
    : document.querySelector(`[onclick="toggleCollapsibleList('${listId}')"]`);

  if (button) {
    const icon = expandedLists.has(listId) ? 'chevron-up' : 'chevrons-down';
    const lucideEl = button.querySelector('[data-lucide]');
    if (lucideEl) {
      lucideEl.setAttribute('data-lucide', icon);
    }
  }

  if (typeof lucide !== 'undefined') lucide.createIcons();
}
