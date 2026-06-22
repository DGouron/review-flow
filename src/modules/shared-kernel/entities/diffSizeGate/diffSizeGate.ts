export type ChangedFile = {
  path: string;
  additions: number;
  deletions: number;
};

interface DiffSizeGateInput {
  files: ChangedFile[];
  budget: number;
}

interface DiffSizeGateResult {
  oversized: boolean;
  countedLines: number;
  budget: number;
}

const EXCLUDED_BASENAMES = new Set([
  'package.json',
  'yarn.lock',
  'package-lock.json',
  'pnpm-lock.yaml',
]);

function basename(path: string): string {
  return path.split('/').pop() ?? path;
}

export function evaluateDiffSizeGate(input: DiffSizeGateInput): DiffSizeGateResult {
  const countedLines = input.files
    .filter((file) => !EXCLUDED_BASENAMES.has(basename(file.path)))
    .reduce((total, file) => total + file.additions + file.deletions, 0);

  return {
    oversized: countedLines > input.budget,
    countedLines,
    budget: input.budget,
  };
}
