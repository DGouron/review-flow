const SSH_REMOTE = /^[^@]+@[^:]+:(.+)$/;
const HTTP_REMOTE = /^https?:\/\/[^/]+\/(.+)$/;

export function resolveProjectIdentifier(remoteUrl: string): string | null {
  const match = SSH_REMOTE.exec(remoteUrl) ?? HTTP_REMOTE.exec(remoteUrl);
  if (!match) {
    return null;
  }

  const path = match[1].replace(/\.git$/, '');
  const segments = path.split('/').filter((segment) => segment.length > 0);

  return segments.length >= 2 ? segments.join('/') : null;
}
