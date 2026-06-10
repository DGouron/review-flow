/**
 * @typedef {{ kind: 'overview' } | { kind: 'project', localPath: string, projectName: string, aliases?: string[] }} CardScope
 */

/**
 * @param {object} input
 * @param {Array<{ project: string, status: string }>} input.activeReviews
 * @param {Array<unknown>} input.reviewFiles
 * @param {CardScope} input.scope
 * @returns {{ running: number, queued: number, completed: number, markerLabel: string, markerKind: 'overview'|'project' }}
 */
export function computeCardCounters(input) {
  const { activeReviews, reviewFiles, scope } = input;

  const scoped =
    scope.kind === 'project'
      ? activeReviews.filter((review) => matchesProjectScope(review.project, scope))
      : activeReviews;

  const running = scoped.filter((review) => review.status === 'running').length;
  const queued = scoped.filter((review) => review.status === 'queued').length;
  const completed = reviewFiles.length;

  if (scope.kind === 'overview') {
    return {
      running,
      queued,
      completed,
      markerLabel: 'TOUS LES PROJETS',
      markerKind: 'overview',
    };
  }

  return {
    running,
    queued,
    completed,
    markerLabel: scope.projectName.toUpperCase(),
    markerKind: 'project',
  };
}

/**
 * @param {string} reviewProject
 * @param {{ localPath: string, aliases?: string[] }} scope
 * @returns {boolean}
 */
function matchesProjectScope(reviewProject, scope) {
  if (reviewProject === scope.localPath) return true;
  if (Array.isArray(scope.aliases) && scope.aliases.includes(reviewProject)) return true;
  return false;
}

/**
 * Extracts a GitHub-style `owner/repo` slug from a git remote URL.
 * Returns null when the URL does not look like a GitHub remote.
 *
 * Accepts:
 *   - https://github.com/owner/repo.git
 *   - https://github.com/owner/repo
 *   - git@github.com:owner/repo.git
 *   - ssh://git@github.com/owner/repo.git
 *
 * @param {string | undefined | null} remoteUrl
 * @returns {string | null}
 */
export function extractGithubSlug(remoteUrl) {
  if (typeof remoteUrl !== 'string' || remoteUrl.length === 0) return null;
  const trimmed = remoteUrl.trim().replace(/\.git$/, '');
  const httpsMatch = trimmed.match(/github\.com\/([^/]+)\/([^/]+)$/);
  if (httpsMatch) return `${httpsMatch[1]}/${httpsMatch[2]}`;
  const sshMatch = trimmed.match(/github\.com:([^/]+)\/([^/]+)$/);
  if (sshMatch) return `${sshMatch[1]}/${sshMatch[2]}`;
  return null;
}
