import { RetentionPolicy } from '@/modules/data-lifecycle/entities/cleanup/retentionPolicy.valueObject.js';
import type { ReviewLogFileGateway } from '@/modules/data-lifecycle/entities/reviewLog/reviewLogFile.gateway.js';
import type { ReviewFileGateway } from '@/modules/review-execution/entities/review/reviewFile.gateway.js';

export interface CleanupResult {
  deletedReviewFiles: string[];
  deletedLogFiles: string[];
  totalDeletedCount: number;
}

export interface CleanupDependencies {
  reviewFileGateway: ReviewFileGateway;
  reviewLogFileGateway: ReviewLogFileGateway;
}

export async function cleanupExpiredReviews(
  projectPath: string,
  retentionDays: number,
  dependencies: CleanupDependencies,
  now: Date = new Date(),
): Promise<CleanupResult> {
  const { reviewFileGateway, reviewLogFileGateway } = dependencies;
  const retentionPolicy = RetentionPolicy.create(retentionDays);

  const deletedReviewFiles = await deleteExpiredReviewFiles(
    projectPath,
    retentionPolicy,
    reviewFileGateway,
    now,
  );

  const deletedLogFiles = await deleteExpiredLogFiles(
    projectPath,
    retentionPolicy,
    reviewLogFileGateway,
    now,
  );

  return {
    deletedReviewFiles,
    deletedLogFiles,
    totalDeletedCount: deletedReviewFiles.length + deletedLogFiles.length,
  };
}

async function deleteExpiredReviewFiles(
  projectPath: string,
  retentionPolicy: RetentionPolicy,
  reviewFileGateway: ReviewFileGateway,
  now: Date,
): Promise<string[]> {
  const reviews = await reviewFileGateway.listReviews(projectPath);
  const deletedFiles: string[] = [];

  for (const review of reviews) {
    const fileDate = new Date(review.date);
    if (retentionPolicy.isExpired(fileDate, now)) {
      const deleted = await reviewFileGateway.deleteReview(projectPath, review.filename);
      if (deleted) {
        deletedFiles.push(review.filename);
      }
    }
  }

  return deletedFiles;
}

async function deleteExpiredLogFiles(
  projectPath: string,
  retentionPolicy: RetentionPolicy,
  reviewLogFileGateway: ReviewLogFileGateway,
  now: Date,
): Promise<string[]> {
  const logFiles = await reviewLogFileGateway.listLogFiles(projectPath);
  const deletedFiles: string[] = [];

  for (const logFile of logFiles) {
    const fileDate = new Date(logFile.mtime);
    if (retentionPolicy.isExpired(fileDate, now)) {
      const deleted = await reviewLogFileGateway.deleteLogFile(projectPath, logFile.filename);
      if (deleted) {
        deletedFiles.push(logFile.filename);
      }
    }
  }

  return deletedFiles;
}
