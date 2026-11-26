export type ReviewRequestOverview = {
  title: string;
  description: string;
  headSha: string;
};

export interface ReviewRequestOverviewFetchGateway {
  fetchOverview(projectPath: string, mergeRequestNumber: number): ReviewRequestOverview | null;
}
