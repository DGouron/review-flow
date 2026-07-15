import type { TrackedMr } from '@/modules/tracking/entities/tracking/trackedMr.js';

export interface SizeBlockEntry {
  mr: TrackedMr;
  projectName: string;
  projectPath: string;
}

export interface SizeBlockListPresenterInput {
  entries: SizeBlockEntry[];
}

export interface SizeBlockViewModel {
  mrId: string;
  mrNumber: number;
  title: string;
  url: string;
  platform: 'gitlab' | 'github';
  projectName: string;
  projectPath: string;
  countedLines: number;
  budget: number;
  blockedAt: string;
}

export interface SizeBlockListViewModel {
  blocks: SizeBlockViewModel[];
  isEmpty: boolean;
}

function toViewModel(entry: SizeBlockEntry): SizeBlockViewModel | null {
  const { sizeBlock } = entry.mr;
  if (sizeBlock === null) return null;

  return {
    mrId: entry.mr.id,
    mrNumber: entry.mr.mrNumber,
    title: entry.mr.title,
    url: entry.mr.url,
    platform: entry.mr.platform,
    projectName: entry.projectName,
    projectPath: entry.projectPath,
    countedLines: sizeBlock.countedLines,
    budget: sizeBlock.budget,
    blockedAt: sizeBlock.blockedAt,
  };
}

export class SizeBlockListPresenter {
  present(input: SizeBlockListPresenterInput): SizeBlockListViewModel {
    const blocks = input.entries
      .map(toViewModel)
      .filter((block): block is SizeBlockViewModel => block !== null);

    return { blocks, isEmpty: blocks.length === 0 };
  }
}
