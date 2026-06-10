import {
  writeFileSync,
  readFileSync,
  existsSync,
  mkdirSync,
  unlinkSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { join, dirname } from 'node:path';

import type { ReviewContextAction } from '@/modules/review-execution/entities/reviewAction/reviewAction.js';
import type {
  ReviewContextGateway,
  UpdateResult,
} from '@/modules/review-execution/entities/reviewContext/reviewContext.gateway.js';
import { reviewContextGuard } from '@/modules/review-execution/entities/reviewContext/reviewContext.guard.js';
import type {
  CreateReviewContextInput,
  CreateReviewContextResult,
  DeleteReviewContextResult,
  ReviewContext,
  ReviewContextProgress,
} from '@/modules/review-execution/entities/reviewContext/reviewContext.js';
import type { ReviewContextResult } from '@/modules/review-execution/entities/reviewContext/reviewContextResult.schema.js';
import { buildAgentInstructions } from '@/modules/review-execution/services/agentInstructionsBuilder.js';

export class ReviewContextFileSystemGateway implements ReviewContextGateway {
  getFilePath(localPath: string, mergeRequestId: string): string {
    return join(localPath, '.claude', 'reviews', 'logs', `${mergeRequestId}.json`);
  }

  create(input: CreateReviewContextInput): CreateReviewContextResult {
    const filePath = this.getFilePath(input.localPath, input.mergeRequestId);

    mkdirSync(dirname(filePath), { recursive: true });

    const agentInstructions = buildAgentInstructions(filePath);

    const content: ReviewContext = {
      version: '1.0',
      mergeRequestId: input.mergeRequestId,
      platform: input.platform,
      projectPath: input.projectPath,
      mergeRequestNumber: input.mergeRequestNumber,
      createdAt: new Date().toISOString(),
      threads: input.threads ?? [],
      actions: [],
      progress: {
        phase: 'pending',
        currentStep: null,
        ...(input.agents ? { agents: input.agents } : {}),
      },
      agentInstructions,
      ...(input.diffMetadata ? { diffMetadata: input.diffMetadata } : {}),
    };

    writeFileSync(filePath, JSON.stringify(content, null, 2));

    return { success: true, filePath };
  }

  delete(localPath: string, mergeRequestId: string): DeleteReviewContextResult {
    const filePath = this.getFilePath(localPath, mergeRequestId);

    if (!existsSync(filePath)) {
      return { success: true, deleted: false };
    }

    unlinkSync(filePath);
    return { success: true, deleted: true };
  }

  read(localPath: string, mergeRequestId: string): ReviewContext | null {
    const filePath = this.getFilePath(localPath, mergeRequestId);

    if (!existsSync(filePath)) {
      return null;
    }

    const content = readFileSync(filePath, 'utf-8');
    const validation = reviewContextGuard.safeParse(JSON.parse(content));
    return validation.success ? validation.data : null;
  }

  exists(localPath: string, mergeRequestId: string): boolean {
    const filePath = this.getFilePath(localPath, mergeRequestId);
    return existsSync(filePath);
  }

  appendAction(
    localPath: string,
    mergeRequestId: string,
    action: ReviewContextAction,
  ): UpdateResult {
    const context = this.read(localPath, mergeRequestId);
    if (!context) {
      return { success: false };
    }

    context.actions.push(action);
    const filePath = this.getFilePath(localPath, mergeRequestId);
    writeFileSync(filePath, JSON.stringify(context, null, 2));

    return { success: true };
  }

  updateProgress(
    localPath: string,
    mergeRequestId: string,
    progress: ReviewContextProgress,
  ): UpdateResult {
    const context = this.read(localPath, mergeRequestId);
    if (!context) {
      return { success: false };
    }

    context.progress = {
      ...progress,
      agents: progress.agents ?? context.progress.agents,
      updatedAt: new Date().toISOString(),
    };
    const filePath = this.getFilePath(localPath, mergeRequestId);
    writeFileSync(filePath, JSON.stringify(context, null, 2));

    return { success: true };
  }

  setResult(localPath: string, mergeRequestId: string, result: ReviewContextResult): UpdateResult {
    const context = this.read(localPath, mergeRequestId);
    if (!context) {
      return { success: false };
    }

    context.result = result;
    const filePath = this.getFilePath(localPath, mergeRequestId);
    writeFileSync(filePath, JSON.stringify(context, null, 2));

    return { success: true };
  }

  listAll(localPath: string): ReviewContext[] {
    const logsDir = join(localPath, '.claude', 'reviews', 'logs');
    if (!existsSync(logsDir)) {
      return [];
    }
    return collectJsonFiles(logsDir).flatMap((path) => {
      try {
        const validation = reviewContextGuard.safeParse(JSON.parse(readFileSync(path, 'utf-8')));
        if (!validation.success) {
          process.stderr.write(
            `[reviewContextGateway] invalid review context skipped at ${path}: ${validation.error.message}\n`,
          );
          return [];
        }
        return [validation.data];
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        process.stderr.write(
          `[reviewContextGateway] malformed JSON skipped at ${path}: ${message}\n`,
        );
        return [];
      }
    });
  }
}

function collectJsonFiles(directory: string): string[] {
  const entries = readdirSync(directory);
  return entries.flatMap((entry) => {
    const fullPath = join(directory, entry);
    if (statSync(fullPath).isDirectory()) {
      return collectJsonFiles(fullPath);
    }
    return entry.endsWith('.json') ? [fullPath] : [];
  });
}
