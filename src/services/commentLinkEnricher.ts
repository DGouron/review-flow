/**
 * Replace file:line references in a comment body with clickable GitLab/GitHub blob links.
 *
 * Pattern matches references like:
 *   file.py:42
 *   `file.py:42`
 *   (file.py:42)
 *   users/api.py:247
 *
 * Produces markdown links:
 *   [`file.py:42`](baseUrl/project/-/blob/sha/file.py#L42)
 *
 * Does NOT match:
 *   - URLs (http://localhost:8000, https://example.com:443)
 *   - Bare filenames without line numbers (docker-compose.yml)
 */

// File path must start with a word char, contain at least one dot (extension), then :lineNumber.
// The path must NOT start with // (to exclude URLs).
const FILE_LINE_PATTERN =
  /(?<prefix>[`(]?)(?<filePath>[\w][\w./-]*\.[\w]+):(?<line>\d+)(?<suffix>[`)]?)/g

export function enrichCommentWithLinks(
  body: string,
  baseUrl: string,
  projectPath: string,
  headSha: string,
): string {
  return body.replace(FILE_LINE_PATTERN, (match, prefix, filePath, line, suffix, offset) => {
    // Skip if preceded by :// (URL pattern like https://example.com:443)
    const beforeMatch = body.slice(Math.max(0, offset - 10), offset)
    if (/:\/{1,2}$/.test(beforeMatch) || /:\/{1,2}[\w.-]*$/.test(beforeMatch)) {
      return match
    }

    // Skip if the filePath portion doesn't look like a real file (must contain a dot for extension)
    // Already handled by regex, but double check for edge cases
    if (!filePath.includes('.')) {
      return match
    }

    const blobUrl = `${baseUrl}/${projectPath}/-/blob/${headSha}/${filePath}#L${line}`
    // When wrapped in backticks, the link markdown already includes backticks — don't double them
    const outerPrefix = prefix === '`' ? '' : prefix
    const outerSuffix = suffix === '`' ? '' : suffix
    return `${outerPrefix}[\`${filePath}:${line}\`](${blobUrl})${outerSuffix}`
  })
}
