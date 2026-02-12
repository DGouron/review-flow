import type { UseCase } from '../../shared/foundation/usecase.base.js';

interface DirEntry {
  name: string;
  isDirectory: () => boolean;
}

export interface DiscoverRepositoriesDependencies {
  existsSync: (path: string) => boolean;
  readdirSync: (path: string) => DirEntry[];
  getGitRemoteUrl: (localPath: string) => string | null;
}

export interface DiscoverRepositoriesInput {
  scanPaths: string[];
  maxDepth: number;
}

export interface DiscoveredRepository {
  name: string;
  localPath: string;
  platform: 'gitlab' | 'github' | null;
  remoteUrl: string | null;
  hasReviewConfig: boolean;
}

export interface DiscoverRepositoriesResult {
  repositories: DiscoveredRepository[];
  scannedPaths: string[];
  skippedPaths: string[];
}

const IGNORED_DIRS = new Set([
  'node_modules', '.git', '.vscode', '.idea', 'dist', 'build', '.cache',
]);

function detectPlatform(remoteUrl: string | null): 'gitlab' | 'github' | null {
  if (!remoteUrl) return null;
  const lower = remoteUrl.toLowerCase();
  if (lower.includes('gitlab')) return 'gitlab';
  if (lower.includes('github')) return 'github';
  return null;
}

export class DiscoverRepositoriesUseCase
  implements UseCase<DiscoverRepositoriesInput, DiscoverRepositoriesResult>
{
  constructor(private readonly deps: DiscoverRepositoriesDependencies) {}

  execute(input: DiscoverRepositoriesInput): DiscoverRepositoriesResult {
    const repositories: DiscoveredRepository[] = [];
    const scannedPaths: string[] = [];
    const skippedPaths: string[] = [];

    for (const scanPath of input.scanPaths) {
      if (!this.deps.existsSync(scanPath)) {
        skippedPaths.push(scanPath);
        continue;
      }
      scannedPaths.push(scanPath);
      this.scan(scanPath, 0, input.maxDepth, repositories);
    }

    return { repositories, scannedPaths, skippedPaths };
  }

  private scan(
    dirPath: string,
    currentDepth: number,
    maxDepth: number,
    results: DiscoveredRepository[],
  ): void {
    if (currentDepth >= maxDepth) return;

    let entries: DirEntry[];
    try {
      entries = this.deps.readdirSync(dirPath);
    } catch {
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('.') || IGNORED_DIRS.has(entry.name)) continue;

      const fullPath = `${dirPath}/${entry.name}`;
      const gitPath = `${fullPath}/.git`;

      if (this.deps.existsSync(gitPath)) {
        const remoteUrl = this.deps.getGitRemoteUrl(fullPath);
        const reviewConfigPath = `${fullPath}/.claude/reviews/config.json`;
        results.push({
          name: entry.name,
          localPath: fullPath,
          platform: detectPlatform(remoteUrl),
          remoteUrl,
          hasReviewConfig: this.deps.existsSync(reviewConfigPath),
        });
      } else {
        this.scan(fullPath, currentDepth + 1, maxDepth, results);
      }
    }
  }
}
