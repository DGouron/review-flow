/**
 * @param {string | null | undefined} text
 * @returns {string}
 */
export function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * @param {string | null | undefined} url
 * @returns {string}
 */
export function sanitizeHttpUrl(url) {
  if (!url) return '#';

  try {
    const fallbackOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
    const parsedUrl = new URL(url, fallbackOrigin);
    if (parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:') {
      return parsedUrl.href;
    }
  } catch {
    return '#';
  }

  return '#';
}

/**
 * @param {string} md
 * @returns {string}
 */
export function markdownToHtml(md) {
  const html = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>')
    .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
    .replace(/^---$/gm, '<hr>')
    .replace(/^\|(.+)\|$/gm, (match, content) => {
      const cells = content.split('|').map((/** @type {string} */ c) => c.trim());
      if (cells.every((/** @type {string} */ c) => c.match(/^-+$/))) return '';
      const cellTag = match.includes('---') ? 'th' : 'td';
      return '<tr>' + cells.map((/** @type {string} */ c) => `<${cellTag}>${c}</${cellTag}>`).join('') + '</tr>';
    })
    .replace(/(<tr>[\s\S]*?<\/tr>)+/g, '<table>$&</table>')
    .replace(/(<li>[\s\S]*?<\/li>)+/g, '<ul>$&</ul>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>');

  return '<p>' + html + '</p>';
}
