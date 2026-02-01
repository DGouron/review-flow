export interface ReviewFileInfo {
  filename: string;
  path: string;
  date: string;
  mrNumber: string;
  type: string;
  size: number;
  mtime: string;
}

export interface ReviewFileGateway {
  listReviews(projectPath: string): Promise<ReviewFileInfo[]>;
  readReview(projectPath: string, filename: string): Promise<string | null>;
  deleteReview(projectPath: string, filename: string): Promise<boolean>;
  reviewExists(projectPath: string, filename: string): Promise<boolean>;
  getReviewsDirectory(projectPath: string): string;
}
